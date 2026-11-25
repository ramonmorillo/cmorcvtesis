import { supabase } from '../../lib/supabase';
import { listPatients } from '../../services/patientService';
import type { BoardPatient, BoardVisit, DerivedPending } from './followupBoard';
import { validateNewPlanItem, type PlanItem, type PlanItemKind } from './planModel';

type Result<T> = { data: T; errorMessage: string | null; unavailable?: boolean };

const ITEM_SELECT =
  'id,patient_id,origin_visit_id,kind,label,catalog_code,status,completed_visit_id,completed_at,outcome_note,dropped_reason,created_at';

export const PLAN_MODULE_UNAVAILABLE_MESSAGE =
  'El plan de visita aún no está disponible en la base de datos (migración pendiente de aplicar). El resto de IRIS sigue funcionando con normalidad.';

function errorText(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return fallback;
}

/** Tabla inexistente (migración no aplicada): PostgREST PGRST205 / Postgres 42P01. */
function isMissingTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String(error.code) : '';
  const message = 'message' in error ? String(error.message) : '';
  return code === 'PGRST205' || code === '42P01' || /could not find the table|does not exist/i.test(message);
}

const NOT_CONFIGURED = 'Supabase no está configurado.';

export async function listPlanItemsByPatient(patientId: string): Promise<Result<PlanItem[]>> {
  if (!supabase) return { data: [], errorMessage: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from('visit_plan_items')
    .select(ITEM_SELECT)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: true });
  if (error) {
    return isMissingTable(error)
      ? { data: [], errorMessage: null, unavailable: true }
      : { data: [], errorMessage: errorText(error, 'No fue posible cargar el plan de visita.') };
  }
  return { data: (data ?? []) as PlanItem[], errorMessage: null };
}

export type AddPlanItemInput = {
  patientId: string;
  originVisitId: string | null;
  label: string;
  kind: PlanItemKind;
  catalogCode?: string | null;
};

export async function addPlanItem(input: AddPlanItemInput): Promise<Result<PlanItem | null>> {
  if (!supabase) return { data: null, errorMessage: NOT_CONFIGURED };
  const validated = validateNewPlanItem({ label: input.label, kind: input.kind, catalog_code: input.catalogCode });
  if (!validated.ok) return { data: null, errorMessage: validated.message };
  const { data, error } = await supabase
    .from('visit_plan_items')
    .insert({ patient_id: input.patientId, origin_visit_id: input.originVisitId, ...validated.value })
    .select(ITEM_SELECT)
    .maybeSingle();
  if (error) return { data: null, errorMessage: errorText(error, 'No fue posible guardar el objetivo.') };
  return { data: (data as PlanItem | null) ?? null, errorMessage: null };
}

export async function completePlanItem(itemId: string, visitId: string, outcomeNote: string): Promise<Result<PlanItem | null>> {
  if (!supabase) return { data: null, errorMessage: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from('visit_plan_items')
    .update({
      status: 'done',
      completed_visit_id: visitId,
      completed_at: new Date().toISOString(),
      outcome_note: outcomeNote.trim() || null,
      dropped_reason: null,
    })
    .eq('id', itemId)
    .select(ITEM_SELECT)
    .maybeSingle();
  if (error) return { data: null, errorMessage: errorText(error, 'No fue posible marcar el objetivo como hecho.') };
  return { data: (data as PlanItem | null) ?? null, errorMessage: null };
}

export async function dropPlanItem(itemId: string, reason: string): Promise<Result<PlanItem | null>> {
  if (!supabase) return { data: null, errorMessage: NOT_CONFIGURED };
  if (!reason.trim()) return { data: null, errorMessage: 'Indica el motivo para descartar el objetivo.' };
  const { data, error } = await supabase
    .from('visit_plan_items')
    .update({ status: 'dropped', dropped_reason: reason.trim(), completed_at: null, completed_visit_id: null })
    .eq('id', itemId)
    .select(ITEM_SELECT)
    .maybeSingle();
  if (error) return { data: null, errorMessage: errorText(error, 'No fue posible descartar el objetivo.') };
  return { data: (data as PlanItem | null) ?? null, errorMessage: null };
}

export async function reopenPlanItem(itemId: string): Promise<Result<PlanItem | null>> {
  if (!supabase) return { data: null, errorMessage: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from('visit_plan_items')
    .update({ status: 'pending', completed_at: null, completed_visit_id: null, dropped_reason: null })
    .eq('id', itemId)
    .select(ITEM_SELECT)
    .maybeSingle();
  if (error) return { data: null, errorMessage: errorText(error, 'No fue posible reabrir el objetivo.') };
  return { data: (data as PlanItem | null) ?? null, errorMessage: null };
}

export type BoardData = {
  patients: BoardPatient[];
  visits: BoardVisit[];
  planItems: PlanItem[];
  derivedPending: DerivedPending[];
  latestCmo: Map<string, { priority: number | null; score: number | null }>;
  /** Avisos no bloqueantes: partes opcionales que no se pudieron cargar. */
  warnings: string[];
  planUnavailable: boolean;
};

type EmbeddedPatient = { patient_id: string } | Array<{ patient_id: string }> | null;
const embeddedPatientId = (visits: EmbeddedPatient): string | null => (Array.isArray(visits) ? visits[0]?.patient_id : visits?.patient_id) ?? null;

/** Carga en paralelo todo lo que necesita el panel. Lo imprescindible falla con error; lo opcional degrada a aviso. */
export async function loadBoardData(): Promise<{ data: BoardData | null; errorMessage: string | null }> {
  if (!supabase) return { data: null, errorMessage: NOT_CONFIGURED };
  const client = supabase;

  const [patientsRes, visitsRes, itemsRes, scoresRes, recommendationsRes, interventionsRes] = await Promise.all([
    listPatients(),
    client.from('visits').select('id,patient_id,visit_type,visit_date,scheduled_date,visit_status'),
    client.from('visit_plan_items').select(ITEM_SELECT).eq('status', 'pending'),
    client.from('cmo_scores').select('score,priority,created_at,visits!inner(patient_id)').order('created_at', { ascending: false }),
    client.from('visit_process_records').select('patient_id').eq('recommendation_status', 'pending'),
    client.from('interventions').select('id,intervention_type,visits!inner(patient_id)').eq('delivered', false),
  ]);

  if (patientsRes.errorMessage) return { data: null, errorMessage: patientsRes.errorMessage };
  if (visitsRes.error) return { data: null, errorMessage: errorText(visitsRes.error, 'No fue posible cargar las visitas.') };

  const warnings: string[] = [];
  const planUnavailable = Boolean(itemsRes.error && isMissingTable(itemsRes.error));
  if (itemsRes.error && !planUnavailable) warnings.push('No se pudieron cargar los objetivos del plan de visita.');

  const latestCmo = new Map<string, { priority: number | null; score: number | null }>();
  if (scoresRes.error) {
    warnings.push('No se pudo cargar el nivel CMO.');
  } else {
    // Ordenado por creación descendente: el primer score visto de cada paciente es el más reciente.
    for (const row of (scoresRes.data ?? []) as Array<{ score: number | null; priority: number | null; visits: EmbeddedPatient }>) {
      const patientId = embeddedPatientId(row.visits);
      if (patientId && !latestCmo.has(patientId)) latestCmo.set(patientId, { priority: row.priority, score: row.score });
    }
  }

  const derivedPending: DerivedPending[] = [];
  if (recommendationsRes.error) {
    warnings.push('No se pudieron cargar las recomendaciones pendientes.');
  } else {
    for (const row of (recommendationsRes.data ?? []) as Array<{ patient_id: string }>) {
      derivedPending.push({ patient_id: row.patient_id, source: 'recommendation', label: 'Recomendación a otro profesional pendiente de respuesta' });
    }
  }
  if (interventionsRes.error) {
    warnings.push('No se pudieron cargar las intervenciones sin entregar.');
  } else {
    for (const row of (interventionsRes.data ?? []) as Array<{ intervention_type: string; visits: EmbeddedPatient }>) {
      const patientId = embeddedPatientId(row.visits);
      if (patientId) derivedPending.push({ patient_id: patientId, source: 'intervention', label: `Intervención sin entregar: ${row.intervention_type}` });
    }
  }

  return {
    data: {
      patients: patientsRes.data.map((p) => ({ id: p.id, study_code: p.study_code })),
      visits: (visitsRes.data ?? []) as BoardVisit[],
      planItems: planUnavailable || itemsRes.error ? [] : ((itemsRes.data ?? []) as PlanItem[]),
      derivedPending,
      latestCmo,
      warnings,
      planUnavailable,
    },
    errorMessage: null,
  };
}
