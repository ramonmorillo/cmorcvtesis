// Panel de seguimiento de cohorte: una fila por paciente con última visita, próxima cita y pendientes.
// Función pura: recibe datos ya cargados y devuelve filas ordenadas por urgencia.

import { getFollowupStatus } from '../../utils/followupStatus';
import type { PlanItem } from './planModel';

export type BoardPatient = { id: string; study_code: string };

export type BoardVisit = {
  id: string;
  patient_id: string;
  visit_type: string | null;
  visit_date: string | null;
  scheduled_date: string | null;
  visit_status: string | null;
};

export type DerivedPending = { patient_id: string; source: 'recommendation' | 'intervention'; label: string };

export type BoardState = 'overdue_no_appointment' | 'no_appointment' | 'overdue_scheduled' | 'scheduled';

export type BoardOpenItem = PlanItem & { carriedOverVisits: number };

export type BoardRow = {
  patientId: string;
  studyCode: string;
  state: BoardState;
  lastAttendedDate: string | null;
  lastVisitId: string | null;
  lastVisitType: string | null;
  daysSinceLast: number | null;
  nextScheduledDate: string | null;
  nextVisitType: string | null;
  daysToNext: number | null;
  /** Fecha de una cita pasada que sigue sin visita registrada ni cancelación. */
  unrecordedAppointmentDate: string | null;
  openItems: BoardOpenItem[];
  derivedPending: DerivedPending[];
  pendingCount: number;
  cmoLevel: number | null;
  cmoScore: number | null;
};

export type BoardFilter = 'all' | 'no_appointment' | 'overdue' | 'with_pending';

export type BuildBoardInput = {
  patients: BoardPatient[];
  visits: BoardVisit[];
  planItems: PlanItem[];
  derivedPending?: DerivedPending[];
  latestCmo?: Map<string, { priority: number | null; score: number | null }>;
  /** YYYY-MM-DD */
  today: string;
};

// Se aceptan los valores en inglés (código de la app) y en español (migraciones) por la deriva conocida del esquema.
const NON_ACTIVE_STATUSES = new Set(['cancelled', 'cancelada', 'no_presentada']);

const STATE_RANK: Record<BoardState, number> = {
  overdue_no_appointment: 0,
  no_appointment: 1,
  overdue_scheduled: 2,
  scheduled: 3,
};

function dayNumber(isoDate: string): number {
  return Math.floor(Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`) / 86_400_000);
}

function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

function compareCodes(a: string, b: string): number {
  return a.localeCompare(b, 'es', { numeric: true });
}

export function buildFollowupBoard(input: BuildBoardInput): BoardRow[] {
  const { today } = input;
  const todayDate = new Date(`${today}T00:00:00Z`);

  const visitsByPatient = new Map<string, BoardVisit[]>();
  input.visits.forEach((v) => visitsByPatient.set(v.patient_id, [...(visitsByPatient.get(v.patient_id) ?? []), v]));
  const itemsByPatient = new Map<string, PlanItem[]>();
  input.planItems
    .filter((i) => i.status === 'pending')
    .forEach((i) => itemsByPatient.set(i.patient_id, [...(itemsByPatient.get(i.patient_id) ?? []), i]));
  const derivedByPatient = new Map<string, DerivedPending[]>();
  (input.derivedPending ?? []).forEach((d) =>
    derivedByPatient.set(d.patient_id, [...(derivedByPatient.get(d.patient_id) ?? []), d]),
  );

  const rows = input.patients.map<BoardRow>((patient) => {
    const visits = visitsByPatient.get(patient.id) ?? [];
    const attended = visits
      .filter((v): v is BoardVisit & { visit_date: string } => Boolean(v.visit_date))
      .sort((a, b) => a.visit_date.localeCompare(b.visit_date));
    const followup = getFollowupStatus(attended, todayDate);
    const lastAttended = attended[attended.length - 1] ?? null;

    const activePlanned = visits
      .filter((v) => !v.visit_date && v.scheduled_date && !NON_ACTIVE_STATUSES.has(v.visit_status ?? ''))
      .sort((a, b) => (a.scheduled_date as string).localeCompare(b.scheduled_date as string));
    const next = activePlanned.find((v) => (v.scheduled_date as string) >= today) ?? null;
    const unrecorded = [...activePlanned].reverse().find((v) => (v.scheduled_date as string) < today) ?? null;

    const overdue = followup.tone === 'warning';
    const state: BoardState = next
      ? overdue
        ? 'overdue_scheduled'
        : 'scheduled'
      : overdue
        ? 'overdue_no_appointment'
        : 'no_appointment';

    const openItems = (itemsByPatient.get(patient.id) ?? [])
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map<BoardOpenItem>((item) => {
        const origin = item.origin_visit_id ? visits.find((v) => v.id === item.origin_visit_id) : null;
        const reference = origin?.visit_date ?? item.created_at.slice(0, 10);
        return { ...item, carriedOverVisits: attended.filter((v) => v.visit_date > reference).length };
      });
    const derivedPending = derivedByPatient.get(patient.id) ?? [];
    const cmo = input.latestCmo?.get(patient.id);

    return {
      patientId: patient.id,
      studyCode: patient.study_code,
      state,
      lastAttendedDate: followup.lastAttendedDate,
      lastVisitId: lastAttended?.id ?? null,
      lastVisitType: lastAttended?.visit_type ?? null,
      daysSinceLast: followup.lastAttendedDate ? daysBetween(followup.lastAttendedDate, today) : null,
      nextScheduledDate: next?.scheduled_date ?? null,
      nextVisitType: next?.visit_type ?? null,
      daysToNext: next?.scheduled_date ? daysBetween(today, next.scheduled_date) : null,
      unrecordedAppointmentDate: unrecorded?.scheduled_date ?? null,
      openItems,
      derivedPending,
      pendingCount: openItems.length + derivedPending.length,
      cmoLevel: cmo?.priority ?? null,
      cmoScore: cmo?.score ?? null,
    };
  });

  return rows.sort(
    (a, b) =>
      STATE_RANK[a.state] - STATE_RANK[b.state] ||
      b.pendingCount - a.pendingCount ||
      (b.daysSinceLast ?? Number.MAX_SAFE_INTEGER) - (a.daysSinceLast ?? Number.MAX_SAFE_INTEGER) ||
      compareCodes(a.studyCode, b.studyCode),
  );
}

export function filterBoard(rows: BoardRow[], filter: BoardFilter): BoardRow[] {
  switch (filter) {
    case 'no_appointment':
      return rows.filter((r) => r.state === 'no_appointment' || r.state === 'overdue_no_appointment');
    case 'overdue':
      return rows.filter((r) => r.state === 'overdue_no_appointment' || r.state === 'overdue_scheduled');
    case 'with_pending':
      return rows.filter((r) => r.pendingCount > 0);
    default:
      return rows;
  }
}
