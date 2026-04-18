import { getVisitTypeLabel } from '../constants/enums';
import { supabase } from '../lib/supabase';

type ExportOutcome = {
  success: boolean;
  errorMessage: string | null;
  generatedFiles: string[];
};

type PatientRow = {
  id: string;
  study_code: string;
  inclusion_date: string | null;
  age_at_inclusion: number | null;
  sex: string | null;
  created_at: string | null;
};

type VisitRow = {
  id: string;
  patient_id: string;
  visit_type: string | null;
  visit_number: number | null;
  visit_date: string | null;
  scheduled_date: string | null;
  created_at: string | null;
};

type ScoreRow = {
  visit_id: string;
  score: number | null;
  priority: number | null;
};

type InterventionRow = {
  id: string;
  visit_id: string;
  intervention_type: string;
  intervention_domain: string | null;
  priority_level: string | null;
  delivered: boolean | null;
  linked_to_cmo_level: number | null;
  outcome: string | null;
  created_at: string | null;
};

type AssessmentRow = {
  visit_id: string;
  education_level: string | null;
  pregnancy_postpartum: string | null;
  biological_sex: string | null;
  race_ethnicity_risk: string | null;
  hypertension_present: string | null;
  cv_pathology_present: string | null;
  comorbidities_present: string | null;
  recent_cvd_12m: string | null;
  hospital_er_use_12m: string | null;
  physical_activity_pattern: string | null;
  social_support_absent: string | null;
  psychosocial_stress: string | null;
  chronic_med_count: number | null;
  recent_regimen_change: string | null;
  regimen_complexity_present: string | null;
  adherence_problem: string | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  heart_rate: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  bmi: number | null;
  waist_cm: number | null;
  ldl_mg_dl: number | null;
  hdl_mg_dl: number | null;
  non_hdl_mg_dl: number | null;
  fasting_glucose_mg_dl: number | null;
  hba1c_pct: number | null;
  score2_value: number | null;
  framingham_value: number | null;
  cv_risk_level: string | null;
  smoker_status: string | null;
  diet_score: number | null;
  adverse_events_count: number | null;
  high_risk_medication_present: boolean | null;
};

type QuestionnaireRow = {
  visit_id: string;
  patient_id: string;
  visit_type: string;
  questionnaire_type: 'iexpac' | 'morisky' | 'eq5d';
  responses: Record<string, unknown>;
  total_score: number | null;
  secondary_score: number | null;
};

function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (/[,\n";]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const headerLine = headers.join(',');
  const bodyLines = rows.map((row) => headers.map((header) => toCsvValue(row[header])).join(','));
  return [headerLine, ...bodyLines].join('\n');
}

function downloadCsv(fileName: string, csvContent: string) {
  const blob = new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildAnonymousPatientIds(patients: PatientRow[]): Map<string, string> {
  const sorted = [...patients].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id));

  return new Map(sorted.map((patient, index) => [patient.id, `P${String(index + 1).padStart(4, '0')}`]));
}

function getMainPillar(interventions: InterventionRow[]): string {
  if (interventions.length === 0) return '';

  const counts = new Map<string, number>();
  interventions.forEach((intervention) => {
    const pillar = intervention.intervention_domain ?? 'sin_pilar';
    counts.set(pillar, (counts.get(pillar) ?? 0) + 1);
  });

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

function getVisitOutcome(interventions: InterventionRow[]): string {
  const values = interventions
    .map((intervention) => intervention.outcome?.trim())
    .filter((value): value is string => Boolean(value));

  if (values.length === 0) return '';

  const counts = new Map<string, number>();
  values.forEach((value) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

function isBaselineVisitType(visitType: string | null): boolean {
  return visitType === 'baseline';
}

function isFinalVisitType(visitType: string | null): boolean {
  return visitType === 'final' || visitType === 'month_12';
}

function compareVisitDate(a: VisitRow, b: VisitRow): number {
  const tsA = new Date(a.visit_date ?? a.scheduled_date ?? '9999-12-31').getTime();
  const tsB = new Date(b.visit_date ?? b.scheduled_date ?? '9999-12-31').getTime();
  if (tsA !== tsB) return tsA - tsB;
  return (a.created_at ?? '').localeCompare(b.created_at ?? '');
}

function getLatestVisitIdByType(visits: VisitRow[], selector: (visitType: string | null) => boolean): string | null {
  const filtered = [...visits].filter((visit) => selector(visit.visit_type)).sort(compareVisitDate);
  return filtered.length > 0 ? filtered[filtered.length - 1].id : null;
}

export async function exportThesisDataCsvBundle(): Promise<ExportOutcome> {
  if (!supabase) {
    return { success: false, errorMessage: 'Supabase no está configurado. No se puede exportar.', generatedFiles: [] };
  }

  const [
    patientsResult,
    visitsResult,
    scoresResult,
    interventionsResult,
    assessmentsResult,
    questionnairesResult,
  ] = await Promise.all([
    supabase.from('patients').select('id,study_code,inclusion_date,age_at_inclusion,sex,created_at').order('created_at', { ascending: true }),
    supabase.from('visits').select('id,patient_id,visit_type,visit_number,visit_date,scheduled_date,created_at').order('created_at', { ascending: true }),
    supabase.from('cmo_scores').select('visit_id,score,priority'),
    supabase.from('interventions').select('id,visit_id,intervention_type,intervention_domain,priority_level,delivered,linked_to_cmo_level,outcome,created_at').order('created_at', { ascending: true }),
    supabase.from('clinical_assessments').select('visit_id,education_level,pregnancy_postpartum,biological_sex,race_ethnicity_risk,hypertension_present,cv_pathology_present,comorbidities_present,recent_cvd_12m,hospital_er_use_12m,physical_activity_pattern,social_support_absent,psychosocial_stress,chronic_med_count,recent_regimen_change,regimen_complexity_present,adherence_problem,systolic_bp,diastolic_bp,heart_rate,weight_kg,height_cm,bmi,waist_cm,ldl_mg_dl,hdl_mg_dl,non_hdl_mg_dl,fasting_glucose_mg_dl,hba1c_pct,score2_value,framingham_value,cv_risk_level,smoker_status,diet_score,adverse_events_count,high_risk_medication_present'),
    supabase.from('questionnaire_responses').select('visit_id,patient_id,visit_type,questionnaire_type,responses,total_score,secondary_score'),
  ]);

  const firstError = [
    patientsResult.error,
    visitsResult.error,
    scoresResult.error,
    interventionsResult.error,
    assessmentsResult.error,
    questionnairesResult.error,
  ].find(Boolean);

  if (firstError) {
    return { success: false, errorMessage: firstError.message, generatedFiles: [] };
  }

  const patients = (patientsResult.data ?? []) as PatientRow[];
  const visits = (visitsResult.data ?? []) as VisitRow[];
  const scores = (scoresResult.data ?? []) as ScoreRow[];
  const interventions = (interventionsResult.data ?? []) as InterventionRow[];
  const assessments = (assessmentsResult.data ?? []) as AssessmentRow[];
  const questionnaires = (questionnairesResult.data ?? []) as QuestionnaireRow[];

  const anonymizedPatientIdByRawId = buildAnonymousPatientIds(patients);
  const anonymizedVisitIdByRawId = new Map(visits.map((visit, index) => [visit.id, `V${String(index + 1).padStart(5, '0')}`]));

  const scoreByVisitId = new Map(scores.map((score) => [score.visit_id, score]));
  const assessmentByVisitId = new Map(assessments.map((assessment) => [assessment.visit_id, assessment]));
  const interventionsByVisitId = interventions.reduce<Map<string, InterventionRow[]>>((acc, intervention) => {
    const list = acc.get(intervention.visit_id) ?? [];
    list.push(intervention);
    acc.set(intervention.visit_id, list);
    return acc;
  }, new Map());

  const questionnaireByVisitAndType = questionnaires.reduce<Map<string, Map<string, QuestionnaireRow>>>((acc, item) => {
    if (!acc.has(item.visit_id)) acc.set(item.visit_id, new Map());
    acc.get(item.visit_id)?.set(item.questionnaire_type, item);
    return acc;
  }, new Map());

  const patientsCsvRows = patients.map((patient) => {
    const patientVisits = visits.filter((v) => v.patient_id === patient.id);
    const baselineVisitId = getLatestVisitIdByType(patientVisits, isBaselineVisitType);
    const finalVisitId = getLatestVisitIdByType(patientVisits, isFinalVisitType);

    const baselineIexpac = baselineVisitId ? questionnaireByVisitAndType.get(baselineVisitId)?.get('iexpac') : null;
    const finalIexpac = finalVisitId ? questionnaireByVisitAndType.get(finalVisitId)?.get('iexpac') : null;
    const baselineMorisky = baselineVisitId ? questionnaireByVisitAndType.get(baselineVisitId)?.get('morisky') : null;
    const finalMorisky = finalVisitId ? questionnaireByVisitAndType.get(finalVisitId)?.get('morisky') : null;
    const baselineEq5d = baselineVisitId ? questionnaireByVisitAndType.get(baselineVisitId)?.get('eq5d') : null;
    const finalEq5d = finalVisitId ? questionnaireByVisitAndType.get(finalVisitId)?.get('eq5d') : null;

    const iexpacBasal = baselineIexpac?.total_score ?? null;
    const iexpacFinal = finalIexpac?.total_score ?? null;
    const eq5dVasBasal = baselineEq5d?.secondary_score ?? null;
    const eq5dVasFinal = finalEq5d?.secondary_score ?? null;

    return {
      patient_id: anonymizedPatientIdByRawId.get(patient.id) ?? '',
      study_code: patient.study_code,
      inclusion_date: patient.inclusion_date,
      age_at_inclusion: patient.age_at_inclusion,
      sex: patient.sex,
      IEXPAC_basal: iexpacBasal,
      IEXPAC_final: iexpacFinal,
      delta_IEXPAC: iexpacBasal !== null && iexpacFinal !== null ? Number((iexpacFinal - iexpacBasal).toFixed(2)) : null,
      Morisky_basal: baselineMorisky?.total_score ?? null,
      Morisky_final: finalMorisky?.total_score ?? null,
      EQ5Dvas_basal: eq5dVasBasal,
      EQ5Dvas_final: eq5dVasFinal,
      delta_EQ5Dvas: eq5dVasBasal !== null && eq5dVasFinal !== null ? Number((eq5dVasFinal - eq5dVasBasal).toFixed(2)) : null,
    };
  });

  const visitsCsvRows = visits.map((visit) => ({
    visit_id: anonymizedVisitIdByRawId.get(visit.id) ?? '',
    patient_id: anonymizedPatientIdByRawId.get(visit.patient_id) ?? '',
    visit_type: visit.visit_type,
    visit_number: visit.visit_number,
    visit_date: visit.visit_date,
    scheduled_date: visit.scheduled_date,
  }));

  const stratificationCsvRows = visits.map((visit) => {
    const score = scoreByVisitId.get(visit.id);
    const assessment = assessmentByVisitId.get(visit.id);
    const q = questionnaireByVisitAndType.get(visit.id);

    return {
      visit_id: anonymizedVisitIdByRawId.get(visit.id) ?? '',
      patient_id: anonymizedPatientIdByRawId.get(visit.patient_id) ?? '',
      score_cmo: score?.score ?? null,
      nivel_cmo: score?.priority ?? null,
      IEXPAC: q?.get('iexpac')?.total_score ?? null,
      Morisky: q?.get('morisky')?.total_score ?? null,
      EQ5D_vas: q?.get('eq5d')?.secondary_score ?? null,
      education_level: assessment?.education_level ?? '',
      pregnancy_postpartum: assessment?.pregnancy_postpartum ?? '',
      biological_sex: assessment?.biological_sex ?? '',
      race_ethnicity_risk: assessment?.race_ethnicity_risk ?? '',
      hypertension_present: assessment?.hypertension_present ?? '',
      cv_pathology_present: assessment?.cv_pathology_present ?? '',
      comorbidities_present: assessment?.comorbidities_present ?? '',
      recent_cvd_12m: assessment?.recent_cvd_12m ?? '',
      hospital_er_use_12m: assessment?.hospital_er_use_12m ?? '',
      physical_activity_pattern: assessment?.physical_activity_pattern ?? '',
      social_support_absent: assessment?.social_support_absent ?? '',
      psychosocial_stress: assessment?.psychosocial_stress ?? '',
      chronic_med_count: assessment?.chronic_med_count ?? null,
      recent_regimen_change: assessment?.recent_regimen_change ?? '',
      regimen_complexity_present: assessment?.regimen_complexity_present ?? '',
      adherence_problem: assessment?.adherence_problem ?? '',
      systolic_bp: assessment?.systolic_bp ?? null,
      diastolic_bp: assessment?.diastolic_bp ?? null,
      heart_rate: assessment?.heart_rate ?? null,
      weight_kg: assessment?.weight_kg ?? null,
      height_cm: assessment?.height_cm ?? null,
      bmi: assessment?.bmi ?? null,
      waist_cm: assessment?.waist_cm ?? null,
      ldl_mg_dl: assessment?.ldl_mg_dl ?? null,
      hdl_mg_dl: assessment?.hdl_mg_dl ?? null,
      non_hdl_mg_dl: assessment?.non_hdl_mg_dl ?? null,
      fasting_glucose_mg_dl: assessment?.fasting_glucose_mg_dl ?? null,
      hba1c_pct: assessment?.hba1c_pct ?? null,
      score2_value: assessment?.score2_value ?? null,
      framingham_value: assessment?.framingham_value ?? null,
      cv_risk_level: assessment?.cv_risk_level ?? '',
      smoker_status: assessment?.smoker_status ?? '',
      diet_score: assessment?.diet_score ?? null,
      adverse_events_count: assessment?.adverse_events_count ?? null,
      high_risk_medication_present: assessment?.high_risk_medication_present ?? null,
    };
  });

  const interventionsCsvRows = interventions.map((intervention, index) => ({
    intervention_id: `I${String(index + 1).padStart(6, '0')}`,
    visit_id: anonymizedVisitIdByRawId.get(intervention.visit_id) ?? '',
    intervention_type: intervention.intervention_type,
    intervention_domain: intervention.intervention_domain,
    priority_level: intervention.priority_level,
    delivered: intervention.delivered,
    linked_to_cmo_level: intervention.linked_to_cmo_level,
    outcome: intervention.outcome,
  }));

  const questionnairesCsvRows = questionnaires.map((q) => ({
    patient_id: anonymizedPatientIdByRawId.get(q.patient_id) ?? '',
    visit_id: anonymizedVisitIdByRawId.get(q.visit_id) ?? '',
    visit_type: q.visit_type,
    questionnaire_type: q.questionnaire_type,
    total_score: q.total_score,
    secondary_score: q.secondary_score,
    responses_raw: JSON.stringify(q.responses ?? {}),
  }));

  const datasetMaestroRows = visits.map((visit) => {
    const patient = patients.find((row) => row.id === visit.patient_id);
    const score = scoreByVisitId.get(visit.id);
    const assessment = assessmentByVisitId.get(visit.id);
    const visitInterventions = interventionsByVisitId.get(visit.id) ?? [];
    const qByType = questionnaireByVisitAndType.get(visit.id);

    return {
      study_code: patient?.study_code ?? '',
      patient_id: anonymizedPatientIdByRawId.get(visit.patient_id) ?? '',
      visit_type: getVisitTypeLabel(visit.visit_type),
      visit_number: visit.visit_number,
      visit_date: visit.visit_date,
      edad: patient?.age_at_inclusion ?? null,
      sexo: patient?.sex ?? assessment?.biological_sex ?? '',
      score_cmo: score?.score ?? null,
      nivel_cmo: score?.priority ?? null,
      IEXPAC: qByType?.get('iexpac')?.total_score ?? null,
      Morisky: qByType?.get('morisky')?.total_score ?? null,
      EQ5D_vas: qByType?.get('eq5d')?.secondary_score ?? null,
      EQ5D_profile: String(qByType?.get('eq5d')?.responses?.profile ?? ''),
      education_level: assessment?.education_level ?? '',
      pregnancy_postpartum: assessment?.pregnancy_postpartum ?? '',
      biological_sex: assessment?.biological_sex ?? '',
      race_ethnicity_risk: assessment?.race_ethnicity_risk ?? '',
      hypertension_present: assessment?.hypertension_present ?? '',
      cv_pathology_present: assessment?.cv_pathology_present ?? '',
      comorbidities_present: assessment?.comorbidities_present ?? '',
      recent_cvd_12m: assessment?.recent_cvd_12m ?? '',
      hospital_er_use_12m: assessment?.hospital_er_use_12m ?? '',
      physical_activity_pattern: assessment?.physical_activity_pattern ?? '',
      social_support_absent: assessment?.social_support_absent ?? '',
      psychosocial_stress: assessment?.psychosocial_stress ?? '',
      chronic_med_count: assessment?.chronic_med_count ?? null,
      recent_regimen_change: assessment?.recent_regimen_change ?? '',
      regimen_complexity_present: assessment?.regimen_complexity_present ?? '',
      adherence_problem: assessment?.adherence_problem ?? '',
      systolic_bp: assessment?.systolic_bp ?? null,
      diastolic_bp: assessment?.diastolic_bp ?? null,
      heart_rate: assessment?.heart_rate ?? null,
      weight_kg: assessment?.weight_kg ?? null,
      height_cm: assessment?.height_cm ?? null,
      bmi: assessment?.bmi ?? null,
      waist_cm: assessment?.waist_cm ?? null,
      ldl_mg_dl: assessment?.ldl_mg_dl ?? null,
      hdl_mg_dl: assessment?.hdl_mg_dl ?? null,
      non_hdl_mg_dl: assessment?.non_hdl_mg_dl ?? null,
      fasting_glucose_mg_dl: assessment?.fasting_glucose_mg_dl ?? null,
      hba1c_pct: assessment?.hba1c_pct ?? null,
      score2_value: assessment?.score2_value ?? null,
      framingham_value: assessment?.framingham_value ?? null,
      cv_risk_level: assessment?.cv_risk_level ?? '',
      smoker_status: assessment?.smoker_status ?? '',
      diet_score: assessment?.diet_score ?? null,
      adverse_events_count: assessment?.adverse_events_count ?? null,
      high_risk_medication_present: assessment?.high_risk_medication_present ?? null,
      n_intervenciones: visitInterventions.length,
      pilar_principal: getMainPillar(visitInterventions),
      outcome: getVisitOutcome(visitInterventions),
      fecha_inclusion: patient?.inclusion_date ?? '',
    };
  });

  const patientsCsv = toCsv(Object.keys(patientsCsvRows[0] ?? { patient_id: '' }), patientsCsvRows);
  const visitsCsv = toCsv(['visit_id', 'patient_id', 'visit_type', 'visit_number', 'visit_date', 'scheduled_date'], visitsCsvRows);
  const stratificationCsv = toCsv(Object.keys(stratificationCsvRows[0] ?? { visit_id: '', patient_id: '' }), stratificationCsvRows);
  const interventionsCsv = toCsv(['intervention_id', 'visit_id', 'intervention_type', 'intervention_domain', 'priority_level', 'delivered', 'linked_to_cmo_level', 'outcome'], interventionsCsvRows);
  const questionnairesCsv = toCsv(Object.keys(questionnairesCsvRows[0] ?? { patient_id: '' }), questionnairesCsvRows);
  const datasetMaestroCsv = toCsv(Object.keys(datasetMaestroRows[0] ?? {}), datasetMaestroRows);

  downloadCsv('pacientes.csv', patientsCsv);
  downloadCsv('visitas.csv', visitsCsv);
  downloadCsv('estratificaciones.csv', stratificationCsv);
  downloadCsv('intervenciones.csv', interventionsCsv);
  downloadCsv('cuestionarios.csv', questionnairesCsv);
  downloadCsv('dataset_maestro.csv', datasetMaestroCsv);

  return {
    success: true,
    errorMessage: null,
    generatedFiles: ['pacientes.csv', 'visitas.csv', 'estratificaciones.csv', 'intervenciones.csv', 'cuestionarios.csv', 'dataset_maestro.csv'],
  };
}
