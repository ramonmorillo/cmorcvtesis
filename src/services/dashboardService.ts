import { supabase } from '../lib/supabase';
import { INTERVENTION_CATALOG, type CmoPillar } from '../constants/interventionCatalog';

export type DashboardData = {
  totalPatients: number;
  patientsByPriority: { 1: number; 2: number; 3: number };
  totalInterventions: number;
  interventionsByPillar: Record<CmoPillar, number>;
  interventionsByLevel: { 1: number; 2: number; 3: number };
  upcomingVisits: Array<{ id: string; patient_id: string; study_code: string | null; visit_type: string | null; scheduled_date: string | null }>;
  recentVisits: Array<{ id: string; patient_id: string; study_code: string | null; visit_type: string | null; visit_date: string | null }>;
  recentInterventions: Array<{ id: string; visit_id: string; patient_id: string; intervention_type: string; created_at: string | null }>;
};

const DOMAIN_TO_PILLAR: Record<string, CmoPillar> = {
  monitoring: 'oportunidad',
  coordination: 'oportunidad',
  medication: 'capacidad',
  education: 'capacidad',
  safety: 'oportunidad',
  lifestyle: 'motivacion',
  adherence: 'motivacion',
};

function normalizeDomain(domain: string | null): string {
  return (domain ?? '').trim().toLowerCase();
}

function getPillarFromIntervention(row: { intervention_type: string | null; intervention_domain: string | null }): CmoPillar | null {
  const normalizedDomain = normalizeDomain(row.intervention_domain);

  if (normalizedDomain in DOMAIN_TO_PILLAR) {
    return DOMAIN_TO_PILLAR[normalizedDomain];
  }

  const fromCatalog = INTERVENTION_CATALOG.find((item) => item.label === (row.intervention_type ?? ''));
  return fromCatalog?.cmo_pillar ?? null;
}

export async function loadDashboardData(): Promise<{ data: DashboardData | null; errorMessage: string | null }> {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado. No se puede cargar el dashboard.' };
  }

  const now = new Date().toISOString().slice(0, 10);

  const [patientsRes, scoresRes, upcomingRes, visitsRes, interventionsRes, interventionsAggRes] = await Promise.all([
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
    supabase.from('interventions').select('linked_to_cmo_level,intervention_type,intervention_domain', { count: 'exact' }),
  ]);

  const errors = [
    patientsRes.error,
    scoresRes.error,
    upcomingRes.error,
    visitsRes.error,
    interventionsRes.error,
    interventionsAggRes.error,
  ].filter(Boolean);

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

  const byPillar: Record<CmoPillar, number> = {
    capacidad: 0,
    motivacion: 0,
    oportunidad: 0,
  };
  const byLevel = { 1: 0, 2: 0, 3: 0 } as { 1: number; 2: number; 3: number };

  type InterventionAggRow = {
    linked_to_cmo_level: number | null;
    intervention_type: string | null;
    intervention_domain: string | null;
  };

  for (const item of (interventionsAggRes.data ?? []) as InterventionAggRow[]) {
    const level = Number(item.linked_to_cmo_level) as 1 | 2 | 3;
    if (level === 1 || level === 2 || level === 3) byLevel[level] += 1;

    const pillar = getPillarFromIntervention(item);
    if (pillar) byPillar[pillar] += 1;
  }

  return {
    data: {
      totalPatients: patientsRes.count ?? 0,
      patientsByPriority: priorities,
      totalInterventions: interventionsAggRes.count ?? 0,
      interventionsByPillar: byPillar,
      interventionsByLevel: byLevel,
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
