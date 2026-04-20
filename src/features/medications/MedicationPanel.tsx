import { FormEvent, useEffect, useMemo, useState } from 'react';

import { ErrorState } from '../../components/common/ErrorState';
import {
  listVisitMedicationEvents,
  listVisitMedicationSnapshot,
  saveVisitMedicationChanges,
  searchMedicationCatalog,
} from './medicationsService';
import type { MedicationCatalogItem, PatientMedicationDraft, VisitMedicationEvent } from './types';

type MedicationPanelProps = {
  visitId: string;
  patientId: string;
};

type MedicationFormRow = PatientMedicationDraft & {
  display_name: string;
  dose_unit_hint: DoseUnitOptionValue | '';
};

type MedicationChangeStatus = 'unchanged' | 'modified' | 'stopped' | 'new';

const ROUTE_OPTIONS = [
  { value: 'oral', label: 'Oral' },
  { value: 'subcutánea', label: 'Subcutánea' },
  { value: 'intravenosa', label: 'Intravenosa' },
  { value: 'inhalada', label: 'Inhalada' },
  { value: 'tópica', label: 'Tópica' },
  { value: 'otra', label: 'Otra' },
] as const;

type RouteOptionValue = (typeof ROUTE_OPTIONS)[number]['value'];

const FREQUENCY_SUGGESTIONS = [
  '1 vez/día',
  'cada 12 h',
  'cada 8 h',
  'cada 24 h',
  'desayuno',
  'comida',
  'cena',
  'desayuno y cena',
  'según necesidad',
  'otra',
] as const;
const INDICATION_SUGGESTIONS = [
  'prevención secundaria',
  'HTA',
  'diabetes',
  'dislipidemia',
  'insuficiencia cardiaca',
  'fibrilación auricular',
  'dolor',
  'otra',
] as const;
const DOSE_UNIT_OPTIONS = ['mg', 'g', 'UI', 'ml', 'comprimido(s)', 'cápsula(s)', 'gota(s)', 'puff(s)', 'otra'] as const;

type DoseUnitOptionValue = (typeof DOSE_UNIT_OPTIONS)[number];

const STATUS_META: Record<MedicationChangeStatus, { label: string; color: string; background: string; border: string }> = {
  unchanged: { label: 'Sin cambios', color: '#1d4ed8', background: '#eff6ff', border: '#bfdbfe' },
  modified: { label: 'Modificado', color: '#7c2d12', background: '#fff7ed', border: '#fdba74' },
  stopped: { label: 'Suspendido', color: '#991b1b', background: '#fef2f2', border: '#fecaca' },
  new: { label: 'Nuevo', color: '#166534', background: '#f0fdf4', border: '#bbf7d0' },
};

function normalizeRouteValue(route: string | null | undefined): RouteOptionValue | '' {
  const normalized = (route ?? '').trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  const knownRoute = ROUTE_OPTIONS.find((option) => option.value === normalized);
  return knownRoute ? knownRoute.value : 'otra';
}

function emptyDraft(catalog: MedicationCatalogItem): MedicationFormRow {
  return {
    medication_catalog_id: catalog.id,
    display_name: catalog.display_name,
    dose_text: '',
    frequency_text: '',
    route_text: normalizeRouteValue(catalog.route),
    indication: '',
    start_date: '',
    notes: '',
    is_active: true,
    dose_unit_hint: '',
  };
}

function normalizeTextValue(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function inferDoseUnitHint(doseText: string | null | undefined): DoseUnitOptionValue | '' {
  const normalized = normalizeTextValue(doseText).toLowerCase();
  const matched = DOSE_UNIT_OPTIONS.find((unit) => unit !== 'otra' && normalized.includes(unit.toLowerCase()));
  return matched ?? '';
}

function buildDoseTextForSave(row: MedicationFormRow): string {
  const dose = normalizeTextValue(row.dose_text);
  if (!dose) {
    return '';
  }

  if (!row.dose_unit_hint || row.dose_unit_hint === 'otra') {
    return dose;
  }

  const isMostlyNumeric = /^[0-9]+([.,][0-9]+)?$/.test(dose);
  const hasKnownUnit = DOSE_UNIT_OPTIONS.some((unit) => unit !== 'otra' && dose.toLowerCase().includes(unit.toLowerCase()));
  if (isMostlyNumeric && !hasKnownUnit) {
    return `${dose} ${row.dose_unit_hint}`;
  }
  return dose;
}

function getSemanticWarnings(row: MedicationFormRow): string[] {
  const warnings: string[] = [];
  const frequency = normalizeTextValue(row.frequency_text).toLowerCase();
  const route = normalizeTextValue(row.route_text).toLowerCase();
  const dose = normalizeTextValue(row.dose_text);
  const isDoseNumeric = /^[0-9]+([.,][0-9]+)?$/.test(dose);

  const routeKeywords = ROUTE_OPTIONS.map((option) => option.value);
  if (frequency && routeKeywords.some((keyword) => frequency === keyword || frequency.includes(`${keyword} `))) {
    warnings.push('La frecuencia parece una vía de administración. Revisa la diferenciación entre frecuencia y vía.');
  }

  if (isDoseNumeric && !row.dose_unit_hint) {
    warnings.push('La dosis parece numérica sin unidad. Sugerencia: añade unidad (mg, g, UI, ml, comprimido(s), etc.).');
  }

  if (frequency && route && frequency === route) {
    warnings.push('Frecuencia y vía tienen el mismo valor. Verifica si el dato está en el campo correcto.');
  }

  return warnings;
}

function getMedicationStatus(row: MedicationFormRow): MedicationChangeStatus {
  if (!row.previous) {
    return 'new';
  }

  if (!row.is_active) {
    return 'stopped';
  }

  const hasChanged =
    normalizeTextValue(row.dose_text) !== normalizeTextValue(row.previous.dose_text) ||
    normalizeTextValue(row.frequency_text) !== normalizeTextValue(row.previous.frequency_text) ||
    normalizeTextValue(row.route_text) !== normalizeTextValue(row.previous.route_text) ||
    normalizeTextValue(row.indication) !== normalizeTextValue(row.previous.indication) ||
    normalizeTextValue(row.start_date) !== normalizeTextValue(row.previous.start_date) ||
    normalizeTextValue(row.notes) !== normalizeTextValue(row.previous.notes) ||
    row.is_active !== row.previous.is_active;

  return hasChanged ? 'modified' : 'unchanged';
}

export function MedicationPanel({ visitId, patientId }: MedicationPanelProps) {
  const [rows, setRows] = useState<MedicationFormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogOptions, setCatalogOptions] = useState<MedicationCatalogItem[]>([]);
  const [eventSummary, setEventSummary] = useState<VisitMedicationEvent[]>([]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setErrorMessage(null);
      const result = await listVisitMedicationSnapshot(visitId);

      if (result.errorMessage) {
        setErrorMessage(result.errorMessage);
        setLoading(false);
        return;
      }

      setRows(
        result.data.map((item) => ({
          id: item.id,
          medication_catalog_id: item.medication_catalog_id,
          display_name: item.medication_catalog?.display_name ?? 'Medicamento',
          dose_text: item.dose_text ?? '',
          frequency_text: item.frequency_text ?? '',
          route_text: item.route_text ?? '',
          indication: item.indication ?? '',
          start_date: item.start_date ?? '',
          notes: item.notes ?? '',
          is_active: item.is_active,
          dose_unit_hint: inferDoseUnitHint(item.dose_text),
          previous: item,
        })),
      );
      setLoading(false);
    })();
  }, [visitId]);

  useEffect(() => {
    void (async () => {
      const result = await listVisitMedicationEvents(visitId);
      if (!result.errorMessage) {
        setEventSummary(result.data);
      }
    })();
  }, [visitId]);

  useEffect(() => {
    void (async () => {
      const result = await searchMedicationCatalog(catalogQuery);
      if (!result.errorMessage) {
        setCatalogOptions(result.data);
      }
    })();
  }, [catalogQuery]);

  const activeCount = useMemo(() => rows.filter((row) => row.is_active).length, [rows]);
  const hasInheritedTreatments = useMemo(() => rows.some((row) => Boolean(row.previous)), [rows]);

  const handleAddCatalogMedication = (catalogId: string) => {
    const selected = catalogOptions.find((item) => item.id === catalogId);
    if (!selected) {
      return;
    }

    setRows((prev) => [...prev, emptyDraft(selected)]);
    setSuccessMessage(null);
    setCatalogQuery('');
  };

  const handleChange = <K extends keyof MedicationFormRow>(index: number, key: K, value: MedicationFormRow[K]) => {
    setSuccessMessage(null);
    setRows((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
  };

  const handleToggleActive = (index: number) => {
    const selectedRow = rows[index];
    if (!selectedRow) {
      return;
    }

    const nextIsActive = !selectedRow.is_active;
    setSuccessMessage(
      nextIsActive
        ? `Tratamiento "${selectedRow.display_name}" marcado como activo. Guarda para confirmar.`
        : `Tratamiento "${selectedRow.display_name}" marcado como suspendido. Guarda para confirmar.`,
    );
    setRows((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, is_active: nextIsActive } : row)));
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const suspendedCount = rows.filter((row) => row.previous?.is_active && !row.is_active).length;

    const payload = rows.map((row) => ({
      id: row.id,
      medication_catalog_id: row.medication_catalog_id,
      dose_text: buildDoseTextForSave(row),
      frequency_text: row.frequency_text,
      route_text: row.route_text,
      indication: row.indication,
      start_date: row.start_date,
      notes: row.notes,
      is_active: row.is_active,
      previous: row.previous,
    }));

    const result = await saveVisitMedicationChanges({
      visitId,
      patientId,
      rows: payload,
    });

    if (result.errorMessage) {
      setErrorMessage(result.errorMessage);
      setSaving(false);
      return;
    }

    setRows(
      result.data.map((item) => ({
        id: item.id,
        medication_catalog_id: item.medication_catalog_id,
        display_name: item.medication_catalog?.display_name ?? 'Medicamento',
        dose_text: item.dose_text ?? '',
        frequency_text: item.frequency_text ?? '',
        route_text: item.route_text ?? '',
        indication: item.indication ?? '',
        start_date: item.start_date ?? '',
        notes: item.notes ?? '',
        is_active: item.is_active,
        dose_unit_hint: inferDoseUnitHint(item.dose_text),
        previous: item,
      })),
    );

    const eventResult = await listVisitMedicationEvents(visitId);
    if (!eventResult.errorMessage) {
      setEventSummary(eventResult.data);
    }

    const saveMessage =
      suspendedCount > 0
        ? `Cambios guardados correctamente. ${suspendedCount} tratamiento(s) suspendido(s).`
        : 'Cambios de medicación guardados correctamente.';
    setSuccessMessage(saveMessage);
    setSaving(false);
  };

  return (
    <section className="card">
      <h2>Medicación longitudinal</h2>
      <p className="help-text" style={{ marginBottom: '1rem' }}>
        Se precarga la medicación activa del paciente. Puedes añadir, ajustar dosis/frecuencia y suspender tratamientos.
      </p>
      {!loading && hasInheritedTreatments ? (
        <p className="help-text" style={{ marginBottom: '0.8rem', color: '#1d4ed8', fontWeight: 600 }}>
          Tratamiento heredado de seguimiento previo
        </p>
      ) : null}
      {successMessage ? (
        <p className="help-text" style={{ marginBottom: '0.8rem', color: '#166534', fontWeight: 600 }}>
          ✓ {successMessage}
        </p>
      ) : null}

      <div className="grid-2" style={{ marginBottom: '0.9rem' }}>
        <label>
          Buscar en catálogo
          <input
            value={catalogQuery}
            onChange={(event) => setCatalogQuery(event.target.value)}
            placeholder="Ej. atorvastatina"
          />
        </label>

        <label>
          Añadir medicamento
          <select defaultValue="" onChange={(event) => handleAddCatalogMedication(event.target.value)}>
            <option value="">Seleccionar medicamento del catálogo</option>
            {catalogOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.display_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <form onSubmit={handleSave} className="form-grid">
        {loading ? <p>Cargando medicación activa...</p> : null}

        {!loading && rows.length === 0 ? (
          <p className="help-text">No hay medicación activa. Usa el catálogo para añadir tratamientos.</p>
        ) : null}

        {rows.map((row, index) => (
          <article
            key={`${row.id ?? 'new'}-${index}`}
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              padding: '0.8rem',
              opacity: row.is_active ? 1 : 0.65,
              background: row.is_active ? '#ffffff' : '#f9fafb',
              marginBottom: '0.45rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.55rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                <strong>{row.display_name}</strong>
                {(() => {
                  const status = getMedicationStatus(row);
                  const meta = STATUS_META[status];
                  return (
                    <span
                      className="help-text"
                      style={{
                        color: meta.color,
                        backgroundColor: meta.background,
                        border: `1px solid ${meta.border}`,
                        borderRadius: '999px',
                        padding: '0.1rem 0.45rem',
                        fontWeight: 600,
                      }}
                    >
                      {meta.label}
                    </span>
                  );
                })()}
              </div>
              <button type="button" onClick={() => handleToggleActive(index)}>
                {row.is_active ? 'Suspender' : 'Reactivar'}
              </button>
            </div>

            <div className="grid-2">
              <label>
                Dosis
                <input
                  value={row.dose_text}
                  onChange={(event) => handleChange(index, 'dose_text', event.target.value)}
                  placeholder="Ej. 850 mg, 1 comprimido(s), 20 UI"
                />
              </label>
              <label>
                Unidad (opcional)
                <select
                  value={row.dose_unit_hint}
                  onChange={(event) => handleChange(index, 'dose_unit_hint', event.target.value as DoseUnitOptionValue | '')}
                >
                  <option value="">Sin unidad guiada</option>
                  {DOSE_UNIT_OPTIONS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Frecuencia
                <input
                  list="medication-frequency-options"
                  value={row.frequency_text}
                  onChange={(event) => handleChange(index, 'frequency_text', event.target.value)}
                  placeholder="Ej. 1 vez/día o cada 12 h"
                />
              </label>
              <label>
                Vía
                <select
                  value={normalizeRouteValue(row.route_text)}
                  onChange={(event) => handleChange(index, 'route_text', event.target.value)}
                >
                  <option value="">Seleccionar vía de administración</option>
                  {ROUTE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Indicación
                <input
                  list="medication-indication-options"
                  value={row.indication}
                  onChange={(event) => handleChange(index, 'indication', event.target.value)}
                  placeholder="Ej. prevención secundaria"
                />
              </label>
              <label>
                Fecha inicio
                <input type="date" value={row.start_date} onChange={(event) => handleChange(index, 'start_date', event.target.value)} />
              </label>
            </div>

            <label style={{ marginTop: '0.5rem', display: 'block' }}>
              Notas
              <textarea rows={2} value={row.notes} onChange={(event) => handleChange(index, 'notes', event.target.value)} />
            </label>
            {getSemanticWarnings(row).map((warning) => (
              <p key={`${row.medication_catalog_id}-${index}-${warning}`} className="help-text" style={{ marginTop: '0.4rem', color: '#9a3412' }}>
                ⚠ {warning}
              </p>
            ))}
          </article>
        ))}

        <datalist id="medication-frequency-options">
          {FREQUENCY_SUGGESTIONS.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
        <datalist id="medication-indication-options">
          {INDICATION_SUGGESTIONS.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>

        <div className="actions-inline">
          <button type="submit" disabled={saving || loading || rows.length === 0}>
            {saving ? 'Guardando cambios...' : 'Guardar cambios de medicación'}
          </button>
          <span className="help-text">Tratamientos activos: {activeCount}</span>
        </div>
      </form>

      <article style={{ marginTop: '1rem', borderTop: '1px solid #e5e7eb', paddingTop: '0.8rem' }}>
        <h3 style={{ marginBottom: '0.45rem' }}>Resumen de cambios de medicación en esta visita</h3>
        {eventSummary.length === 0 ? (
          <p className="help-text">Aún no hay eventos guardados para esta visita.</p>
        ) : (
          <>
            <p className="help-text" style={{ marginBottom: '0.6rem' }}>
              Nuevos: {eventSummary.filter((event) => event.event_type === 'added').length} · Modificados:{' '}
              {eventSummary.filter((event) => event.event_type === 'modified').length} · Suspendidos:{' '}
              {eventSummary.filter((event) => event.event_type === 'stopped').length} · Sin cambios:{' '}
              {eventSummary.filter((event) => event.event_type === 'confirmed_no_change').length}
            </p>
            <ul className="simple-list">
              {eventSummary.slice(0, 8).map((event) => (
                <li key={event.id}>
                  <span>
                    {event.patient_medication?.medication_catalog?.display_name ?? 'Medicamento'}
                    {' · '}
                    {STATUS_META[
                      event.event_type === 'added'
                        ? 'new'
                        : event.event_type === 'modified'
                          ? 'modified'
                          : event.event_type === 'stopped'
                            ? 'stopped'
                            : 'unchanged'
                    ].label}
                  </span>
                  <span className="help-text">{new Date(event.created_at).toLocaleString('es-ES')}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </article>

      {errorMessage ? <ErrorState title="No se pudo gestionar la medicación" message={errorMessage} /> : null}
    </section>
  );
}
