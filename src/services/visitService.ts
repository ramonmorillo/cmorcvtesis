import { supabase } from '../lib/supabase';

export type Visit = {
  id: string;
  patient_id: string;
  visit_date: string;
  visit_type: string | null;
  notes: string | null;
  created_at?: string;
};

export type NewVisitInput = Omit<Visit, 'id' | 'created_at'>;

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Error desconocido al procesar visitas.';
}

export async function listVisitsByPatient(patientId: string): Promise<{ data: Visit[]; errorMessage: string | null }> {
  if (!supabase) {
    return {
      data: [],
      errorMessage: 'Supabase no está configurado. No se pueden cargar visitas.',
    };
  }

  // Ajustar columnas aquí si la tabla real de visitas difiere.
  const { data, error } = await supabase
    .from('visits')
    .select('id,patient_id,visit_date,visit_type,notes,created_at')
    .eq('patient_id', patientId)
    .order('visit_date', { ascending: false });

  if (error) {
    return { data: [], errorMessage: extractErrorMessage(error) };
  }

  return { data: (data ?? []) as Visit[], errorMessage: null };
}

export async function createVisit(input: NewVisitInput): Promise<{ data: Visit | null; errorMessage: string | null }> {
  if (!supabase) {
    return {
      data: null,
      errorMessage: 'Supabase no está configurado. No se puede guardar la visita.',
    };
  }

  // Ajustar payload aquí si el esquema de visitas tiene restricciones adicionales.
  const { data, error } = await supabase.from('visits').insert(input).select().maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error) };
  }

  return { data: (data as Visit | null) ?? null, errorMessage: null };
}
