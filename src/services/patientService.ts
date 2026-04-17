import { supabase } from '../lib/supabase';

export type Patient = {
  id: string;
  patient_code: string;
  sex: string | null;
  birth_year: number | null;
  inclusion_date: string | null;
  notes: string | null;
  created_at?: string;
};

export type NewPatientInput = Omit<Patient, 'id' | 'created_at'>;

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Error desconocido al procesar pacientes.';
}

export async function listPatients(): Promise<{ data: Patient[]; errorMessage: string | null }> {
  if (!supabase) {
    return {
      data: [],
      errorMessage: 'Supabase no está configurado. No se pueden cargar pacientes.',
    };
  }

  // Ajustar nombres de columnas aquí si el esquema real usa otros campos.
  const { data, error } = await supabase
    .from('patients')
    .select('id,patient_code,sex,birth_year,inclusion_date,notes,created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return { data: [], errorMessage: extractErrorMessage(error) };
  }

  return { data: (data ?? []) as Patient[], errorMessage: null };
}

export async function getPatientById(id: string): Promise<{ data: Patient | null; errorMessage: string | null }> {
  if (!supabase) {
    return {
      data: null,
      errorMessage: 'Supabase no está configurado. No se puede cargar la ficha del paciente.',
    };
  }

  const { data, error } = await supabase
    .from('patients')
    .select('id,patient_code,sex,birth_year,inclusion_date,notes,created_at')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error) };
  }

  return { data: (data as Patient | null) ?? null, errorMessage: null };
}

export async function createPatient(input: NewPatientInput): Promise<{ data: Patient | null; errorMessage: string | null }> {
  if (!supabase) {
    return {
      data: null,
      errorMessage: 'Supabase no está configurado. No se puede guardar el paciente.',
    };
  }

  // Ajustar payload aquí si el esquema real requiere más columnas obligatorias.
  const { data, error } = await supabase.from('patients').insert(input).select().maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error) };
  }

  return { data: (data as Patient | null) ?? null, errorMessage: null };
}
