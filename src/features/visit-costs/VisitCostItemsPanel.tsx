import { useEffect, useMemo, useState } from 'react';

import { Notice } from '../../components/ui/Notice';
import { StatusBadge, type StatusTone } from '../../components/ui/StatusBadge';
import {
  catalogPriceLabel,
  computeLineTotal,
  formatEuro,
  getCostStatus,
  parseNonNegativeDecimal,
  resolveInitialPrice,
  summarizeCostItems,
  type CostCatalogItem,
  type CostStatus,
  type VisitCostItem,
} from './costMath';
import {
  applyCatalogPriceToPendingItems,
  COST_MODULE_UNAVAILABLE_MESSAGE,
  countPendingItemsForCatalogItem,
  createVisitCostItem,
  deleteVisitCostItem,
  listCostCatalog,
  listVisitCostItems,
  updateCatalogUnitPrice,
} from './visitCostService';

type Props = {
  visitId: string;
  patientId: string;
  /** Copia el total cuantificado al campo «Costes de aparataje» del formulario (sin guardar). */
  onUseQuantifiedTotal?: (total: number) => void;
};

const STATUS_META: Record<CostStatus, { label: string; tone: StatusTone }> = {
  known: { label: 'Coste conocido', tone: 'positive' },
  zero: { label: 'Coste 0 € (real)', tone: 'info' },
  pending: { label: 'Pendiente de valoración económica', tone: 'warning' },
};

const SOURCE_LABEL: Record<VisitCostItem['price_source'], string> = {
  catalog: 'Precio de catálogo',
  manual: 'Precio introducido',
  pending: 'Sin precio',
};

export function VisitCostItemsPanel({ visitId, patientId, onUseQuantifiedTotal }: Props) {
  const [catalog, setCatalog] = useState<CostCatalogItem[]>([]);
  const [items, setItems] = useState<VisitCostItem[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState('');
  const [quantityText, setQuantityText] = useState('1');
  const [manualPriceText, setManualPriceText] = useState('');
  const [notes, setNotes] = useState('');

  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});

  async function reload() {
    const [catalogResult, itemsResult] = await Promise.all([listCostCatalog(), listVisitCostItems(visitId)]);
    setUnavailable(Boolean(catalogResult.unavailable || itemsResult.unavailable));
    setCatalog(catalogResult.data);
    setItems(itemsResult.data);
    setErrorMessage(catalogResult.errorMessage ?? itemsResult.errorMessage);
  }

  useEffect(() => {
    setLoading(true);
    void reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId]);

  const selected = catalog.find((item) => item.id === selectedId) ?? null;
  const quantity = parseNonNegativeDecimal(quantityText);
  const manualPrice = parseNonNegativeDecimal(manualPriceText);
  const preview = selected ? resolveInitialPrice(selected, manualPrice) : null;
  const previewTotal = preview ? computeLineTotal(quantity, preview.unit_price_applied) : null;
  const quantityInvalid = quantityText.trim() !== '' && (quantity === null || quantity <= 0);
  const manualPriceInvalid = manualPriceText.trim() !== '' && manualPrice === null;
  const summary = useMemo(() => summarizeCostItems(items), [items]);

  async function handleAdd() {
    if (!selected || !preview || quantity === null || quantity <= 0 || manualPriceInvalid) return;
    setBusy(true);
    setErrorMessage(null);
    setInfoMessage(null);
    const result = await createVisitCostItem({
      patientId,
      visitId,
      catalogItem: selected,
      quantity,
      unitPriceApplied: preview.unit_price_applied,
      priceSource: preview.price_source,
      notes: notes.trim() || null,
    });
    if (result.errorMessage) {
      setErrorMessage(result.errorMessage);
    } else {
      setSelectedId('');
      setQuantityText('1');
      setManualPriceText('');
      setNotes('');
      await reload();
    }
    setBusy(false);
  }

  async function handleDelete(item: VisitCostItem) {
    if (!window.confirm(`¿Eliminar la partida «${item.concept_label_snapshot}» (cantidad ${item.quantity}) de esta visita?`)) return;
    setBusy(true);
    const result = await deleteVisitCostItem(item.id, visitId);
    setErrorMessage(result.errorMessage);
    await reload();
    setBusy(false);
  }

  async function handleSaveCatalogPrice(item: CostCatalogItem) {
    const price = parseNonNegativeDecimal(priceDrafts[item.id] ?? '');
    if (price === null) {
      setErrorMessage('Introduce un precio válido (número ≥ 0, admite coma decimal).');
      return;
    }
    if (
      !window.confirm(
        `Fijar el precio de catálogo de «${item.label}» en ${formatEuro(price)}.\n\nSe aplicará a las nuevas selecciones. Las partidas ya valoradas NO se modifican.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    const result = await updateCatalogUnitPrice(item.id, price);
    if (result.errorMessage) {
      setErrorMessage(result.errorMessage);
    } else {
      const pending = await countPendingItemsForCatalogItem(item.id);
      setPendingCounts((prev) => ({ ...prev, [item.id]: pending.data }));
      setPriceDrafts((prev) => ({ ...prev, [item.id]: '' }));
      setInfoMessage(`Precio de catálogo de «${item.label}» actualizado.`);
      await reload();
    }
    setBusy(false);
  }

  async function handleCheckPending(item: CostCatalogItem) {
    const pending = await countPendingItemsForCatalogItem(item.id);
    setErrorMessage(pending.errorMessage);
    setPendingCounts((prev) => ({ ...prev, [item.id]: pending.data }));
  }

  async function handleApplyToPending(item: CostCatalogItem) {
    const count = pendingCounts[item.id] ?? 0;
    if (
      !window.confirm(
        `Valorar ${count} partida(s) pendiente(s) de «${item.label}» con el precio de catálogo vigente (${formatEuro(item.unit_price)}).\n\nAfecta a las partidas pendientes de este concepto en TODAS las visitas. Se conservan las cantidades y se registra la procedencia del precio. Las partidas ya valoradas no se modifican.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    const result = await applyCatalogPriceToPendingItems(item);
    if (result.errorMessage) {
      setErrorMessage(result.errorMessage);
    } else {
      setInfoMessage(`${result.data} partida(s) de «${item.label}» valoradas con ${formatEuro(item.unit_price)}.`);
      setPendingCounts((prev) => ({ ...prev, [item.id]: 0 }));
      await reload();
    }
    setBusy(false);
  }

  if (loading) {
    return <p className="help-text">Cargando partidas de coste...</p>;
  }

  if (unavailable) {
    return <Notice tone="info">{COST_MODULE_UNAVAILABLE_MESSAGE}</Notice>;
  }

  return (
    <section className="form-grid panel-block" aria-labelledby={`cost-items-${visitId}`}>
      <h3 id={`cost-items-${visitId}`}>Costes por aparataje · partidas del catálogo</h3>
      <p className="help-text">
        Selecciona el procedimiento: si tiene precio de catálogo se aplica automáticamente. Coste total = cantidad × precio unitario.
      </p>

      <div className="grid-2">
        <label>
          Procedimiento
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={busy}>
            <option value="">Seleccionar concepto…</option>
            {catalog.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} — {catalogPriceLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cantidad
          <input
            inputMode="decimal"
            value={quantityText}
            onChange={(event) => setQuantityText(event.target.value)}
            aria-invalid={quantityInvalid}
            disabled={busy}
          />
          {quantityInvalid ? <span className="help-text text-warning">La cantidad debe ser un número mayor que 0.</span> : null}
        </label>
        {selected?.pricing_mode === 'variable' ? (
          <label>
            Precio unitario de este registro (€)
            <input
              inputMode="decimal"
              value={manualPriceText}
              onChange={(event) => setManualPriceText(event.target.value)}
              placeholder="Ej. 0,05 — vacío = pendiente"
              aria-invalid={manualPriceInvalid}
              disabled={busy}
            />
            {manualPriceInvalid ? <span className="help-text text-warning">Precio no válido (número ≥ 0).</span> : null}
          </label>
        ) : null}
        <label>
          Observaciones
          <input value={notes} onChange={(event) => setNotes(event.target.value)} disabled={busy} />
        </label>
      </div>

      {selected && preview ? (
        <p className="help-text">
          Precio unitario: <strong>{preview.unit_price_applied === null ? 'Pendiente de valoración económica' : formatEuro(preview.unit_price_applied)}</strong>
          {' · '}Coste total: <strong>{previewTotal === null ? 'No calculable (falta precio o cantidad)' : formatEuro(previewTotal)}</strong>
        </p>
      ) : null}

      <div className="actions-inline">
        <button
          type="button"
          className="button-secondary"
          onClick={() => void handleAdd()}
          disabled={busy || !selected || quantity === null || quantity <= 0 || manualPriceInvalid}
        >
          Añadir partida
        </button>
      </div>

      {items.length === 0 ? (
        <p className="help-text">No hay partidas de coste registradas en esta visita.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Concepto</th>
                <th scope="col">Cantidad</th>
                <th scope="col">Precio unitario aplicado</th>
                <th scope="col">Coste total</th>
                <th scope="col">Estado</th>
                <th scope="col">Observaciones</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const status = getCostStatus(item);
                return (
                  <tr key={item.id}>
                    <td>{item.concept_label_snapshot}</td>
                    <td>{item.quantity.toLocaleString('es-ES')}</td>
                    <td>
                      {item.unit_price_applied === null ? '—' : formatEuro(item.unit_price_applied)}
                      <div className="help-text">{SOURCE_LABEL[item.price_source]}</div>
                    </td>
                    <td>{status === 'pending' ? '—' : formatEuro(computeLineTotal(item.quantity, item.unit_price_applied))}</td>
                    <td>
                      <StatusBadge tone={STATUS_META[status].tone}>{STATUS_META[status].label}</StatusBadge>
                    </td>
                    <td>{item.notes ?? ''}</td>
                    <td>
                      <button type="button" className="button-secondary button-sm" onClick={() => void handleDelete(item)} disabled={busy}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="help-text">
        Total cuantificado: <strong>{formatEuro(summary.quantifiedTotal)}</strong> · Partidas pendientes de valoración: <strong>{summary.pendingCount}</strong>{' '}
        · Procedimientos registrados: <strong>{summary.totalCount}</strong>
      </p>
      {summary.pendingCount > 0 ? (
        <Notice tone="warning">
          Subtotal parcial: hay {summary.pendingCount} partida(s) pendiente(s) de valoración económica. El total cuantificado no es el coste global definitivo.
        </Notice>
      ) : null}
      {onUseQuantifiedTotal && summary.totalCount > 0 ? (
        <div className="actions-inline">
          <button type="button" className="button-secondary button-sm" onClick={() => onUseQuantifiedTotal(summary.quantifiedTotal)}>
            Copiar total cuantificado a «Costes de aparataje»
          </button>
          <span className="help-text">Rellena el campo del formulario; se guarda con «Guardar proceso».</span>
        </div>
      ) : null}

      <details className="drilldown">
        <summary>Mantenimiento del catálogo de precios</summary>
        <p className="help-text">
          Punto único de mantenimiento. Cambiar un precio de catálogo solo afecta a nuevas selecciones; las partidas ya valoradas conservan su precio. Las
          partidas pendientes se valoran únicamente con la acción explícita «Aplicar a pendientes».
        </p>
        <ul className="simple-list">
          {catalog.map((item) => (
            <li key={item.id}>
              <span>
                <strong>{item.label}</strong>
                <span className="help-text"> · {catalogPriceLabel(item)}</span>
              </span>
              <span className="actions-inline">
                <input
                  aria-label={`Nuevo precio de catálogo para ${item.label}`}
                  inputMode="decimal"
                  placeholder="Nuevo precio €"
                  value={priceDrafts[item.id] ?? ''}
                  onChange={(event) => setPriceDrafts((prev) => ({ ...prev, [item.id]: event.target.value }))}
                  disabled={busy}
                  style={{ maxWidth: '9rem' }}
                />
                <button type="button" className="button-secondary button-sm" onClick={() => void handleSaveCatalogPrice(item)} disabled={busy}>
                  Guardar precio
                </button>
                {item.pricing_mode === 'fixed' ? (
                  pendingCounts[item.id] === undefined ? (
                    <button type="button" className="button-secondary button-sm" onClick={() => void handleCheckPending(item)} disabled={busy}>
                      Ver pendientes
                    </button>
                  ) : pendingCounts[item.id] > 0 ? (
                    <button type="button" className="button-sm" onClick={() => void handleApplyToPending(item)} disabled={busy}>
                      Aplicar a {pendingCounts[item.id]} pendiente(s)
                    </button>
                  ) : (
                    <span className="help-text">Sin partidas pendientes</span>
                  )
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </details>

      {infoMessage ? <Notice tone="info">{infoMessage}</Notice> : null}
      {errorMessage ? <Notice tone="danger">{errorMessage}</Notice> : null}
    </section>
  );
}
