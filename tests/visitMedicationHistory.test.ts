import { describe, expect, it } from 'vitest';

import { reconstructMedicationStateAtVisit, type MedicationHistoryEvent } from '../src/features/medications/visitMedicationHistory';

// Datos 100 % sintéticos. Simulan el estado que dejan en BD saveVisitMedicationChanges /
// importExternalMedicationToVisit: patient_medications con el estado VIGENTE y
// visit_medication_events con old_value = estado previo de la fila.
type Row = { id: string; patient_id: string; medication_catalog_id: string; dose_text: string | null; is_active: boolean; end_date: string | null; created_at: string };

const snap = (row: Pick<Row, 'medication_catalog_id' | 'dose_text' | 'is_active' | 'end_date'>) => ({
  medication_catalog_id: row.medication_catalog_id,
  dose_text: row.dose_text,
  frequency_text: null,
  route_text: null,
  indication: null,
  start_date: null,
  end_date: row.end_date,
  is_active: row.is_active,
  notes: null,
});

// Estado vigente tras V1 (A 100 mg, B 50 mg) y V2 (A→200 mg, B suspendido, C 25 mg añadido).
const currentRows: Row[] = [
  { id: 'A', patient_id: 'P001', medication_catalog_id: 'cat-A', dose_text: '200 mg', is_active: true, end_date: null, created_at: '2026-01-01T10:00:00Z' },
  { id: 'B', patient_id: 'P001', medication_catalog_id: 'cat-B', dose_text: '50 mg', is_active: false, end_date: '2026-02-01', created_at: '2026-01-01T10:01:00Z' },
  { id: 'C', patient_id: 'P001', medication_catalog_id: 'cat-C', dose_text: '25 mg', is_active: true, end_date: null, created_at: '2026-02-01T10:02:00Z' },
];

const v1Events: MedicationHistoryEvent[] = [
  { visit_id: 'V1', patient_medication_id: 'A', event_type: 'added', old_value: null, created_at: '2026-01-01T10:00:01Z' },
  { visit_id: 'V1', patient_medication_id: 'B', event_type: 'added', old_value: null, created_at: '2026-01-01T10:01:01Z' },
];
const v2Events: MedicationHistoryEvent[] = [
  {
    visit_id: 'V2',
    patient_medication_id: 'A',
    event_type: 'modified',
    old_value: snap({ medication_catalog_id: 'cat-A', dose_text: '100 mg', is_active: true, end_date: null }),
    created_at: '2026-02-01T10:00:00Z',
  },
  {
    visit_id: 'V2',
    patient_medication_id: 'B',
    event_type: 'stopped',
    old_value: snap({ medication_catalog_id: 'cat-B', dose_text: '50 mg', is_active: true, end_date: null }),
    created_at: '2026-02-01T10:00:01Z',
  },
  { visit_id: 'V2', patient_medication_id: 'C', event_type: 'added', old_value: null, created_at: '2026-02-01T10:02:01Z' },
];

const byId = (rows: Row[]) => Object.fromEntries(rows.map((row) => [row.id, row]));

describe('farmacoterapia histórica por visita', () => {
  it('visita 1 conserva A 100 mg y B 50 mg, y C no aparece (cambios de visita 2 no la alteran)', () => {
    const v1 = byId(reconstructMedicationStateAtVisit(currentRows, v2Events));
    expect(Object.keys(v1).sort()).toEqual(['A', 'B']);
    expect(v1.A.dose_text).toBe('100 mg');
    expect(v1.B.dose_text).toBe('50 mg');
    expect(v1.B.is_active).toBe(true);
    expect(v1.B.end_date).toBeNull();
  });

  it('visita 2 (sin visitas posteriores con medicación) muestra A 200 mg, C 25 mg y B ausente por suspendido', () => {
    const v2 = byId(reconstructMedicationStateAtVisit(currentRows, []));
    expect(Object.keys(v2).sort()).toEqual(['A', 'C']);
    expect(v2.A.dose_text).toBe('200 mg');
    expect(v2.C.dose_text).toBe('25 mg');
  });

  it('visita 3 parte del tratamiento vigente en visita 2; sus confirmaciones no cambian visitas 1 ni 2', () => {
    const v3Events: MedicationHistoryEvent[] = [
      { visit_id: 'V3', patient_medication_id: 'A', event_type: 'confirmed_no_change', old_value: null, created_at: '2026-03-01T10:00:00Z' },
      { visit_id: 'V3', patient_medication_id: 'C', event_type: 'confirmed_no_change', old_value: null, created_at: '2026-03-01T10:00:01Z' },
    ];
    const v3 = byId(reconstructMedicationStateAtVisit(currentRows, []));
    expect(Object.keys(v3).sort()).toEqual(['A', 'C']);
    const v2 = byId(reconstructMedicationStateAtVisit(currentRows, v3Events));
    expect(v2.A.dose_text).toBe('200 mg');
    const v1 = byId(reconstructMedicationStateAtVisit(currentRows, [...v2Events, ...v3Events]));
    expect(v1.A.dose_text).toBe('100 mg');
    expect(Object.keys(v1).sort()).toEqual(['A', 'B']);
  });

  it('con varios cambios posteriores usa el estado previo al PRIMER cambio posterior', () => {
    const rows: Row[] = [{ ...currentRows[0], dose_text: '300 mg' }];
    const later: MedicationHistoryEvent[] = [
      { visit_id: 'V3', patient_medication_id: 'A', event_type: 'modified', old_value: snap({ medication_catalog_id: 'cat-A', dose_text: '200 mg', is_active: true, end_date: null }), created_at: '2026-03-01T10:00:00Z' },
      { visit_id: 'V2', patient_medication_id: 'A', event_type: 'modified', old_value: snap({ medication_catalog_id: 'cat-A', dose_text: '100 mg', is_active: true, end_date: null }), created_at: '2026-02-01T10:00:00Z' },
    ];
    expect(reconstructMedicationStateAtVisit(rows, later)[0].dose_text).toBe('100 mg');
  });

  it('no muta las filas de entrada ni mezcla pacientes', () => {
    const otherPatient: Row = { id: 'Z', patient_id: 'P002', medication_catalog_id: 'cat-Z', dose_text: '10 mg', is_active: true, end_date: null, created_at: '2026-01-01T09:00:00Z' };
    const before = JSON.stringify(currentRows);
    reconstructMedicationStateAtVisit(currentRows, [...v1Events, ...v2Events]);
    expect(JSON.stringify(currentRows)).toBe(before);
    // Los eventos de P001 no afectan a P002.
    expect(reconstructMedicationStateAtVisit([otherPatient], v2Events)).toEqual([otherPatient]);
  });
});
