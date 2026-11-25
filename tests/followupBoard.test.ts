import { describe, expect, it } from 'vitest';

import {
  buildFollowupBoard,
  filterBoard,
  type BoardPatient,
  type BoardVisit,
} from '../src/features/visit-plan/followupBoard';
import type { PlanItem } from '../src/features/visit-plan/planModel';

const TODAY = '2026-11-25';

const patient = (id: string, code: string): BoardPatient => ({ id, study_code: code });
const visit = (v: Partial<BoardVisit> & Pick<BoardVisit, 'id' | 'patient_id'>): BoardVisit => ({
  visit_type: 'baseline',
  visit_date: null,
  scheduled_date: null,
  visit_status: null,
  ...v,
});
const item = (i: Partial<PlanItem> & Pick<PlanItem, 'id' | 'patient_id'>): PlanItem => ({
  origin_visit_id: null,
  kind: 'action',
  label: 'Medir TA',
  catalog_code: null,
  status: 'pending',
  completed_visit_id: null,
  completed_at: null,
  outcome_note: null,
  dropped_reason: null,
  created_at: '2026-01-01T10:00:00Z',
  ...i,
});

const build = (input: Partial<Parameters<typeof buildFollowupBoard>[0]>) =>
  buildFollowupBoard({ patients: [], visits: [], planItems: [], today: TODAY, ...input });

describe('panel de seguimiento · estado de cada paciente', () => {
  it('paciente con última visita hace >90 días y sin cita futura queda como "vencido sin cita"', () => {
    const [row] = build({
      patients: [patient('p1', 'FC-01')],
      visits: [visit({ id: 'v1', patient_id: 'p1', visit_date: '2026-07-27', visit_status: 'completed' })],
    });
    expect(row.state).toBe('overdue_no_appointment');
    expect(row.lastAttendedDate).toBe('2026-07-27');
    expect(row.daysSinceLast).toBe(121);
    expect(row.nextScheduledDate).toBeNull();
  });

  it('con cita futura queda "programado" y calcula los días hasta la cita', () => {
    const [row] = build({
      patients: [patient('p1', 'FC-01')],
      visits: [
        visit({ id: 'v1', patient_id: 'p1', visit_date: '2026-10-20' }),
        visit({ id: 'v2', patient_id: 'p1', visit_type: 'month_3', scheduled_date: '2026-11-30', visit_status: 'scheduled' }),
      ],
    });
    expect(row.state).toBe('scheduled');
    expect(row.nextScheduledDate).toBe('2026-11-30');
    expect(row.daysToNext).toBe(5);
    expect(row.nextVisitType).toBe('month_3');
  });

  it('una cita cancelada (valor en inglés o en español) o no presentada no cuenta como cita', () => {
    for (const status of ['cancelled', 'cancelada', 'no_presentada']) {
      const [row] = build({
        patients: [patient('p1', 'FC-01')],
        visits: [
          visit({ id: 'v1', patient_id: 'p1', visit_date: '2026-10-20' }),
          visit({ id: 'v2', patient_id: 'p1', scheduled_date: '2026-12-01', visit_status: status }),
        ],
      });
      expect(row.state).toBe('no_appointment');
      expect(row.nextScheduledDate).toBeNull();
    }
  });

  it('una cita pasada sin visita registrada se señala como cita sin registrar', () => {
    const [row] = build({
      patients: [patient('p1', 'FC-01')],
      visits: [
        visit({ id: 'v1', patient_id: 'p1', visit_date: '2026-08-01' }),
        visit({ id: 'v2', patient_id: 'p1', scheduled_date: '2026-11-10', visit_status: 'scheduled' }),
      ],
    });
    expect(row.unrecordedAppointmentDate).toBe('2026-11-10');
    expect(row.state).toBe('overdue_no_appointment');
  });

  it('expone la última visita realizada para poder planificar la siguiente desde ella', () => {
    const [row] = build({
      patients: [patient('p1', 'FC-01')],
      visits: [
        visit({ id: 'v1', patient_id: 'p1', visit_date: '2026-05-01' }),
        visit({ id: 'v2', patient_id: 'p1', visit_type: 'month_3', visit_date: '2026-08-01' }),
        visit({ id: 'v3', patient_id: 'p1', visit_type: 'month_6', scheduled_date: '2026-12-01', visit_status: 'scheduled' }),
      ],
    });
    expect(row.lastVisitId).toBe('v2');
    expect(row.lastVisitType).toBe('month_3');
  });

  it('paciente sin ninguna visita: sin cita y sin fecha de última visita', () => {
    const [row] = build({ patients: [patient('p1', 'FC-19')] });
    expect(row.state).toBe('no_appointment');
    expect(row.lastAttendedDate).toBeNull();
    expect(row.daysSinceLast).toBeNull();
  });

  it('una visita solo programada (sin visit_date) no cuenta como "última visita realizada"', () => {
    const [row] = build({
      patients: [patient('p1', 'FC-01')],
      visits: [visit({ id: 'v1', patient_id: 'p1', scheduled_date: '2026-12-10', visit_status: 'scheduled' })],
    });
    expect(row.lastAttendedDate).toBeNull();
    expect(row.state).toBe('scheduled');
  });
});

describe('panel de seguimiento · pendientes', () => {
  it('cuenta solo objetivos pendientes y excluye hechos y descartados', () => {
    const [row] = build({
      patients: [patient('p1', 'FC-01')],
      visits: [visit({ id: 'v1', patient_id: 'p1', visit_date: '2026-10-20' })],
      planItems: [
        item({ id: 'a', patient_id: 'p1', label: 'MAPA' }),
        item({ id: 'b', patient_id: 'p1', status: 'done', completed_at: '2026-10-21T00:00:00Z' }),
        item({ id: 'c', patient_id: 'p1', status: 'dropped', dropped_reason: 'No procede' }),
        item({ id: 'd', patient_id: 'p2', label: 'De otro paciente' }),
      ],
    });
    expect(row.openItems.map((i) => i.label)).toEqual(['MAPA']);
    expect(row.pendingCount).toBe(1);
  });

  it('calcula cuántas visitas lleva arrastrado un objetivo a partir de su visita de origen', () => {
    const [row] = build({
      patients: [patient('p1', 'FC-01')],
      visits: [
        visit({ id: 'v1', patient_id: 'p1', visit_date: '2026-05-01' }),
        visit({ id: 'v2', patient_id: 'p1', visit_type: 'month_3', visit_date: '2026-08-01' }),
        visit({ id: 'v3', patient_id: 'p1', visit_type: 'month_6', visit_date: '2026-11-01' }),
      ],
      planItems: [
        item({ id: 'a', patient_id: 'p1', origin_visit_id: 'v1' }),
        item({ id: 'b', patient_id: 'p1', origin_visit_id: 'v3' }),
      ],
    });
    const carried = Object.fromEntries(row.openItems.map((i) => [i.id, i.carriedOverVisits]));
    expect(carried).toEqual({ a: 2, b: 0 });
  });

  it('sin visita de origen usa la fecha de creación del objetivo', () => {
    const [row] = build({
      patients: [patient('p1', 'FC-01')],
      visits: [
        visit({ id: 'v1', patient_id: 'p1', visit_date: '2026-05-01' }),
        visit({ id: 'v2', patient_id: 'p1', visit_type: 'month_3', visit_date: '2026-08-01' }),
      ],
      planItems: [item({ id: 'a', patient_id: 'p1', created_at: '2026-06-15T09:00:00Z' })],
    });
    expect(row.openItems[0].carriedOverVisits).toBe(1);
  });

  it('suma los pendientes derivados de IRIS, marcados como derivados y separados de los objetivos', () => {
    const [row] = build({
      patients: [patient('p1', 'FC-01')],
      visits: [visit({ id: 'v1', patient_id: 'p1', visit_date: '2026-10-20' })],
      planItems: [item({ id: 'a', patient_id: 'p1' })],
      derivedPending: [{ patient_id: 'p1', source: 'recommendation', label: 'Recomendación a otro profesional pendiente' }],
    });
    expect(row.openItems).toHaveLength(1);
    expect(row.derivedPending).toHaveLength(1);
    expect(row.pendingCount).toBe(2);
  });
});

describe('panel de seguimiento · orden y filtros', () => {
  const patients = [patient('p1', 'FC-10'), patient('p2', 'FC-02'), patient('p3', 'FC-03'), patient('p4', 'FC-04')];
  const visits = [
    // p1: al día y con cita
    visit({ id: 'a1', patient_id: 'p1', visit_date: '2026-11-01' }),
    visit({ id: 'a2', patient_id: 'p1', scheduled_date: '2027-02-01', visit_status: 'scheduled' }),
    // p2: vencido, sin cita
    visit({ id: 'b1', patient_id: 'p2', visit_date: '2026-06-01' }),
    // p3: reciente pero sin cita
    visit({ id: 'c1', patient_id: 'p3', visit_date: '2026-11-10' }),
    // p4: vencido pero con cita
    visit({ id: 'd1', patient_id: 'p4', visit_date: '2026-06-01' }),
    visit({ id: 'd2', patient_id: 'p4', scheduled_date: '2026-12-05', visit_status: 'scheduled' }),
  ];

  it('ordena: vencido sin cita, sin cita, vencido con cita y programado', () => {
    const rows = build({ patients, visits });
    expect(rows.map((r) => r.studyCode)).toEqual(['FC-02', 'FC-03', 'FC-04', 'FC-10']);
    expect(rows.map((r) => r.state)).toEqual(['overdue_no_appointment', 'no_appointment', 'overdue_scheduled', 'scheduled']);
  });

  it('dentro del mismo estado prioriza más pendientes y, después, más días sin ver al paciente', () => {
    const rows = build({
      patients: [patient('p1', 'FC-01'), patient('p2', 'FC-02'), patient('p3', 'FC-03')],
      visits: [
        visit({ id: 'a', patient_id: 'p1', visit_date: '2026-11-10' }),
        visit({ id: 'b', patient_id: 'p2', visit_date: '2026-11-01' }),
        visit({ id: 'c', patient_id: 'p3', visit_date: '2026-11-20' }),
      ],
      planItems: [item({ id: 'x', patient_id: 'p3' }), item({ id: 'y', patient_id: 'p3', label: 'MAPA' })],
    });
    expect(rows.map((r) => r.studyCode)).toEqual(['FC-03', 'FC-02', 'FC-01']);
  });

  it('ordena los códigos de forma natural (FC-2 antes de FC-10) en caso de empate', () => {
    const rows = build({ patients: [patient('p1', 'FC-10'), patient('p2', 'FC-2')] });
    expect(rows.map((r) => r.studyCode)).toEqual(['FC-2', 'FC-10']);
  });

  it('filtra por sin cita, vencidos y con pendientes', () => {
    const rows = build({
      patients,
      visits,
      planItems: [item({ id: 'x', patient_id: 'p1' })],
    });
    expect(filterBoard(rows, 'all')).toHaveLength(4);
    expect(filterBoard(rows, 'no_appointment').map((r) => r.studyCode)).toEqual(['FC-02', 'FC-03']);
    expect(filterBoard(rows, 'overdue').map((r) => r.studyCode)).toEqual(['FC-02', 'FC-04']);
    expect(filterBoard(rows, 'with_pending').map((r) => r.studyCode)).toEqual(['FC-10']);
  });

  it('adjunta el último nivel CMO cuando se proporciona', () => {
    const [row] = build({
      patients: [patient('p1', 'FC-01')],
      latestCmo: new Map([['p1', { priority: 2, score: 41.5 }]]),
    });
    expect(row.cmoLevel).toBe(2);
    expect(row.cmoScore).toBe(41.5);
  });
});
