import { supabase } from '../lib/supabase';

export type DashboardData = {
  totalPatients: number;
  patientsByPriority: { 1: number; 2: number; 3: number };
  upcomingVisits: Array<{ id: string; patient_id: string; visit_type: string | null; scheduled_date: string | null }>;
  recentVisits: Array<{ id: string; patient_id: string; visit_type: string | null; visit_date: string | null }>;
  recentInterventions: Array<{ id: string; visit_id: string; intervention_type: string; created_at: string | null }>;
};

export async function loadDashboardData(): Promise<{ data: DashboardData | null; errorMessage: string | null }> {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado. No se puede cargar el dashboard.' };
  }

  const now = new Date().toISOString().slice(0, 10);

  const [patientsRes, scoresRes, upcomingRes, visitsRes, interventionsRes] = await Promise.all([
    supabase.from('patients').select('id', { count: 'exact', head: true }),
    supabase.from('cmo_scores').select('priority'),
    supabase
      .from('visits')
      .select('id,patient_id,visit_type,scheduled_date')
      .gte('scheduled_date', now)
      .order('scheduled_date', { ascending: true })
      .limit(8),
    supabase
      .from('visits')
      .select('id,patient_id,visit_type,visit_date')
      .not('visit_date', 'is', null)
      .order('visit_date', { ascending: false })
      .limit(8),
    supabase
      .from('interventions')
      .select('id,visit_id,intervention_type,created_at')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  const errors = [patientsRes.error, scoresRes.error, upcomingRes.error, visitsRes.error, interventionsRes.error].filter(Boolean);

  if (errors.length > 0) {
    return { data: null, errorMessage: errors[0]?.message ?? 'No se pudo cargar dashboard.' };
  }

  const priorities = { 1: 0, 2: 0, 3: 0 } as { 1: number; 2: number; 3: number };
  for (const row of scoresRes.data ?? []) {
    const p = Number(row.priority) as 1 | 2 | 3;
    if (p === 1 || p === 2 || p === 3) {
      priorities[p] += 1;
    }
  }

  return {
    data: {
      totalPatients: patientsRes.count ?? 0,
      patientsByPriority: priorities,
      upcomingVisits: (upcomingRes.data ?? []) as DashboardData['upcomingVisits'],
      recentVisits: (visitsRes.data ?? []) as DashboardData['recentVisits'],
      recentInterventions: (interventionsRes.data ?? []) as DashboardData['recentInterventions'],
    },
    errorMessage: null,
  };
}
