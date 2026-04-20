import { supabase } from '../../lib/supabase';

export type CimaMedicationSearchDto = {
  id: string;
  source: 'external_cima_remote';
  source_label: string;
  cima_cn: string | null;
  cima_nregistro: string | null;
  cima_name: string;
  labtitular: string | null;
  pharmaceutical_form: string | null;
  pharmaceutical_form_simplified: string | null;
  routes: string[];
  atc_codes: string[];
  authorization_status: string | null;
  commercialized: boolean | null;
  vmpp: string | null;
  vmp: string | null;
  dose: string | null;
  raw_payload: Record<string, unknown>;
  fetched_at: string;
};

type SearchResult<T> = {
  data: T;
  errorMessage: string | null;
};

function asErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

export async function searchRemoteCimaMedications(query: string): Promise<SearchResult<CimaMedicationSearchDto[]>> {
  if (!supabase) {
    return {
      data: [],
      errorMessage: 'Supabase no está configurado. No se puede consultar CIMA en remoto.',
    };
  }

  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { data: [], errorMessage: null };
  }

  const { data, error } = await supabase.functions.invoke('search-cima-medications', {
    body: {
      query: trimmed,
      limit: 20,
    },
  });

  if (error) {
    return {
      data: [],
      errorMessage: asErrorMessage(error, 'No fue posible consultar CIMA en remoto.'),
    };
  }

  if (!data || typeof data !== 'object' || !Array.isArray((data as { items?: unknown[] }).items)) {
    return {
      data: [],
      errorMessage: 'Respuesta inválida al consultar CIMA.',
    };
  }

  return {
    data: ((data as { items: unknown[] }).items ?? []) as CimaMedicationSearchDto[],
    errorMessage: null,
  };
}
