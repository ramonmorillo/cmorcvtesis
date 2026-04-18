import { supabase } from '../lib/supabase';
import type { VisitStatus, VisitType } from '../constants/enums';
import { getVisitNumberByType } from '../constants/enums';

export type Visit = {
  id: string;
  patient_id: string;
  visit_type: VisitType;
  visit_number: number | null;
  scheduled_date: string | null;
  visit_date: string | null;
  visit_status: VisitStatus | null;
  extraordinary_reason: string | null;
  notes: string | null;
  created_by: string | null;
  created_at?: string;
  updated_at?: string;
};

export type NewVisitInput = Omit<Visit, 'id' | 'created_at' | 'updated_at' | 'created_by'>;

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Error desconocido al procesar visitas.';
}

const VISIT_SELECT =
  'id,patient_id,visit_type,visit_number,scheduled_date,visit_date,visit_status,extraordinary_reason,notes,created_by,created_at,updated_at';

export async function listVisitsByPatient(patientId: string): Promise<{ data: Visit[]; errorMessage: string | null }> {
  if (!supabase) {
    return {
      data: [],
      errorMessage: 'Supabase no está configurado. No se pueden cargar visitas.',
    };
  }

  const { data, error } = await supabase
    .from('visits')
    .select(VISIT_SELECT)
    .eq('patient_id', patientId)
    .order('visit_date', { ascending: false, nullsFirst: true })
    .order('scheduled_date', { ascending: false, nullsFirst: false });

  if (error) {
    return { data: [], errorMessage: extractErrorMessage(error) };
  }

  return { data: (data ?? []) as Visit[], errorMessage: null };
}


export async function getVisitById(visitId: string): Promise<{ data: Visit | null; errorMessage: string | null }> {
  if (!supabase) {
    return {
      data: null,
      errorMessage: 'Supabase no está configurado. No se puede cargar la visita.',
    };
  }

  const { data, error } = await supabase.from('visits').select(VISIT_SELECT).eq('id', visitId).maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error) };
  }

  return { data: (data as Visit | null) ?? null, errorMessage: null };
}

export async function createVisit(input: NewVisitInput): Promise<{ data: Visit | null; errorMessage: string | null }> {
  if (!supabase) {
    return {
      data: null,
      errorMessage: 'Supabase no está configurado. No se puede guardar la visita.',
    };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { data: null, errorMessage: 'Usuario no autenticado. Inicia sesión e inténtalo de nuevo.' };
  }

  const { data, error } = await supabase
    .from('visits')
    .insert({
      ...input,
      visit_number: getVisitNumberByType(input.visit_type),
      created_by: user.id,
    })
    .select(VISIT_SELECT)
    .maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error) };
  }

  return { data: (data as Visit | null) ?? null, errorMessage: null };
}

export type VisitUpdateInput = Partial<Pick<Visit, 'visit_date' | 'visit_status' | 'notes' | 'scheduled_date' | 'extraordinary_reason'>>;

export async function updateVisit(visitId: string, updates: VisitUpdateInput): Promise<{ data: Visit | null; errorMessage: string | null }> {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado. No se puede actualizar la visita.' };
  }

  const { data, error } = await supabase
    .from('visits')
    .update(updates)
    .eq('id', visitId)
    .select(VISIT_SELECT)
    .maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error) };
  }

  return { data: (data as Visit | null) ?? null, errorMessage: null };
}
