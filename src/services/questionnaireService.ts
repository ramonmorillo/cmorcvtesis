import { supabase } from '../lib/supabase';

export type QuestionnaireType = 'iexpac' | 'morisky' | 'eq5d';

type QuestionnaireResponseRow = {
  id: string;
  visit_id: string;
  patient_id?: string | null;
  visit_type: string | null;
  questionnaire_type: QuestionnaireType;
  responses: Record<string, unknown>;
  total_score: number | null;
  secondary_score: number | null;
  created_at: string;
  updated_at: string;
};

export type QuestionnaireResponseRecord = {
  id: string;
  patient_id: string | null;
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
  patient_id?: string;
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

function normalizeQuestionnaireRows(
  rows: QuestionnaireResponseRow[],
  resolvePatientId: (row: QuestionnaireResponseRow) => string | null,
): QuestionnaireResponseRecord[] {
  return rows.map((row) => ({
    id: row.id,
    patient_id: resolvePatientId(row),
    visit_id: row.visit_id,
    visit_type: row.visit_type ?? 'unknown',
    questionnaire_type: row.questionnaire_type,
    responses: row.responses,
    total_score: row.total_score,
    secondary_score: row.secondary_score,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export function isQuestionnaireVisitType(visitType: string | null | undefined): boolean {
  return visitType === 'baseline' || visitType === 'final' || visitType === 'month_12';
}

const QUESTIONNAIRE_BASE_SELECT = 'id,visit_id,visit_type,questionnaire_type,responses,total_score,secondary_score,created_at,updated_at';
const QUESTIONNAIRE_PATIENT_VIEW = 'v_questionnaire_responses_patient';

export async function listQuestionnairesByVisit(visitId: string): Promise<{ data: QuestionnaireResponseRecord[]; errorMessage: string | null }> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se pueden cargar cuestionarios.' };
  }

  const { data, error } = await supabase
    .from('questionnaire_responses')
    .select(QUESTIONNAIRE_BASE_SELECT)
    .eq('visit_id', visitId);

  if (error) {
    return { data: [], errorMessage: extractErrorMessage(error) };
  }

  return {
    data: normalizeQuestionnaireRows((data ?? []) as QuestionnaireResponseRow[], () => null),
    errorMessage: null,
  };
}

export async function getQuestionnairesByPatient(patientId: string): Promise<{ data: QuestionnaireResponseRecord[]; errorMessage: string | null }> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se pueden cargar cuestionarios.' };
  }

  const { data, error } = await supabase
    .from(QUESTIONNAIRE_PATIENT_VIEW)
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) {
    return { data: [], errorMessage: extractErrorMessage(error) };
  }

  return {
    data: normalizeQuestionnaireRows((data ?? []) as QuestionnaireResponseRow[], (row) => row.patient_id ?? null),
    errorMessage: null,
  };
}

export const listQuestionnairesByPatient = getQuestionnairesByPatient;

export async function saveQuestionnaireBundle(input: QuestionnaireResponseUpsertInput[]): Promise<{ data: QuestionnaireResponseRecord[]; errorMessage: string | null }> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se pueden guardar cuestionarios.' };
  }

  const payload = input.map(({ visit_id, visit_type, questionnaire_type, responses, total_score, secondary_score }) => ({
    visit_id,
    visit_type,
    questionnaire_type,
    responses,
    total_score,
    secondary_score,
  }));

  const { data, error } = await supabase
    .from('questionnaire_responses')
    .upsert(payload, { onConflict: 'visit_id,questionnaire_type' })
    .select(QUESTIONNAIRE_BASE_SELECT);

  if (error) {
    return { data: [], errorMessage: extractErrorMessage(error) };
  }

  return {
    data: normalizeQuestionnaireRows((data ?? []) as QuestionnaireResponseRow[], () => null),
    errorMessage: null,
  };
}
