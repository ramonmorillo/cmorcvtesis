import { supabase } from '../lib/supabase';
import type { SmokerStatus } from '../constants/enums';

export type ClinicalAssessment = {
  id: string;
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
  smoker_status: SmokerStatus | null;
  alcohol_use: string | null;
  physical_activity_level: string | null;
  diet_score: number | null;
  safety_incidents: string | null;
  adverse_events_count: number | null;
  high_risk_medication_present: boolean | null;
  created_at?: string;
  updated_at?: string;
};

export type NewClinicalAssessmentInput = Omit<ClinicalAssessment, 'id' | 'created_at' | 'updated_at'>;

const ASSESSMENT_SELECT =
  'id,visit_id,education_level,pregnancy_postpartum,biological_sex,race_ethnicity_risk,hypertension_present,cv_pathology_present,comorbidities_present,recent_cvd_12m,hospital_er_use_12m,physical_activity_pattern,social_support_absent,psychosocial_stress,chronic_med_count,recent_regimen_change,regimen_complexity_present,adherence_problem,systolic_bp,diastolic_bp,heart_rate,weight_kg,height_cm,bmi,waist_cm,ldl_mg_dl,hdl_mg_dl,non_hdl_mg_dl,fasting_glucose_mg_dl,hba1c_pct,score2_value,framingham_value,cv_risk_level,smoker_status,alcohol_use,physical_activity_level,diet_score,safety_incidents,adverse_events_count,high_risk_medication_present,created_at,updated_at';

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Error desconocido al procesar evaluación clínica.';
}

export async function upsertClinicalAssessment(input: NewClinicalAssessmentInput) {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado. No se puede guardar la evaluación clínica.' };
  }

  const { data, error } = await supabase
    .from('clinical_assessments')
    .upsert(input, { onConflict: 'visit_id' })
    .select(ASSESSMENT_SELECT)
    .maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error) };
  }

  return { data: (data as ClinicalAssessment | null) ?? null, errorMessage: null };
}

export async function getClinicalAssessmentByVisit(visitId: string) {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado. No se puede leer la evaluación clínica.' };
  }

  const { data, error } = await supabase
    .from('clinical_assessments')
    .select(ASSESSMENT_SELECT)
    .eq('visit_id', visitId)
    .maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error) };
  }

  return { data: (data as ClinicalAssessment | null) ?? null, errorMessage: null };
}

export async function getLatestClinicalAssessmentByPatient(patientId: string) {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado. No se puede leer la última evaluación clínica.' };
  }

  const { data, error } = await supabase
    .from('clinical_assessments')
    .select(`${ASSESSMENT_SELECT},visits!inner(patient_id,visit_date)`)
    .eq('visits.patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error) };
  }

  return { data: (data as (ClinicalAssessment & { visits: { patient_id: string; visit_date: string | null } }) | null) ?? null, errorMessage: null };
}
