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

// ---------------------------------------------------------------------------
// Tratamientos suspendidos / históricos (datos sintéticos)
// ---------------------------------------------------------------------------
import { buildMedicationHistoryAtVisit, type HistoryEventWithValues } from '../src/features/medications/visitMedicationHistory';

type HRow = Row & { frequency_text?: string | null; start_date?: string | null; notes?: string | null };

const active = (id: string, catalog: string, dose: string, created: string): HRow => ({
  id, patient_id: 'P900', medication_catalog_id: catalog, dose_text: dose, is_active: true, end_date: null, created_at: created,
});
const stoppedRow = (row: HRow, endDate: string): HRow => ({ ...row, is_active: false, end_date: endDate });
const ev = (
  visit: string, med: string, type: HistoryEventWithValues['event_type'], at: string,
  oldValue: Record<string, unknown> | null = null, newValue: Record<string, unknown> | null = null,
): HistoryEventWithValues => ({ visit_id: visit, patient_medication_id: med, event_type: type, old_value: oldValue, new_value: newValue, created_at: at });

describe('tratamientos suspendidos e histórico por visita', () => {
  // Patrón observado (sintético): V1 alta de X (agonista GLP-1) y Y; V3 suspensión de ambos; V5 programada sin eventos.
  const x0 = active('X', 'cat-X', '10 mg', '2026-01-01T00:00:00Z');
  const y0 = active('Y', 'cat-Y', '50 mg', '2026-01-01T00:00:01Z');
  const z0 = active('Z', 'cat-Z', '20 mg', '2026-01-01T00:00:02Z');
  const rows: HRow[] = [stoppedRow(x0, '2026-10-23'), stoppedRow(y0, '2026-10-23'), z0];
  const visits = ['V1', 'V3', 'V5'];
  const events: HistoryEventWithValues[] = [
    ev('V1', 'X', 'added', '2026-06-14T10:00:00Z'),
    ev('V1', 'Y', 'added', '2026-06-14T10:00:01Z'),
    ev('V1', 'Z', 'added', '2026-06-14T10:00:02Z'),
    ev('V3', 'X', 'confirmed_no_change', '2026-10-23T08:00:00Z'),
    ev('V3', 'X', 'stopped', '2026-10-23T08:10:00Z', snap({ medication_catalog_id: 'cat-X', dose_text: '10 mg', is_active: true, end_date: null }), snap({ medication_catalog_id: 'cat-X', dose_text: '10 mg', is_active: false, end_date: '2026-10-23' })),
    ev('V3', 'Y', 'stopped', '2026-10-23T08:10:01Z', snap({ medication_catalog_id: 'cat-Y', dose_text: '50 mg', is_active: true, end_date: null }), null),
  ];

  it('visita 1: los tratamientos suspendidos después siguen activos y no constan suspensiones', () => {
    const h = buildMedicationHistoryAtVisit(rows, events, visits, 'V1');
    expect(h.active.map((r) => r.id).sort()).toEqual(['X', 'Y', 'Z']);
    expect(h.suspended).toEqual([]);
    expect(h.suspendedMedicationCount).toBe(0);
  });

  it('visita 3: cuenta 2 suspensiones con última dosis, fecha y visita de documentación', () => {
    const h = buildMedicationHistoryAtVisit(rows, events, visits, 'V3');
    expect(h.active.map((r) => r.id)).toEqual(['Z']);
    expect(h.suspendedMedicationCount).toBe(2);
    const x = h.suspended.find((s) => s.row.id === 'X')!;
    expect(x).toMatchObject({ lastDoseText: '10 mg', suspensionDate: '2026-10-23', documentedInVisitId: 'V3', reintroduced: false });
  });

  it('visita posterior sin eventos (V5): mantiene las 2 suspensiones documentadas en V3', () => {
    const h = buildMedicationHistoryAtVisit(rows, events, visits, 'V5');
    expect(h.suspendedMedicationCount).toBe(2);
    expect(h.suspended.every((s) => s.documentedInVisitId === 'V3')).toBe(true);
  });

  it('reintroducción: el episodio previo se muestra pero el medicamento no cuenta como suspendido', () => {
    const x2 = active('X2', 'cat-X', '5 mg', '2027-05-17T00:00:00Z');
    const h = buildMedicationHistoryAtVisit([...rows, x2], [...events, ev('V5', 'X2', 'added', '2027-05-17T10:00:00Z')], visits, 'V5');
    expect(h.active.map((r) => r.id).sort()).toEqual(['X2', 'Z']);
    expect(h.suspended.find((s) => s.row.id === 'X')?.reintroduced).toBe(true);
    expect(h.suspendedMedicationCount).toBe(1); // solo Y
    // En V3 el episodio reintroducido aún no existía.
    expect(buildMedicationHistoryAtVisit([...rows, x2], [...events, ev('V5', 'X2', 'added', '2027-05-17T10:00:00Z')], visits, 'V3').suspendedMedicationCount).toBe(2);
  });

  it('sin evento de suspensión registrado: no inventa la visita ni la dosis', () => {
    const w = stoppedRow({ ...active('W', 'cat-W', '', '2026-01-01T00:00:03Z'), dose_text: null }, '2026-02-01');
    const h = buildMedicationHistoryAtVisit([w], [ev('V1', 'W', 'added', '2026-01-01T10:00:00Z')], ['V1'], 'V1');
    expect(h.suspended[0]).toMatchObject({ documentedInVisitId: null, lastDoseText: null, suspensionDate: '2026-02-01' });
  });

  it('sin duplicados: un episodio aparece una sola vez aunque tenga varios eventos', () => {
    const h = buildMedicationHistoryAtVisit(rows, [...events, ev('V3', 'X', 'stopped', '2026-10-23T09:00:00Z', null, null)], visits, 'V3');
    expect(h.suspended.filter((s) => s.row.id === 'X')).toHaveLength(1);
  });
});
