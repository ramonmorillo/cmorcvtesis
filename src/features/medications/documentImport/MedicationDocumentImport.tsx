import { useEffect, useRef, useState } from 'react';
import {
  searchMedicationCatalog,
  searchExternalMedicationCatalog,
  type ExternalMedicationSearchItem,
} from '../medicationsService';
import type { MedicationCatalogItem } from '../types';
import { mapExternalMedicationPayloadToNormalizedCandidate } from '../normalizedCatalog';
import { persistMedicationImport } from './importService';
import { extractDocument } from './extractDocument';
import {
  duplicateReason,
  importBlockingIssues,
  manualCatalogSelection,
  isDrugOnlyQuery,
  normalizeDrug,
  parseMedicationPages,
  pendingFields,
  prepareImportDrafts,
  type DocumentPage,
  type ExistingTreatment,
  type ImportField,
  type Proposal,
} from './model';

type Props = {
  patientId: string;
  visitId: string;
  existing: ExistingTreatment[];
  disabled: boolean;
  onImported: () => Promise<void>;
};
const labels: Record<ImportField, string> = {
  name: 'Nombre',
  strength: 'Concentración',
  form: 'Forma',
  dose: 'Dosis prescrita',
  frequency: 'Pauta',
  route: 'Vía',
  status: 'Estado',
};
const origins = {
  document: 'Reconocido en documento',
  manual: 'Revisado manualmente',
  cima: 'Normalizado con CIMA',
  undetermined: 'No determinado',
};

function CatalogReview({ row, onChange }: { row: Proposal; onChange: (patch: Partial<Proposal>) => void }) {
  // Deliberately not prefilled from document text: no identifier can be sent by extraction.
  const [query, setQuery] = useState('');
  const [drugOnly, setDrugOnly] = useState(false);
  const [local, setLocal] = useState<MedicationCatalogItem[]>([]);
  const [external, setExternal] = useState<ExternalMedicationSearchItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  const search = async (cima: boolean) => {
    if (!drugOnly || !isDrugOnlyQuery(query)) {
      setError('Escribe solo un nombre farmacológico (sin datos personales ni números) y confirma la casilla.');
      return;
    }
    const revision = ++request.current;
    setBusy(true);
    setError('');
    setLocal([]);
    setExternal([]);
    try {
      if (cima) {
        const result = await searchExternalMedicationCatalog(query.trim());
        if (request.current !== revision) return;
        setExternal(
          [...result.data].sort(
            (a, b) =>
              Number(normalizeDrug(b.label).startsWith(`${normalizeDrug(query)} `)) -
              Number(normalizeDrug(a.label).startsWith(`${normalizeDrug(query)} `)),
          ),
        );
        setError(
          result.errorMessage
            ? 'CIMA no disponible. Puedes seguir revisando manualmente y buscar el catálogo local.'
            : result.data.length
              ? ''
              : 'Sin coincidencias. Revisa el nombre o usa el alta manual existente.',
        );
      } else {
        const result = await searchMedicationCatalog(query.trim());
        if (request.current !== revision) return;
        setLocal(result.data);
        setError(
          result.errorMessage
            ? 'No se pudo consultar el catálogo. Reintenta sin perder la revisión.'
            : result.data.length
              ? ''
              : 'Sin coincidencias. Puedes utilizar el nombre revisado sin CIMA sin cerrar esta revisión.',
        );
      }
    } catch {
      if (request.current === revision)
        setError('No se pudo consultar el catálogo; la revisión manual sigue disponible.');
    } finally {
      if (request.current === revision) setBusy(false);
    }
  };
  return (
    <div className="medication-import-catalog">
      <p className="medication-import-selection">
        Seleccionado: {row.catalog?.display_name ?? row.catalogSelection?.display_name ?? 'Pendiente'}.
      </p>
      <p>CIMA es opcional. Puedes elegir catálogo local, una presentación CIMA o registrar el nombre revisado.</p>
      <button
        type="button"
        className="button-secondary"
        disabled={row.name.trim().length < 2}
        onClick={() => {
          onChange({ catalog: undefined, catalogSelection: manualCatalogSelection(row), reviewed: false });
          setExternal([]);
          setLocal([]);
          setError('');
        }}
      >
        Usar nombre revisado sin CIMA
      </button>
      {row.catalogSelection && (
        <p role="status">
          Identidad elegida. Se reutilizará o creará su entrada de catálogo al confirmar el lote, sin guardar
          documentos.
        </p>
      )}
      <details>
        <summary>Buscar en catálogo local o CIMA (opcional)</summary>
        <p>Nunca se cambia la dosis ni la pauta al elegir una presentación.</p>
        <label>
          Término farmacológico para consultar
          <input
            value={query}
            maxLength={60}
            onChange={(e) => {
              request.current++;
              setBusy(false);
              setQuery(e.target.value);
              setDrugOnly(false);
              setLocal([]);
              setExternal([]);
            }}
          />
        </label>
        <label>
          <input type="checkbox" checked={drugOnly} onChange={(e) => setDrugOnly(e.target.checked)} />
          He comprobado que el término solo contiene un nombre farmacológico y ningún dato personal.
        </label>
        <div className="actions-inline">
          <button type="button" disabled={busy || !drugOnly} onClick={() => void search(false)}>
            Buscar catálogo local
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={busy || !drugOnly}
            onClick={() => void search(true)}
          >
            Consultar CIMA
          </button>
        </div>
        {busy && <p role="status">Consultando…</p>}
        {error && <p role="status">{error}</p>}
        <div className="medication-import-results" aria-label="Resultados de catálogo">
          {local.map((item) => (
            <button
              className="button-secondary"
              type="button"
              key={item.id}
              onClick={() => {
                onChange({ catalog: item, catalogSelection: undefined, reviewed: false });
                setLocal([]);
                setExternal([]);
              }}
            >
              Seleccionar {item.display_name}
            </button>
          ))}
          {external.length > 0 && (
            <p>
              Elige explícitamente una presentación CIMA. Esa elección prepara el medicamento para incorporarlo; no
              requiere buscarlo de nuevo en el catálogo local.
            </p>
          )}
          {external.map((item) => (
            <button
              className="button-secondary"
              type="button"
              key={item.id}
              onClick={() => {
                const candidate = mapExternalMedicationPayloadToNormalizedCandidate(item.payload);
                const sourceCode =
                  item.sourceCode ??
                  candidate.cimaCn ??
                  (candidate.cimaNRegistro ? `nregistro:${candidate.cimaNRegistro}` : null);
                if (!sourceCode) {
                  setError(
                    'Esta alternativa no tiene identificador CIMA. Elige otra o utiliza el nombre revisado sin CIMA.',
                  );
                  return;
                }
                const form = candidate.pharmaceuticalForm ?? row.form;
                onChange({
                  name: item.label,
                  form,
                  catalog: undefined,
                  catalogSelection: {
                    source: 'external_cima',
                    source_code: sourceCode,
                    display_name: item.label,
                    active_ingredient: candidate.ingredientNames.join(' + ') || undefined,
                    strength: candidate.strengthText ?? undefined,
                    form: candidate.pharmaceuticalForm ?? undefined,
                    route: candidate.routeDefault ?? undefined,
                    atc_code: candidate.atcCodes[0],
                  },
                  reviewed: false,
                  provenance: {
                    ...row.provenance,
                    name: 'cima',
                    form: form !== row.form ? 'cima' : row.provenance.form,
                  },
                });
                setExternal([]);
                setLocal([]);
                setError('');
              }}
            >
              {item.label} · {item.sourceLabel}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}

export function MedicationDocumentImport({ patientId, visitId, existing, disabled, onImported }: Props) {
  const [saving, setSaving] = useState(false);
  const operation = useRef<string>();
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<DocumentPage[]>([]);
  const [rows, setRows] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (submitError) feedback.current?.focus();
  }, [submitError]);
  const controller = useRef<AbortController>();
  const generation = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (disabled) close();
  }, [disabled]);
  function close() {
    if (saving) return;
    operation.current = undefined;
    generation.current++;
    controller.current?.abort();
    controller.current = undefined;
    setRows([]);
    setPages([]);
    setBusy(false);
    setMessage('');
    setSubmitError('');
    setConfirmed(false);
    setOpen(false);
    if (input.current) input.current.value = '';
  }
  const process = async (file?: File) => {
    if (!file) return;
    controller.current?.abort();
    const revision = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    operation.current = undefined;
    setSubmitError('');
    setPages([]);
    setRows([]);
    setConfirmed(false);
    setBusy(true);
    setMessage('Procesando localmente…');
    try {
      const result = await extractDocument(file, abort.signal, (msg) => {
        if (generation.current === revision) setMessage(msg);
      });
      if (generation.current !== revision) return;
      const proposals = parseMedicationPages(result);
      setPages(result);
      setRows(proposals);
      setMessage(
        proposals.length
          ? `${proposals.length} propuestas. La extracción puede omitir tratamientos o cometer errores; compara todas las páginas con el original.`
          : 'No se identificaron medicamentos. Revisa el texto extraído y usa el registro manual.',
      );
    } catch {
      if (generation.current === revision)
        setMessage(
          'No se pudo procesar el documento: comprueba el formato, que no tenga contraseña, el tamaño (20 MB), las páginas (10) y la resolución (12 MP). Puedes usar el registro manual.',
        );
    } finally {
      if (generation.current === revision) {
        setBusy(false);
        controller.current = undefined;
        if (input.current) input.current.value = '';
      }
    }
  };
  const update = (id: string, patch: Partial<Proposal>) => {
    setSubmitError('');
    operation.current = undefined;
    setRows((previous) => previous.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    setConfirmed(false);
  };
  const prepare = async () => {
    if (disabled || busy || saving || !confirmed) return;
    setSubmitError('');
    const issues = importBlockingIssues(rows, existing);
    if (issues.length) {
      setSubmitError('No se ha guardado ningún tratamiento. Completa los puntos indicados antes de confirmar.');
      return;
    }
    try {
      const drafts = prepareImportDrafts(rows, existing);
      operation.current ??= crypto.randomUUID();
      setSaving(true);
      const selectedIds = rows.filter((row) => row.selected).map((row) => row.id);
      const result = await persistMedicationImport({
        operationId: operation.current,
        patientId,
        visitId,
        rows: drafts,
        onCatalogResolved: (index, catalog) =>
          setRows((previous) =>
            previous.map((row) =>
              row.id === selectedIds[index] ? { ...row, catalog, catalogSelection: undefined } : row,
            ),
          ),
      });
      if (result.error) {
        setSubmitError(result.error);
        return;
      }
      // Clear the source before refreshing; refresh failures must never invite a second insert.
      setRows([]);
      setPages([]);
      setConfirmed(false);
      setOpen(false);
      operation.current = undefined;
      await onImported();
    } catch {
      setSubmitError(
        'No se pudo completar la confirmación. Si ya enviaste el lote, comprueba el registro antes de iniciar otro.',
      );
    } finally {
      setSaving(false);
    }
  };
  if (!open)
    return (
      <button type="button" className="button-secondary" disabled={disabled} onClick={() => setOpen(true)}>
        Importar medicación desde PDF o imagen
      </button>
    );
  return (
    <section className="medication-import" aria-label="Importar medicación desde documento">
      <h3>Importar medicación desde documento</h3>
      <fieldset disabled={saving} className="medication-import-fields">
        <p>
          PDF, JPG, JPEG o PNG · máximo 20 MB, 10 páginas y 12 MP por imagen. OCR local en español. El documento se
          procesa en este navegador y se elimina de memoria al cerrar. No se sube ni se conserva.
        </p>
        <p className="notice notice-warning">
          Extracción asistida: no realiza conciliación ni recomendaciones terapéuticas. Revisa cada medicamento. Solo se
          guardarán los campos estructurados de los tratamientos que confirmes. No se guardará el documento ni sus
          fragmentos.
        </p>
        <label>
          Documento de tratamiento
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            disabled={busy || disabled}
            onChange={(event) => void process(event.target.files?.[0])}
          />
        </label>
        <p role="status" aria-live="polite">
          {message}
        </p>
        {busy && <p>Puedes cancelar en cualquier momento.</p>}
        {pages.map((page) => (
          <details key={page.page}>
            <summary>
              Texto local de la página {page.page} · {page.method === 'ocr' ? 'OCR (revisar errores)' : 'PDF digital'}
            </summary>
            <pre className="medication-import-original">{page.text}</pre>
          </details>
        ))}
        {rows.length > 0 && (
          <div className="medication-import-table">
            <table>
              <caption>Propuestas editables. Nada se guarda hasta la confirmación final.</caption>
              <thead>
                <tr>
                  <th>Incorporar</th>
                  <th>Identificación</th>
                  <th>Dosis y pauta</th>
                  <th>Origen y validación</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const duplicate = duplicateReason(row, existing, rows);
                  const field = (key: Exclude<ImportField, 'status'>) => (
                    <label>
                      {labels[key]}
                      <input
                        aria-label={`${labels[key]} ${index + 1}`}
                        value={row[key]}
                        maxLength={240}
                        onChange={(e) =>
                          update(row.id, {
                            [key]: e.target.value,
                            reviewed: false,
                            ...(['name', 'strength', 'form'].includes(key)
                              ? { catalog: undefined, catalogSelection: undefined }
                              : {}),
                            provenance: { ...row.provenance, [key]: 'manual' },
                          })
                        }
                      />
                      <small>{origins[row.provenance[key]]}</small>
                    </label>
                  );
                  return (
                    <tr key={row.id}>
                      <td>
                        <label>
                          <input
                            type="checkbox"
                            aria-label={`Incorporar ${index + 1}`}
                            checked={row.selected}
                            onChange={(e) => update(row.id, { selected: e.target.checked })}
                          />
                          Seleccionar
                        </label>
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => {
                            setRows((items) => items.filter((item) => item.id !== row.id));
                            setConfirmed(false);
                            setSubmitError('');
                          }}
                        >
                          Descartar
                        </button>
                      </td>
                      <td>
                        {field('name')}
                        {field('strength')}
                        {field('form')}
                        <CatalogReview row={row} onChange={(patch) => update(row.id, patch)} />
                      </td>
                      <td>
                        {field('dose')}
                        {field('frequency')}
                        {field('route')}
                        <label>
                          Estado
                          <select
                            aria-label={`Estado ${index + 1}`}
                            value={row.status}
                            onChange={(e) =>
                              update(row.id, {
                                status: e.target.value as Proposal['status'],
                                reviewed: false,
                                provenance: { ...row.provenance, status: 'manual' },
                              })
                            }
                          >
                            <option value="unknown">No determinado</option>
                            <option value="active">Activo</option>
                            <option value="stopped">Suspendido (solo revisión)</option>
                          </select>
                          <small>{origins[row.provenance.status]}</small>
                        </label>
                      </td>
                      <td>
                        <details>
                          <summary>Fragmento original · página {row.page}</summary>
                          <pre className="medication-import-original">{row.original}</pre>
                        </details>
                        {duplicate && (
                          <p className="text-warning" role="status">
                            {duplicate}
                          </p>
                        )}
                        <p>Pendiente: {pendingFields(row).join(', ') || 'sin campos pendientes'}</p>
                        <label>
                          <input
                            type="checkbox"
                            aria-label={`Revisado ${index + 1}`}
                            checked={row.reviewed}
                            onChange={(e) => update(row.id, { reviewed: e.target.checked })}
                          />
                          He contrastado identidad, dosis, pauta y estado con el original. Los campos vacíos quedan sin
                          determinar.
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && (
          <>
            <div className="notice notice-info" aria-label="Preparación de la incorporación">
              <strong>
                {rows.filter((row) => row.selected).length} tratamientos seleccionados de {rows.length}.
              </strong>
              {importBlockingIssues(rows, existing).length ? (
                <>
                  <p>Para incorporar los seleccionados, completa:</p>
                  <ul>
                    {importBlockingIssues(rows, existing).map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>Selección lista. Marca la confirmación final y pulsa «Confirmar e incorporar tratamientos».</p>
              )}
            </div>
            {submitError && (
              <div ref={feedback} tabIndex={-1} role="alert" className="notice notice-danger">
                {submitError}
              </div>
            )}
            <p>
              Se incorporan solo tratamientos activos con identidad elegida (catálogo local, CIMA o nombre revisado).
              Los suspendidos se muestran para revisión, sin suspender ni reactivar registros de IRIS. Concentración,
              forma y fragmento quedan solo en esta revisión.
            </p>
            <label>
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              Confirmo expresamente la incorporación de los tratamientos seleccionados a este paciente y visita.
            </label>
            <button type="button" disabled={!confirmed || busy || disabled} onClick={() => void prepare()}>
              {saving ? 'Guardando lote…' : 'Confirmar e incorporar tratamientos'}
            </button>
          </>
        )}
        <button type="button" className="button-secondary" onClick={close}>
          {busy ? 'Cancelar procesamiento' : 'Cancelar y cerrar'}
        </button>
      </fieldset>
    </section>
  );
}
