import { supabase } from '../lib/supabase';

export type DashboardData = {
  totalPatients: number;
  patientsByPriority: { 1: number; 2: number; 3: number };
  upcomingVisits: Array<{ id: string; patient_id: string; study_code: string | null; visit_type: string | null; scheduled_date: string | null }>;
  recentVisits: Array<{ id: string; patient_id: string; study_code: string | null; visit_type: string | null; visit_date: string | null }>;
  recentInterventions: Array<{ id: string; visit_id: string; patient_id: string; intervention_type: string; created_at: string | null }>;
};

export async function loadDashboardData(): Promise<{ data: DashboardData | null; errorMessage: string | null }> {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado. No se puede cargar el dashboard.' };
  }

  const now = new Date().toISOString().slice(0, 10);

  const [patientsRes, scoresRes, upcomingRes, visitsRes, interventionsRes] = await Promise.all([
    supabase.from('patients').select('id', { count: 'exact', head: true }),
    supabase
      .from('cmo_scores')
      .select('priority,created_at,visits!inner(patient_id)')
      .order('created_at', { ascending: false }),
    supabase
      .from('visits')
      .select('id,patient_id,visit_type,scheduled_date,patients!inner(study_code)')
      .gte('scheduled_date', now)
      .order('scheduled_date', { ascending: true })
      .limit(8),
    supabase
      .from('visits')
      .select('id,patient_id,visit_type,visit_date,patients!inner(study_code)')
      .not('visit_date', 'is', null)
      .order('visit_date', { ascending: false })
      .limit(8),
    supabase
      .from('interventions')
      .select('id,visit_id,intervention_type,created_at,visits!inner(patient_id)')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  const errors = [patientsRes.error, scoresRes.error, upcomingRes.error, visitsRes.error, interventionsRes.error].filter(Boolean);

  if (errors.length > 0) {
    return { data: null, errorMessage: errors[0]?.message ?? 'No se pudo cargar dashboard.' };
  }

  // Count unique patients per priority level using only their most recent CMO score.
  const patientLatestPriority = new Map<string, 1 | 2 | 3>();
  for (const row of (scoresRes.data ?? []) as Array<{ priority: number; visits: { patient_id: string } | Array<{ patient_id: string }> }>) {
    const pid = Array.isArray(row.visits) ? row.visits[0]?.patient_id : row.visits?.patient_id;
    const p = Number(row.priority) as 1 | 2 | 3;
    if (pid && !patientLatestPriority.has(pid) && (p === 1 || p === 2 || p === 3)) {
      patientLatestPriority.set(pid, p);
    }
  }
  const priorities = { 1: 0, 2: 0, 3: 0 } as { 1: number; 2: number; 3: number };
  for (const p of patientLatestPriority.values()) {
    priorities[p] += 1;
  }

  return {
    data: {
      totalPatients: patientsRes.count ?? 0,
      patientsByPriority: priorities,
      upcomingVisits: ((upcomingRes.data ?? []) as Array<{
        id: string; patient_id: string; visit_type: string | null; scheduled_date: string | null;
        patients: { study_code: string | null } | Array<{ study_code: string | null }>;
      }>).map((r) => ({
        id: r.id, patient_id: r.patient_id, visit_type: r.visit_type, scheduled_date: r.scheduled_date,
        study_code: (Array.isArray(r.patients) ? r.patients[0]?.study_code : r.patients?.study_code) ?? null,
      })),
      recentVisits: ((visitsRes.data ?? []) as Array<{
        id: string; patient_id: string; visit_type: string | null; visit_date: string | null;
        patients: { study_code: string | null } | Array<{ study_code: string | null }>;
      }>).map((r) => ({
        id: r.id, patient_id: r.patient_id, visit_type: r.visit_type, visit_date: r.visit_date,
        study_code: (Array.isArray(r.patients) ? r.patients[0]?.study_code : r.patients?.study_code) ?? null,
      })),
      recentInterventions: ((interventionsRes.data ?? []) as Array<{
        id: string; visit_id: string; intervention_type: string; created_at: string | null;
        visits: { patient_id: string } | Array<{ patient_id: string }>;
      }>).map((r) => ({
        id: r.id,
        visit_id: r.visit_id,
        patient_id: Array.isArray(r.visits) ? (r.visits[0]?.patient_id ?? '') : (r.visits?.patient_id ?? ''),
        intervention_type: r.intervention_type,
        created_at: r.created_at,
      })),
    },
    errorMessage: null,
  };
}
