import { supabase } from '../lib/supabase';

export type QuestionnaireType = 'iexpac' | 'morisky' | 'eq5d' | 'pam10';

const CANONICAL_QUESTIONNAIRE_CODE: Record<QuestionnaireType, string> = {
  iexpac: 'IEXPAC',
  morisky: 'MORISKY_GREEN',
  eq5d: 'EQ5D_5L',
  pam10: 'PAM10',
};

type QuestionnaireMeasurementMapRow = {
  questionnaire_code: string;
  measurement_id: string;
};

type VisitRelationRow = {
  patient_id?: string | null;
  visit_type?: string | null;
};

type QuestionnaireResponseRow = {
  id: string;
  visit_id: string;
  user_id: string | null;
  measurement_id?: string | null;
  responses: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  visits?: VisitRelationRow | VisitRelationRow[] | null;
};

export type QuestionnaireResponseRecord = {
  id: string;
  patient_id: string | null;
  user_id: string | null;
  visit_id: string;
  visit_type: string;
  questionnaire_type: QuestionnaireType;
  measurement_id: string | null;
  responses: Record<string, unknown>;
  total_score: number | null;
  secondary_score: number | null;
  created_at: string;
  updated_at: string;
};

export type QuestionnaireResponseUpsertInput = {
  visit_id: string;
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

function normalizeQuestionnaireCode(raw: unknown): QuestionnaireType | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();

  if (value === 'iexpac') return 'iexpac';
  if (value === 'morisky' || value === 'morisky-green' || value === 'morisky_green') return 'morisky';
  if (value === 'eq5d' || value === 'eq-5d' || value === 'eq5d-5l' || value === 'eq_5d' || value === 'eq5d_5l') return 'eq5d';
  if (value === 'pam10' || value === 'pam-10' || value === 'pam_10') return 'pam10';

  return null;
}

function normalizeCanonicalQuestionnaireCode(raw: unknown): QuestionnaireType | null {
  if (typeof raw !== 'string') return null;

  if (raw === CANONICAL_QUESTIONNAIRE_CODE.iexpac) return 'iexpac';
  if (raw === CANONICAL_QUESTIONNAIRE_CODE.morisky) return 'morisky';
  if (raw === CANONICAL_QUESTIONNAIRE_CODE.eq5d) return 'eq5d';
  if (raw === CANONICAL_QUESTIONNAIRE_CODE.pam10) return 'pam10';

  return normalizeQuestionnaireCode(raw);
}

function getVisitRelation(row: QuestionnaireResponseRow): VisitRelationRow {
  if (Array.isArray(row.visits)) {
    return row.visits[0] ?? {};
  }

  return row.visits ?? {};
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function deriveScores(questionnaireType: QuestionnaireType, responses: Record<string, unknown>): { totalScore: number | null; secondaryScore: number | null } {
  const explicitTotal = parseNumber(responses.total_score);
  const explicitSecondary = parseNumber(responses.secondary_score);

  if (explicitTotal !== null || explicitSecondary !== null) {
    return { totalScore: explicitTotal, secondaryScore: explicitSecondary };
  }

  if (questionnaireType === 'iexpac') {
    let sum = 0;
    for (let idx = 1; idx <= 11; idx += 1) {
      const value = parseNumber(responses[`q${idx}`]);
      if (value === null || value < 1 || value > 5) {
        return { totalScore: null, secondaryScore: parseNumber(responses.q12) };
      }
      sum += value;
    }

    return {
      totalScore: Number((10 * (sum - 11) / 44).toFixed(2)),
      secondaryScore: parseNumber(responses.q12),
    };
  }

  if (questionnaireType === 'morisky') {
    const q1 = responses.q1;
    const q2 = responses.q2;
    const q3 = responses.q3;
    const q4 = responses.q4;

    if (typeof q1 === 'boolean' && typeof q2 === 'boolean' && typeof q3 === 'boolean' && typeof q4 === 'boolean') {
      const adherent = q1 === false && q2 === true && q3 === false && q4 === false;
      return { totalScore: adherent ? 1 : 0, secondaryScore: null };
    }

    return { totalScore: null, secondaryScore: null };
  }

  if (questionnaireType === 'pam10') {
    let sum = 0;
    for (let idx = 1; idx <= 10; idx += 1) {
      const value = parseNumber(responses[`q${idx}`]);
      if (value === null || value < 1 || value > 5) {
        return { totalScore: null, secondaryScore: null };
      }
      sum += value;
    }
    return { totalScore: sum, secondaryScore: null };
  }

  return {
    totalScore: null,
    secondaryScore: parseNumber(responses.vas),
  };
}

async function resolveQuestionnaireMeasurementMap(): Promise<{
  measurementIdByType: Map<QuestionnaireType, string>;
  questionnaireTypeByMeasurementId: Map<string, QuestionnaireType>;
  errorMessage: string | null;
}> {
  if (!supabase) {
    return {
      measurementIdByType: new Map(),
      questionnaireTypeByMeasurementId: new Map(),
      errorMessage: 'Supabase no está configurado.',
    };
  }

  const { data, error } = await supabase
    .from('questionnaire_measurement_map')
    .select('questionnaire_code,measurement_id');

  if (error) {
    return {
      measurementIdByType: new Map(),
      questionnaireTypeByMeasurementId: new Map(),
      errorMessage: extractErrorMessage(error),
    };
  }

  const measurementIdByType = new Map<QuestionnaireType, string>();
  const questionnaireTypeByMeasurementId = new Map<string, QuestionnaireType>();

  ((data ?? []) as QuestionnaireMeasurementMapRow[]).forEach((row) => {
    const questionnaireType = normalizeCanonicalQuestionnaireCode(row.questionnaire_code);
    if (!questionnaireType) return;

    measurementIdByType.set(questionnaireType, row.measurement_id);
    questionnaireTypeByMeasurementId.set(row.measurement_id, questionnaireType);
  });

  return { measurementIdByType, questionnaireTypeByMeasurementId, errorMessage: null };
}

function normalizeQuestionnaireRows(
  rows: QuestionnaireResponseRow[],
  questionnaireTypeByMeasurementId: Map<string, QuestionnaireType>,
): QuestionnaireResponseRecord[] {
  return rows.flatMap((row) => {
    const questionnaireType = row.measurement_id ? (questionnaireTypeByMeasurementId.get(row.measurement_id) ?? null) : null;

    if (!questionnaireType) {
      return [];
    }

    const visit = getVisitRelation(row);
    const scores = deriveScores(questionnaireType, row.responses ?? {});

    return [{
      id: row.id,
      patient_id: visit.patient_id ?? row.user_id ?? null,
      user_id: row.user_id,
      visit_id: row.visit_id,
      visit_type: visit.visit_type ?? 'unknown',
      questionnaire_type: questionnaireType,
      measurement_id: row.measurement_id ?? null,
      responses: row.responses,
      total_score: scores.totalScore,
      secondary_score: scores.secondaryScore,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }];
  });
}

export function isQuestionnaireVisitType(visitType: string | null | undefined): boolean {
  return visitType === 'baseline' || visitType === 'final' || visitType === 'month_12';
}

const QUESTIONNAIRE_BASE_SELECT = 'id,visit_id,user_id,measurement_id,responses,created_at,updated_at,visits(patient_id,visit_type)';

export async function listQuestionnairesByVisit(visitId: string): Promise<{ data: QuestionnaireResponseRecord[]; errorMessage: string | null }> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se pueden cargar cuestionarios.' };
  }

  const [measurementMapResult, queryResult] = await Promise.all([
    resolveQuestionnaireMeasurementMap(),
    supabase.from('questionnaire_responses').select(QUESTIONNAIRE_BASE_SELECT).eq('visit_id', visitId),
  ]);

  if (measurementMapResult.errorMessage) {
    return { data: [], errorMessage: measurementMapResult.errorMessage };
  }

  if (queryResult.error) {
    return { data: [], errorMessage: extractErrorMessage(queryResult.error) };
  }

  return {
    data: normalizeQuestionnaireRows(((queryResult.data ?? []) as unknown) as QuestionnaireResponseRow[], measurementMapResult.questionnaireTypeByMeasurementId),
    errorMessage: null,
  };
}

export async function getQuestionnairesByPatient(patientId: string): Promise<{ data: QuestionnaireResponseRecord[]; errorMessage: string | null }> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se pueden cargar cuestionarios.' };
  }

  const [measurementMapResult, visitQueryResult] = await Promise.all([
    resolveQuestionnaireMeasurementMap(),
    supabase.from('visits').select('id').eq('patient_id', patientId),
  ]);

  if (measurementMapResult.errorMessage) {
    return { data: [], errorMessage: measurementMapResult.errorMessage };
  }

  if (visitQueryResult.error) {
    return { data: [], errorMessage: extractErrorMessage(visitQueryResult.error) };
  }

  const visitIds = (visitQueryResult.data ?? []).map((row) => row.id).filter((id): id is string => typeof id === 'string');
  if (visitIds.length === 0) {
    return { data: [], errorMessage: null };
  }

  const { data, error } = await supabase
    .from('questionnaire_responses')
    .select(QUESTIONNAIRE_BASE_SELECT)
    .in('visit_id', visitIds)
    .order('created_at', { ascending: false });

  if (error) {
    return { data: [], errorMessage: extractErrorMessage(error) };
  }

  return {
    data: normalizeQuestionnaireRows(((data ?? []) as unknown) as QuestionnaireResponseRow[], measurementMapResult.questionnaireTypeByMeasurementId),
    errorMessage: null,
  };
}

export const listQuestionnairesByPatient = getQuestionnairesByPatient;

export async function saveQuestionnaireBundle(input: QuestionnaireResponseUpsertInput[]): Promise<{ data: QuestionnaireResponseRecord[]; errorMessage: string | null }> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se pueden guardar cuestionarios.' };
  }

  const authResult = await supabase.auth.getUser();
  if (authResult.error) {
    return { data: [], errorMessage: extractErrorMessage(authResult.error) };
  }

  const authenticatedUser = authResult.data.user;
  if (!authenticatedUser) {
    return { data: [], errorMessage: 'No hay un usuario autenticado. Inicia sesión e inténtalo de nuevo.' };
  }

  const measurementMapResult = await resolveQuestionnaireMeasurementMap();
  if (measurementMapResult.errorMessage) {
    return { data: [], errorMessage: measurementMapResult.errorMessage };
  }

  const payload = input.map(({ visit_id, questionnaire_type, responses }) => ({
    visit_id,
    user_id: authenticatedUser.id,
    measurement_id: measurementMapResult.measurementIdByType.get(questionnaire_type) ?? null,
    responses,
  }));

  const { data, error } = await supabase
    .from('questionnaire_responses')
    .upsert(payload, { onConflict: 'visit_id,measurement_id' })
    .select(QUESTIONNAIRE_BASE_SELECT);

  if (error) {
    return { data: [], errorMessage: extractErrorMessage(error) };
  }

  return {
    data: normalizeQuestionnaireRows(((data ?? []) as unknown) as QuestionnaireResponseRow[], measurementMapResult.questionnaireTypeByMeasurementId),
    errorMessage: null,
  };
}

export async function listAllQuestionnaires(): Promise<{ data: QuestionnaireResponseRecord[]; errorMessage: string | null }> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se pueden cargar cuestionarios.' };
  }

  const [measurementMapResult, queryResult] = await Promise.all([
    resolveQuestionnaireMeasurementMap(),
    supabase.from('questionnaire_responses').select(QUESTIONNAIRE_BASE_SELECT),
  ]);

  if (measurementMapResult.errorMessage) {
    return { data: [], errorMessage: measurementMapResult.errorMessage };
  }

  if (queryResult.error) {
    return { data: [], errorMessage: extractErrorMessage(queryResult.error) };
  }

  return {
    data: normalizeQuestionnaireRows(((queryResult.data ?? []) as unknown) as QuestionnaireResponseRow[], measurementMapResult.questionnaireTypeByMeasurementId),
    errorMessage: null,
  };
}
