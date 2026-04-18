import { supabase } from '../lib/supabase';
import type {
  BiologicalSex,
  EducationLevel,
  PhysicalActivityPattern,
  RaceEthnicityRisk,
  SmokingStatus,
  YesNoUnknown,
} from './cmoScoringEngine';

type TriState = Exclude<YesNoUnknown, null>;

export type ClinicalAssessment = {
  id: string;
  visit_id: string;
  education_level: EducationLevel;
  pregnancy_postpartum: TriState | null;
  biological_sex: BiologicalSex;
  race_ethnicity_risk: RaceEthnicityRisk;
  hypertension_present: TriState | null;
  cv_pathology_present: TriState | null;
  comorbidities_present: TriState | null;
  recent_cvd_12m: TriState | null;
  hospital_er_use_12m: TriState | null;
  physical_activity_pattern: PhysicalActivityPattern;
  social_support_absent: TriState | null;
  psychosocial_stress: TriState | null;
  chronic_med_count: number | null;
  recent_regimen_change: TriState | null;
  regimen_complexity_present: TriState | null;
  adherence_problem: TriState | null;
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
  smoker_status: SmokingStatus;
  diet_score: number | null;
  safety_incidents: string | null;
  adverse_events_count: number | null;
  high_risk_medication_present: boolean | null;
  created_at?: string;
  updated_at?: string;
};

export type NewClinicalAssessmentInput = Omit<ClinicalAssessment, 'id' | 'created_at' | 'updated_at'>;

const ASSESSMENT_SELECT =
  'id,visit_id,education_level,pregnancy_postpartum,biological_sex,race_ethnicity_risk,hypertension_present,cv_pathology_present,comorbidities_present,recent_cvd_12m,hospital_er_use_12m,physical_activity_pattern,social_support_absent,psychosocial_stress,chronic_med_count,recent_regimen_change,regimen_complexity_present,adherence_problem,systolic_bp,diastolic_bp,heart_rate,weight_kg,height_cm,bmi,waist_cm,ldl_mg_dl,hdl_mg_dl,non_hdl_mg_dl,fasting_glucose_mg_dl,hba1c_pct,score2_value,framingham_value,cv_risk_level,smoker_status,diet_score,safety_incidents,adverse_events_count,high_risk_medication_present,created_at,updated_at';

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Error desconocido al procesar evaluación clínica.';
}

const TRISTATE_FIELDS = [
  'pregnancy_postpartum',
  'hypertension_present',
  'cv_pathology_present',
  'comorbidities_present',
  'recent_cvd_12m',
  'hospital_er_use_12m',
  'social_support_absent',
  'psychosocial_stress',
  'recent_regimen_change',
  'regimen_complexity_present',
  'adherence_problem',
] as const;

const BOOLEAN_FIELDS = [
  'high_risk_medication_present',
] as const;

const ALLOWED_INPUT_FIELDS = [
  'visit_id',
  'education_level',
  'pregnancy_postpartum',
  'biological_sex',
  'race_ethnicity_risk',
  'hypertension_present',
  'cv_pathology_present',
  'comorbidities_present',
  'recent_cvd_12m',
  'hospital_er_use_12m',
  'physical_activity_pattern',
  'social_support_absent',
  'psychosocial_stress',
  'chronic_med_count',
  'recent_regimen_change',
  'regimen_complexity_present',
  'adherence_problem',
  'systolic_bp',
  'diastolic_bp',
  'heart_rate',
  'weight_kg',
  'height_cm',
  'bmi',
  'waist_cm',
  'ldl_mg_dl',
  'hdl_mg_dl',
  'non_hdl_mg_dl',
  'fasting_glucose_mg_dl',
  'hba1c_pct',
  'score2_value',
  'framingham_value',
  'cv_risk_level',
  'smoker_status',
  'diet_score',
  'safety_incidents',
  'adverse_events_count',
  'high_risk_medication_present',
] as const;

function mapTriState(value: unknown): TriState | null {
  if (value === 'yes' || value === 'no' || value === null) return value;
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'yes' || normalized === 'sí' || normalized === 'si' || normalized === 'true') return 'yes';
  if (normalized === 'no' || normalized === 'false') return 'no';
  if (normalized === 'unknown' || normalized === 'desconocido' || normalized === 'no registrado' || normalized === 'not_recorded') return null;
  if (normalized === '') return null;

  return null;
}

function mapNullableBoolean(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'yes' || normalized === 'sí' || normalized === 'si' || normalized === 'true') return true;
  if (normalized === 'no' || normalized === 'false') return false;
  if (normalized === 'unknown' || normalized === 'not_recorded' || normalized === '' || normalized === 'no registrado') return null;
  return null;
}

function normalizeAssessmentInput(input: NewClinicalAssessmentInput): NewClinicalAssessmentInput {
  const rawInput = input as Partial<Record<string, unknown>>;
  const normalizedRecord: Record<string, unknown> = {};
  const unknownKeys = Object.keys(rawInput).filter((key) => !ALLOWED_INPUT_FIELDS.includes(key as (typeof ALLOWED_INPUT_FIELDS)[number]));

  if (unknownKeys.length > 0) {
    console.warn('[upsertClinicalAssessment] Ignoring legacy/unexpected fields:', unknownKeys);
  }

  for (const field of ALLOWED_INPUT_FIELDS) {
    normalizedRecord[field] = rawInput[field] ?? null;
  }

  if (typeof normalizedRecord.visit_id !== 'string') {
    normalizedRecord.visit_id = input.visit_id;
  }

  for (const field of TRISTATE_FIELDS) {
    normalizedRecord[field] = mapTriState(rawInput[field]);
  }

  for (const field of BOOLEAN_FIELDS) {
    normalizedRecord[field] = mapNullableBoolean(rawInput[field]);
  }

  return normalizedRecord as NewClinicalAssessmentInput;
}

export async function upsertClinicalAssessment(input: NewClinicalAssessmentInput) {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado. No se puede guardar la evaluación clínica.' };
  }

  const normalizedInput = normalizeAssessmentInput(input);
  console.log('[upsertClinicalAssessment] payload:', JSON.stringify(normalizedInput, null, 2));

  const { data, error } = await supabase
    .from('clinical_assessments')
    .upsert(normalizedInput, { onConflict: 'visit_id' })
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
