import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { getVisitTypeLabel } from '../../constants/enums';
import { Notice } from '../../components/ui/Notice';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { LoadingState } from '../../components/ui/LoadingState';
import type { Visit } from '../../services/visitService';
import {
  PLAN_ITEM_KINDS,
  PLAN_ITEM_KIND_LABELS,
  PLAN_PRESETS,
  type PlanItem,
  type PlanItemKind,
} from './planModel';
import {
  PLAN_MODULE_UNAVAILABLE_MESSAGE,
  addPlanItem,
  completePlanItem,
  dropPlanItem,
  listPlanItemsByPatient,
  reopenPlanItem,
} from './visitPlanService';

type Props = { visit: Visit; patientVisits: Visit[] };

type Editing = { id: string; mode: 'done' | 'drop'; text: string };

function formatDate(iso: string | null): string {
  if (!iso) return 'sin fecha';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function VisitPlanPanel({ visit, patientVisits }: Props) {
  const [items, setItems] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<PlanItemKind>('action');
  const [catalogCode, setCatalogCode] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const result = await listPlanItemsByPatient(visit.patient_id);
    setItems(result.data);
    setUnavailable(Boolean(result.unavailable));
    setErrorMessage(result.errorMessage);
    setLoading(false);
  }, [visit.patient_id]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  const visitById = useMemo(() => new Map(patientVisits.map((v) => [v.id, v])), [patientVisits]);
  const originLabel = (item: PlanItem) => {
    const origin = item.origin_visit_id ? visitById.get(item.origin_visit_id) : null;
    if (!origin) return `Creado el ${formatDate(item.created_at)}`;
    return `${getVisitTypeLabel(origin.visit_type)} · ${formatDate(origin.visit_date ?? origin.scheduled_date)}`;
  };

  const open = items.filter((i) => i.status === 'pending');
  const fromPrevious = open.filter((i) => i.origin_visit_id !== visit.id);
  const plannedHere = open.filter((i) => i.origin_visit_id === visit.id);
  const closed = items.filter((i) => i.status !== 'pending').sort((a, b) => b.created_at.localeCompare(a.created_at));

  const run = async (action: () => Promise<{ errorMessage: string | null }>) => {
    setBusy(true);
    setErrorMessage(null);
    const result = await action();
    if (result.errorMessage) setErrorMessage(result.errorMessage);
    else setEditing(null);
    await reload();
    setBusy(false);
  };

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const result = await addPlanItem({ patientId: visit.patient_id, originVisitId: visit.id, label, kind, catalogCode });
      if (!result.errorMessage) {
        setLabel('');
        setCatalogCode(null);
      }
      return result;
    });
  };

  const applyPreset = (index: number) => {
    const preset = PLAN_PRESETS[index];
    setLabel(preset.label);
    setKind(preset.kind);
    setCatalogCode(preset.catalog_code);
  };

  const renderItem = (item: PlanItem, allowDone: boolean) => {
    const isEditing = editing?.id === item.id;
    return (
      <li key={item.id} className="plan-item">
        <div className="plan-item-main">
          <strong>{item.label}</strong>
          <StatusBadge tone="neutral">{PLAN_ITEM_KIND_LABELS[item.kind]}</StatusBadge>
          <span className="text-muted plan-item-origin">{originLabel(item)}</span>
        </div>
        {isEditing ? (
          <div className="plan-item-edit">
            <input
              autoFocus
              value={editing.text}
              maxLength={240}
              placeholder={editing.mode === 'done' ? 'Resultado o nota (opcional)' : 'Motivo del descarte (obligatorio)'}
              onChange={(e) => setEditing({ ...editing, text: e.target.value })}
            />
            <button
              type="button"
              className="button-sm"
              disabled={busy || (editing.mode === 'drop' && !editing.text.trim())}
              onClick={() =>
                run(() => (editing.mode === 'done' ? completePlanItem(item.id, visit.id, editing.text) : dropPlanItem(item.id, editing.text)))
              }
            >
              {editing.mode === 'done' ? 'Confirmar hecho' : 'Confirmar descarte'}
            </button>
            <button type="button" className="button-ghost button-sm" onClick={() => setEditing(null)}>
              Cancelar
            </button>
          </div>
        ) : (
          <div className="plan-item-actions">
            {allowDone ? (
              <button type="button" className="button-sm" disabled={busy} onClick={() => setEditing({ id: item.id, mode: 'done', text: '' })}>
                Hecho
              </button>
            ) : null}
            <button type="button" className="button-secondary button-sm" disabled={busy} onClick={() => setEditing({ id: item.id, mode: 'drop', text: '' })}>
              Descartar
            </button>
          </div>
        )}
      </li>
    );
  };

  if (loading) return <LoadingState label="Cargando plan de visita..." />;
  if (unavailable) return <Notice tone="warning">{PLAN_MODULE_UNAVAILABLE_MESSAGE}</Notice>;

  return (
    <div className="plan-panel">
      {errorMessage ? <Notice tone="danger">{errorMessage}</Notice> : null}

      <section aria-labelledby="plan-previous">
        <h2 id="plan-previous">Pendientes de visitas anteriores <span className="badge-count">{fromPrevious.length}</span></h2>
        <p className="help-text">Objetivos fijados antes de esta visita que siguen abiertos. Márcalos al abordarlos; si no se abordan, se arrastran a la siguiente.</p>
        {fromPrevious.length === 0 ? (
          <p className="empty-inline">No hay objetivos pendientes de visitas anteriores.</p>
        ) : (
          <ul className="plan-list">{fromPrevious.map((item) => renderItem(item, true))}</ul>
        )}
      </section>

      <section aria-labelledby="plan-next">
        <h2 id="plan-next">Objetivos para la próxima visita <span className="badge-count">{plannedHere.length}</span></h2>
        {plannedHere.length === 0 ? (
          <p className="empty-inline">Aún no has planificado nada para la próxima visita.</p>
        ) : (
          <ul className="plan-list">{plannedHere.map((item) => renderItem(item, false))}</ul>
        )}

        <form className="plan-add" onSubmit={handleAdd}>
          <div className="plan-presets" role="group" aria-label="Objetivos frecuentes">
            {PLAN_PRESETS.map((preset, index) => (
              <button
                key={preset.label}
                type="button"
                className={label === preset.label ? 'button-sm' : 'button-secondary button-sm'}
                aria-pressed={label === preset.label}
                onClick={() => applyPreset(index)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="plan-add-fields">
            <label>
              Objetivo
              <input value={label} maxLength={200} placeholder="Ej. Revisar control de glucemias" onChange={(e) => { setLabel(e.target.value); setCatalogCode(null); }} />
            </label>
            <label>
              Tipo
              <select value={kind} onChange={(e) => setKind(e.target.value as PlanItemKind)}>
                {PLAN_ITEM_KINDS.map((k) => (
                  <option key={k} value={k}>{PLAN_ITEM_KIND_LABELS[k]}</option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={busy || !label.trim()}>Añadir objetivo</button>
          </div>
          <p className="help-text">Usa solo el código de estudio: no escribas nombres ni otros datos identificativos.</p>
        </form>
      </section>

      <details className="plan-history">
        <summary>Historial de objetivos cerrados ({closed.length})</summary>
        {closed.length === 0 ? (
          <p className="empty-inline">Todavía no hay objetivos cerrados.</p>
        ) : (
          <ul className="plan-list">
            {closed.map((item) => (
              <li key={item.id} className="plan-item">
                <div className="plan-item-main">
                  <strong>{item.label}</strong>
                  <StatusBadge tone={item.status === 'done' ? 'positive' : 'neutral'}>{item.status === 'done' ? 'Hecho' : 'Descartado'}</StatusBadge>
                  <span className="text-muted plan-item-origin">
                    {item.status === 'done'
                      ? `${formatDate(item.completed_at)}${item.outcome_note ? ` · ${item.outcome_note}` : ''}`
                      : `Motivo: ${item.dropped_reason ?? '—'}`}
                  </span>
                </div>
                <div className="plan-item-actions">
                  <button type="button" className="button-ghost button-sm" disabled={busy} onClick={() => run(() => reopenPlanItem(item.id))}>
                    Reabrir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
