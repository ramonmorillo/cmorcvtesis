import { supabase } from '../lib/supabase';

export type QuestionnaireType = 'iexpac' | 'morisky' | 'eq5d';

type VisitJoin = {
  patient_id?: string | null;
  visit_type?: string | null;
};

type QuestionnaireResponseRow = {
  id: string;
  visit_id: string;
  visit_type: string | null;
  questionnaire_type: QuestionnaireType;
  responses: Record<string, unknown>;
  total_score: number | null;
  secondary_score: number | null;
  created_at: string;
  updated_at: string;
  visits?: VisitJoin | VisitJoin[] | null;
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

function pickVisitJoin(visits: QuestionnaireResponseRow['visits']): VisitJoin {
  if (!visits) return {};
  return Array.isArray(visits) ? (visits[0] ?? {}) : visits;
}

function normalizeQuestionnaireRows(rows: QuestionnaireResponseRow[]): QuestionnaireResponseRecord[] {
  return rows.map((row) => {
    const visitJoin = pickVisitJoin(row.visits);

    return {
      id: row.id,
      patient_id: visitJoin.patient_id ?? null,
      visit_id: row.visit_id,
      visit_type: row.visit_type ?? visitJoin.visit_type ?? 'unknown',
      questionnaire_type: row.questionnaire_type,
      responses: row.responses,
      total_score: row.total_score,
      secondary_score: row.secondary_score,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });
}

export function isQuestionnaireVisitType(visitType: string | null | undefined): boolean {
  return visitType === 'baseline' || visitType === 'final' || visitType === 'month_12';
}

const QUESTIONNAIRE_SELECT =
  'id,visit_id,visit_type,questionnaire_type,responses,total_score,secondary_score,created_at,updated_at,visits(patient_id,visit_type)';

export async function listQuestionnairesByVisit(visitId: string): Promise<{ data: QuestionnaireResponseRecord[]; errorMessage: string | null }> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se pueden cargar cuestionarios.' };
  }

  const { data, error } = await supabase
    .from('questionnaire_responses')
    .select(QUESTIONNAIRE_SELECT)
    .eq('visit_id', visitId);

  if (error) {
    return { data: [], errorMessage: extractErrorMessage(error) };
  }

  return { data: normalizeQuestionnaireRows((data ?? []) as QuestionnaireResponseRow[]), errorMessage: null };
}

export async function listQuestionnairesByPatient(patientId: string): Promise<{ data: QuestionnaireResponseRecord[]; errorMessage: string | null }> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se pueden cargar cuestionarios.' };
  }

  const { data, error } = await supabase
    .from('questionnaire_responses')
    .select(QUESTIONNAIRE_SELECT)
    .eq('visits.patient_id', patientId)
    .order('updated_at', { ascending: false });

  if (error) {
    return { data: [], errorMessage: extractErrorMessage(error) };
  }

  return { data: normalizeQuestionnaireRows((data ?? []) as QuestionnaireResponseRow[]), errorMessage: null };
}

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
    .select(QUESTIONNAIRE_SELECT);

  if (error) {
    return { data: [], errorMessage: extractErrorMessage(error) };
  }

  return { data: normalizeQuestionnaireRows((data ?? []) as QuestionnaireResponseRow[]), errorMessage: null };
}
