import { supabase } from '../lib/supabase';
import { INTERVENTION_CATALOG, type CmoPillar } from '../constants/interventionCatalog';

export type DashboardData = {
  totalPatients: number;
  patientsByPriority: { 1: number; 2: number; 3: number };
  patientEvolutionVsBaseline: { improved: number; worsened: number; stable: number };
  totalInterventions: number;
  avgInterventionsPerPatient: number;
  patientsWithoutFollowup90d: number;
  averageScoreByVisitType: Array<{ visitType: string | null; averageScore: number; visitsWithScore: number }>;
  interventionsByPillar: Record<CmoPillar, number>;
  interventionsByLevel: { 1: number; 2: number; 3: number };
  dataQuality: {
    patientsWithoutBaselineStratification: number;
    visitsWithoutScore: number;
    visitsWithoutInterventions: number;
    level1PatientsWithoutIntervention: number;
  };
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
  const ninetyDaysAgoDate = new Date();
  ninetyDaysAgoDate.setDate(ninetyDaysAgoDate.getDate() - 90);
  const ninetyDaysAgo = ninetyDaysAgoDate.toISOString().slice(0, 10);

  const [
    patientsRes,
    baselineProfilesRes,
    visitsForQualityRes,
    scoresRes,
    scoresByVisitTypeRes,
    upcomingRes,
    visitsRes,
    interventionsRes,
    interventionsAggRes,
  ] = await Promise.all([
    supabase.from('patients').select('id'),
    supabase.from('patient_baseline_profile').select('patient_id'),
    supabase
      .from('visits')
      .select('id,patient_id,visit_date,cmo_scores(id),interventions(id)'),
    supabase
      .from('cmo_scores')
      .select('priority,created_at,visits!inner(patient_id)')
      .order('created_at', { ascending: false }),
    supabase
      .from('cmo_scores')
      .select('score,visits!inner(visit_type)'),
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
    baselineProfilesRes.error,
    visitsForQualityRes.error,
    scoresRes.error,
    scoresByVisitTypeRes.error,
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

  const allPatients = (patientsRes.data ?? []) as Array<{ id: string }>;
  const baselineProfiles = (baselineProfilesRes.data ?? []) as Array<{ patient_id: string }>;
  const visitsForQuality = (visitsForQualityRes.data ?? []) as Array<{
    id: string;
    patient_id: string;
    visit_date: string | null;
    cmo_scores: { id: string } | Array<{ id: string }> | null;
    interventions: { id: string } | Array<{ id: string }> | null;
  }>;
  const scoresByVisitType = (scoresByVisitTypeRes.data ?? []) as Array<{
    score: number | string | null;
    visits: { visit_type: string | null } | Array<{ visit_type: string | null }>;
  }>;

  const baselinePatientIds = new Set(baselineProfiles.map((item) => item.patient_id));
  const patientsWithoutBaselineStratification = allPatients.reduce(
    (count, patient) => count + (baselinePatientIds.has(patient.id) ? 0 : 1),
    0,
  );

  const interventionsByPatient = new Map<string, number>();
  let visitsWithoutScore = 0;
  let visitsWithoutInterventions = 0;
  const latestVisitDateByPatient = new Map<string, string>();
  for (const visit of visitsForQuality) {
    const scoreRows = Array.isArray(visit.cmo_scores) ? visit.cmo_scores : (visit.cmo_scores ? [visit.cmo_scores] : []);
    const interventionRows = Array.isArray(visit.interventions)
      ? visit.interventions
      : (visit.interventions ? [visit.interventions] : []);

    if (scoreRows.length === 0) visitsWithoutScore += 1;
    if (interventionRows.length === 0) visitsWithoutInterventions += 1;
    interventionsByPatient.set(visit.patient_id, (interventionsByPatient.get(visit.patient_id) ?? 0) + interventionRows.length);

    if (visit.visit_date) {
      const previous = latestVisitDateByPatient.get(visit.patient_id);
      if (!previous || visit.visit_date > previous) {
        latestVisitDateByPatient.set(visit.patient_id, visit.visit_date);
      }
    }
  }

  const totalPatients = allPatients.length;
  const avgInterventionsPerPatient = totalPatients === 0 ? 0 : Number(((interventionsAggRes.count ?? 0) / totalPatients).toFixed(2));

  const patientsWithoutFollowup90d = allPatients.reduce((count, patient) => {
    const latestVisitDate = latestVisitDateByPatient.get(patient.id);
    if (!latestVisitDate || latestVisitDate < ninetyDaysAgo) {
      return count + 1;
    }
    return count;
  }, 0);

  const baselinePriorityByPatient = new Map<string, 1 | 2 | 3>();
  const latestPriorityByPatient = new Map<string, 1 | 2 | 3>();
  for (const row of (scoresRes.data ?? []) as Array<{ priority: number; visits: { patient_id: string } | Array<{ patient_id: string }> }>) {
    const pid = Array.isArray(row.visits) ? row.visits[0]?.patient_id : row.visits?.patient_id;
    const p = Number(row.priority) as 1 | 2 | 3;
    if (!pid || !(p === 1 || p === 2 || p === 3)) continue;

    if (!latestPriorityByPatient.has(pid)) latestPriorityByPatient.set(pid, p);
    baselinePriorityByPatient.set(pid, p);
  }

  let improved = 0;
  let worsened = 0;
  let stable = 0;
  baselinePriorityByPatient.forEach((baselinePriority, patientId) => {
    const latestPriority = latestPriorityByPatient.get(patientId);
    if (!latestPriority) return;
    if (latestPriority > baselinePriority) improved += 1;
    else if (latestPriority < baselinePriority) worsened += 1;
    else stable += 1;
  });

  let level1PatientsWithoutIntervention = 0;
  latestPriorityByPatient.forEach((priority, patientId) => {
    if (priority === 1 && (interventionsByPatient.get(patientId) ?? 0) === 0) {
      level1PatientsWithoutIntervention += 1;
    }
  });

  const scoreAggregation = new Map<string, { total: number; count: number }>();
  for (const row of scoresByVisitType) {
    const numericScore = Number(row.score);
    if (!Number.isFinite(numericScore)) continue;
    const visitType = Array.isArray(row.visits) ? row.visits[0]?.visit_type : row.visits?.visit_type;
    const key = visitType ?? 'unknown';
    const aggregate = scoreAggregation.get(key) ?? { total: 0, count: 0 };
    aggregate.total += numericScore;
    aggregate.count += 1;
    scoreAggregation.set(key, aggregate);
  }
  const averageScoreByVisitType = Array.from(scoreAggregation.entries())
    .map(([visitType, aggregate]) => ({
      visitType: visitType === 'unknown' ? null : visitType,
      averageScore: Number((aggregate.total / aggregate.count).toFixed(2)),
      visitsWithScore: aggregate.count,
    }))
    .sort((a, b) => (a.visitType ?? '').localeCompare(b.visitType ?? ''));

  return {
    data: {
      totalPatients,
      patientsByPriority: priorities,
      patientEvolutionVsBaseline: { improved, worsened, stable },
      totalInterventions: interventionsAggRes.count ?? 0,
      avgInterventionsPerPatient,
      patientsWithoutFollowup90d,
      averageScoreByVisitType,
      interventionsByPillar: byPillar,
      interventionsByLevel: byLevel,
      dataQuality: {
        patientsWithoutBaselineStratification,
        visitsWithoutScore,
        visitsWithoutInterventions,
        level1PatientsWithoutIntervention,
      },
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
