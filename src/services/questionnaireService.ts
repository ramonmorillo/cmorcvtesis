import { supabase } from '../lib/supabase';

export type QuestionnaireType = 'iexpac' | 'morisky' | 'eq5d';

type QuestionnaireMeasurementField = 'code' | 'slug' | 'name';

type MeasurementCatalogRow = {
  id: string;
  code?: string | null;
  slug?: string | null;
  name?: string | null;
};

type VisitRelationRow = {
  patient_id?: string | null;
  visit_type?: string | null;
};

type QuestionnaireResponseRow = {
  id: string;
  visit_id: string;
  user_id: string | null;
  measurement_id: string;
  responses: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  measurements?: MeasurementCatalogRow | MeasurementCatalogRow[] | null;
  visits?: VisitRelationRow | VisitRelationRow[] | null;
};

export type QuestionnaireResponseRecord = {
  id: string;
  patient_id: string | null;
  user_id: string | null;
  visit_id: string;
  visit_type: string;
  questionnaire_type: QuestionnaireType;
  measurement_id: string;
  responses: Record<string, unknown>;
  total_score: number | null;
  secondary_score: number | null;
  created_at: string;
  updated_at: string;
};

export type QuestionnaireResponseUpsertInput = {
  user_id: string;
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
  if (value === 'morisky' || value === 'morisky-green') return 'morisky';
  if (value === 'eq5d' || value === 'eq-5d' || value === 'eq5d-5l' || value === 'eq_5d') return 'eq5d';

  return null;
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

  return {
    totalScore: null,
    secondaryScore: parseNumber(responses.vas),
  };
}

async function resolveQuestionnaireMeasurementMap(): Promise<{
  map: Map<QuestionnaireType, { id: string; canonicalField: QuestionnaireMeasurementField }>;
  errorMessage: string | null;
}> {
  if (!supabase) {
    return { map: new Map(), errorMessage: 'Supabase no está configurado.' };
  }

  const { data, error } = await supabase
    .from('measurements')
    .select('*')
    .limit(2000);

  if (error) {
    return { map: new Map(), errorMessage: extractErrorMessage(error) };
  }

  const rows = ((data ?? []) as Array<Record<string, unknown>>).filter((row): row is Record<string, unknown> & { id: string } => typeof row.id === 'string');

  const availableFields: QuestionnaireMeasurementField[] = ['code', 'slug', 'name'];
  const canonicalField = availableFields.find((field) => rows.some((row) => typeof row[field] === 'string' && String(row[field]).trim().length > 0));

  if (!canonicalField) {
    return { map: new Map(), errorMessage: 'No se encontró un campo canónico (code/slug/name) en measurements para resolver cuestionarios.' };
  }

  const map = new Map<QuestionnaireType, { id: string; canonicalField: QuestionnaireMeasurementField }>();

  rows.forEach((row) => {
    const questionnaireType = normalizeQuestionnaireCode(row[canonicalField]);
    if (!questionnaireType || map.has(questionnaireType)) return;

    map.set(questionnaireType, { id: row.id, canonicalField });
  });

  return { map, errorMessage: null };
}

function normalizeQuestionnaireRows(
  rows: QuestionnaireResponseRow[],
  measurementIdsByType: Map<QuestionnaireType, string>,
): QuestionnaireResponseRecord[] {
  const measurementTypeById = new Map<string, QuestionnaireType>();
  measurementIdsByType.forEach((measurementId, questionnaireType) => {
    measurementTypeById.set(measurementId, questionnaireType);
  });

  return rows.flatMap((row) => {
    const measurementValue = Array.isArray(row.measurements) ? row.measurements[0] : row.measurements;
    const measurementCode = measurementValue?.code ?? measurementValue?.slug ?? measurementValue?.name ?? null;
    const resolvedByLabel = normalizeQuestionnaireCode(measurementCode);
    const resolvedByMeasurementId = measurementTypeById.get(row.measurement_id) ?? null;
    const questionnaireType = resolvedByLabel ?? resolvedByMeasurementId;

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
      measurement_id: row.measurement_id,
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

const QUESTIONNAIRE_BASE_SELECT = 'id,visit_id,user_id,measurement_id,responses,created_at,updated_at,measurements(*),visits(patient_id,visit_type)';

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

  const measurementIdsByType = new Map<QuestionnaireType, string>();
  measurementMapResult.map.forEach((value, key) => {
    measurementIdsByType.set(key, value.id);
  });

  return {
    data: normalizeQuestionnaireRows(((queryResult.data ?? []) as unknown) as QuestionnaireResponseRow[], measurementIdsByType),
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

  const measurementIdsByType = new Map<QuestionnaireType, string>();
  measurementMapResult.map.forEach((value, key) => {
    measurementIdsByType.set(key, value.id);
  });

  return {
    data: normalizeQuestionnaireRows(((data ?? []) as unknown) as QuestionnaireResponseRow[], measurementIdsByType),
    errorMessage: null,
  };
}

export const listQuestionnairesByPatient = getQuestionnairesByPatient;

export async function saveQuestionnaireBundle(input: QuestionnaireResponseUpsertInput[]): Promise<{ data: QuestionnaireResponseRecord[]; errorMessage: string | null }> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se pueden guardar cuestionarios.' };
  }

  const measurementMapResult = await resolveQuestionnaireMeasurementMap();
  if (measurementMapResult.errorMessage) {
    return { data: [], errorMessage: measurementMapResult.errorMessage };
  }

  const missingTypes = input
    .map((item) => item.questionnaire_type)
    .filter((type) => !measurementMapResult.map.has(type));

  if (missingTypes.length > 0) {
    return {
      data: [],
      errorMessage: `No se pudo resolver measurement_id para: ${Array.from(new Set(missingTypes)).join(', ')}.`,
    };
  }

  const payload = input.map(({ visit_id, user_id, questionnaire_type, responses }) => ({
    visit_id,
    user_id,
    measurement_id: measurementMapResult.map.get(questionnaire_type)?.id ?? '',
    responses,
  }));

  const { data, error } = await supabase
    .from('questionnaire_responses')
    .upsert(payload, { onConflict: 'visit_id,measurement_id' })
    .select(QUESTIONNAIRE_BASE_SELECT);

  if (error) {
    return { data: [], errorMessage: extractErrorMessage(error) };
  }

  const measurementIdsByType = new Map<QuestionnaireType, string>();
  measurementMapResult.map.forEach((value, key) => {
    measurementIdsByType.set(key, value.id);
  });

  return {
    data: normalizeQuestionnaireRows(((data ?? []) as unknown) as QuestionnaireResponseRow[], measurementIdsByType),
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

  const measurementIdsByType = new Map<QuestionnaireType, string>();
  measurementMapResult.map.forEach((value, key) => {
    measurementIdsByType.set(key, value.id);
  });

  return {
    data: normalizeQuestionnaireRows(((queryResult.data ?? []) as unknown) as QuestionnaireResponseRow[], measurementIdsByType),
    errorMessage: null,
  };
}
