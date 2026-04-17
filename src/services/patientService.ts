import { supabase } from '../lib/supabase';
import type { SexType } from '../constants/enums';

export type Patient = {
  id: string;
  study_code: string;
  pharmacy_site: string | null;
  investigator_name: string | null;
  inclusion_date: string | null;
  screening_date: string | null;
  birth_date: string | null;
  age_at_inclusion: number | null;
  sex: SexType | null;
  consent_signed: boolean | null;
  created_at?: string;
};

export type NewPatientInput = Omit<Patient, 'id' | 'created_at'>;

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Error desconocido al procesar pacientes.';
}

const PATIENT_SELECT =
  'id,study_code,pharmacy_site,investigator_name,inclusion_date,screening_date,birth_date,age_at_inclusion,sex,consent_signed,created_at';

export async function listPatients(searchStudyCode?: string): Promise<{ data: Patient[]; errorMessage: string | null }> {
  if (!supabase) {
    return {
      data: [],
      errorMessage: 'Supabase no está configurado. No se pueden cargar pacientes.',
    };
  }

  let query = supabase.from('patients').select(PATIENT_SELECT).order('created_at', { ascending: false });

  if (searchStudyCode?.trim()) {
    query = query.ilike('study_code', `%${searchStudyCode.trim()}%`);
  }

  const { data, error } = await query;

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

  const { data, error } = await supabase.from('patients').select(PATIENT_SELECT).eq('id', id).maybeSingle();

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

  const { data, error } = await supabase.from('patients').insert(input).select(PATIENT_SELECT).maybeSingle();

  if (error) {
    return { data: null, errorMessage: extractErrorMessage(error) };
  }

  return { data: (data as Patient | null) ?? null, errorMessage: null };
}
