import { supabase } from '../lib/supabase';

export type QuestionnaireType = 'iexpac' | 'morisky' | 'eq5d';

export type QuestionnaireResponseRecord = {
  id: string;
  patient_id: string;
  visit_id: string;
  visit_type: string;
  questionnaire_type: QuestionnaireType;
  responses: Record<string, unknown>;
  total_score: number | null;
  secondary_score: number | null;
  created_at: string;
  updated_at: string;
};

export type QuestionnaireResponseUpsertInput = {
  patient_id: string;
  visit_id: string;
  visit_type: string;
  questionnaire_type: QuestionnaireType;
  responses: Record<string, unknown>;
  total_score: number | null;
  secondary_score: number | null;
};

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }

  return 'No se pudo procesar el cuestionario.';
}

export function isQuestionnaireVisitType(visitType: string | null | undefined): boolean {
  return visitType === 'baseline' || visitType === 'final' || visitType === 'month_12';
}

export async function listQuestionnairesByVisit(visitId: string): Promise<{ data: QuestionnaireResponseRecord[]; errorMessage: string | null }> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se pueden cargar cuestionarios.' };
  }

  const { data, error } = await supabase
    .from('questionnaire_responses')
    .select('id,patient_id,visit_id,visit_type,questionnaire_type,responses,total_score,secondary_score,created_at,updated_at')
    .eq('visit_id', visitId);

  if (error) {
    return { data: [], errorMessage: extractErrorMessage(error) };
  }

  return { data: (data ?? []) as QuestionnaireResponseRecord[], errorMessage: null };
}

export async function listQuestionnairesByPatient(patientId: string): Promise<{ data: QuestionnaireResponseRecord[]; errorMessage: string | null }> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se pueden cargar cuestionarios.' };
  }

  const { data, error } = await supabase
    .from('questionnaire_responses')
    .select('id,patient_id,visit_id,visit_type,questionnaire_type,responses,total_score,secondary_score,created_at,updated_at')
    .eq('patient_id', patientId)
    .order('updated_at', { ascending: false });

  if (error) {
    return { data: [], errorMessage: extractErrorMessage(error) };
  }

  return { data: (data ?? []) as QuestionnaireResponseRecord[], errorMessage: null };
}

export async function saveQuestionnaireBundle(input: QuestionnaireResponseUpsertInput[]): Promise<{ data: QuestionnaireResponseRecord[]; errorMessage: string | null }> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se pueden guardar cuestionarios.' };
  }

  const { data, error } = await supabase
    .from('questionnaire_responses')
    .upsert(input, { onConflict: 'patient_id,visit_id,questionnaire_type' })
    .select('id,patient_id,visit_id,visit_type,questionnaire_type,responses,total_score,secondary_score,created_at,updated_at');

  if (error) {
    return { data: [], errorMessage: extractErrorMessage(error) };
  }

  return { data: (data ?? []) as QuestionnaireResponseRecord[], errorMessage: null };
}
