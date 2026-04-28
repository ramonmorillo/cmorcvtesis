import { supabase } from '../lib/supabase';

export type RecommendationStatus = 'accepted' | 'not_accepted' | 'pending' | 'not_applicable';

export type VisitProcessRecord = {
  id: string;
  patient_id: string;
  visit_id: string;
  session_total_minutes: number | null;
  stratification_performed: boolean | null;
  stratification_level: string | null;
  stratification_completed_correctly: boolean | null;
  pharmacist_intervention_recorded: boolean | null;
  interventions_count: number | null;
  recommendation_to_other_professional: boolean | null;
  recommendation_status: RecommendationStatus | null;
  continues_in_program: boolean | null;
  dropout_reason: string | null;
  operational_incidents: string | null;
  administrative_time_minutes: number | null;
  professional_user_id: string | null;
  created_at?: string;
  updated_at?: string;
};

export type UpsertVisitProcessInput = Omit<VisitProcessRecord, 'id' | 'created_at' | 'updated_at'>;

const VISIT_PROCESS_SELECT =
  'id,patient_id,visit_id,session_total_minutes,stratification_performed,stratification_level,stratification_completed_correctly,pharmacist_intervention_recorded,interventions_count,recommendation_to_other_professional,recommendation_status,continues_in_program,dropout_reason,operational_incidents,administrative_time_minutes,professional_user_id,created_at,updated_at';

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Error desconocido al procesar datos de proceso.';
}

export async function getVisitProcessByVisit(visitId: string): Promise<{ data: VisitProcessRecord | null; errorMessage: string | null }> {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado. No se puede cargar el proceso de la visita.' };
  }

  const { data, error } = await supabase
    .from('visit_process_records')
    .select(VISIT_PROCESS_SELECT)
    .eq('visit_id', visitId)
    .maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error) };
  }

  return { data: (data as VisitProcessRecord | null) ?? null, errorMessage: null };
}

export async function upsertVisitProcess(input: UpsertVisitProcessInput): Promise<{ data: VisitProcessRecord | null; errorMessage: string | null }> {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado. No se puede guardar el proceso de la visita.' };
  }

  const { data, error } = await supabase
    .from('visit_process_records')
    .upsert(input, { onConflict: 'visit_id' })
    .select(VISIT_PROCESS_SELECT)
    .maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error) };
  }

  return { data: (data as VisitProcessRecord | null) ?? null, errorMessage: null };
}
