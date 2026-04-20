import { FormEvent, useEffect, useMemo, useState } from 'react';

import { ErrorState } from '../../components/common/ErrorState';
import {
  listVisitMedicationSnapshot,
  saveVisitMedicationChanges,
  searchMedicationCatalog,
} from './medicationsService';
import type { MedicationCatalogItem, PatientMedicationDraft } from './types';

type MedicationPanelProps = {
  visitId: string;
  patientId: string;
};

type MedicationFormRow = PatientMedicationDraft & {
  display_name: string;
};

const ROUTE_OPTIONS = [
  { value: 'oral', label: 'Oral' },
  { value: 'subcutánea', label: 'Subcutánea' },
  { value: 'intravenosa', label: 'Intravenosa' },
  { value: 'inhalada', label: 'Inhalada' },
  { value: 'tópica', label: 'Tópica' },
  { value: 'otra', label: 'Otra' },
] as const;

type RouteOptionValue = (typeof ROUTE_OPTIONS)[number]['value'];

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
  };
}

export function MedicationPanel({ visitId, patientId }: MedicationPanelProps) {
  const [rows, setRows] = useState<MedicationFormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogOptions, setCatalogOptions] = useState<MedicationCatalogItem[]>([]);

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
          previous: item,
        })),
      );
      setLoading(false);
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
      dose_text: row.dose_text,
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
        previous: item,
      })),
    );

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
              <strong>{row.display_name}</strong>
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
                  placeholder="Ej. 100 mg"
                />
              </label>
              <label>
                Frecuencia
                <input
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
          </article>
        ))}

        <div className="actions-inline">
          <button type="submit" disabled={saving || loading || rows.length === 0}>
            {saving ? 'Guardando cambios...' : 'Guardar cambios de medicación'}
          </button>
          <span className="help-text">Tratamientos activos: {activeCount}</span>
        </div>
      </form>

      {errorMessage ? <ErrorState title="No se pudo gestionar la medicación" message={errorMessage} /> : null}
    </section>
  );
}
