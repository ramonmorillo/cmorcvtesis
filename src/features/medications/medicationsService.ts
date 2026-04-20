import { supabase } from '../../lib/supabase';
import { getVisitById } from '../../services/visitService';
import { normalizeMedicationCatalogSource } from './catalogSource';
import { mapExternalMedicationPayloadToNormalizedCandidate, upsertNormalizedMedicationFromExternal } from './normalizedCatalog';
import type { MedicationCatalogItem, MedicationEventType, PatientMedication, PatientMedicationDraft, VisitMedicationEvent } from './types';
import type { ExternalMedicationSearchItem } from './types';

type ServiceResult<T> = { data: T; errorMessage: string | null };

type SaveVisitMedicationInput = {
  visitId: string;
  patientId: string;
  rows: PatientMedicationDraft[];
};

type AddExternalMedicationToPatientInput = {
  patientId: string;
  item: ExternalMedicationSearchItem;
};

type CreateMedicationCatalogItemInput = {
  display_name: string;
  active_ingredient?: string;
  strength?: string;
  form?: string;
  route?: string;
};

type CreateMedicationCatalogItemResult = {
  item: MedicationCatalogItem | null;
  duplicate: MedicationCatalogItem | null;
};

const PATIENT_MEDICATION_SELECT =
  'id,patient_id,medication_catalog_id,dose_text,frequency_text,route_text,indication,start_date,end_date,is_active,notes,created_at,updated_at,medication_catalog:medication_catalog_id(id,source,source_code,display_name,active_ingredient,strength,form,route,atc_code,created_at,updated_at)';

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

function trimOrNull(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function medicationSnapshot(payload: {
  medication_catalog_id: string;
  dose_text: string | null;
  frequency_text: string | null;
  route_text: string | null;
  indication: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
}): Record<string, unknown> {
  return {
    medication_catalog_id: payload.medication_catalog_id,
    dose_text: payload.dose_text,
    frequency_text: payload.frequency_text,
    route_text: payload.route_text,
    indication: payload.indication,
    start_date: payload.start_date,
    end_date: payload.end_date,
    is_active: payload.is_active,
    notes: payload.notes,
  };
}


function normalizePatientMedication(record: PatientMedication & { medication_catalog?: MedicationCatalogItem | MedicationCatalogItem[] }): PatientMedication {
  const medicationCatalog = Array.isArray(record.medication_catalog) ? record.medication_catalog[0] : record.medication_catalog;
  return {
    ...record,
    medication_catalog: medicationCatalog
      ? {
          ...medicationCatalog,
          source: normalizeMedicationCatalogSource(medicationCatalog.source),
        }
      : undefined,
  };
}

function normalizeMedicationCatalogItem(record: MedicationCatalogItem): MedicationCatalogItem {
  return {
    ...record,
    source: normalizeMedicationCatalogSource(record.source),
  };
}

function mapExternalToCatalogInsert(item: ExternalMedicationSearchItem): Omit<MedicationCatalogItem, 'id' | 'created_at' | 'updated_at'> {
  return {
    source: item.source,
    source_code: item.source_code,
    display_name: item.display_name,
    active_ingredient: item.active_ingredient,
    strength: item.strength,
    form: item.form,
    route: item.route,
    atc_code: item.atc_code,
  };
}

function normalizeExternalMedicationSearchItem(payload: Record<string, unknown>): ExternalMedicationSearchItem | null {
  const externalId = typeof payload.external_id === 'string' ? payload.external_id : null;
  const displayName = typeof payload.display_name === 'string' ? payload.display_name : null;
  if (!externalId || !displayName) {
    return null;
  }

  return {
    external_id: externalId,
    source: 'external_cima',
    source_code: typeof payload.source_code === 'string' ? payload.source_code : null,
    display_name: displayName,
    active_ingredient: typeof payload.active_ingredient === 'string' ? payload.active_ingredient : null,
    strength: typeof payload.strength === 'string' ? payload.strength : null,
    form: typeof payload.form === 'string' ? payload.form : null,
    route: typeof payload.route === 'string' ? payload.route : null,
    atc_code: typeof payload.atc_code === 'string' ? payload.atc_code : null,
    authorization_status: typeof payload.authorization_status === 'string' ? payload.authorization_status : null,
    commercialized: typeof payload.commercialized === 'boolean' ? payload.commercialized : null,
    labtitular: typeof payload.labtitular === 'string' ? payload.labtitular : null,
    cima_nregistro: typeof payload.cima_nregistro === 'string' ? payload.cima_nregistro : null,
    raw_payload: payload,
  };
}

function normalizeMedicationName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeVisitMedicationEvent(
  record: VisitMedicationEvent & {
    patient_medication?: { id: string; medication_catalog?: { display_name: string } | { display_name: string }[] } | Array<{
      id: string;
      medication_catalog?: { display_name: string } | { display_name: string }[];
    }>;
  },
): VisitMedicationEvent {
  const normalizedMedication = Array.isArray(record.patient_medication) ? record.patient_medication[0] : record.patient_medication;
  const normalizedCatalog = Array.isArray(normalizedMedication?.medication_catalog)
    ? normalizedMedication.medication_catalog[0]
    : normalizedMedication?.medication_catalog;

  return {
    ...record,
    patient_medication: normalizedMedication
      ? {
          id: normalizedMedication.id,
          medication_catalog: normalizedCatalog ?? null,
        }
      : null,
  };
}

function hasMedicationChanged(previous: PatientMedication, next: ReturnType<typeof medicationSnapshot>): boolean {
  const oldSnapshot = medicationSnapshot({
    medication_catalog_id: previous.medication_catalog_id,
    dose_text: previous.dose_text,
    frequency_text: previous.frequency_text,
    route_text: previous.route_text,
    indication: previous.indication,
    start_date: previous.start_date,
    end_date: previous.end_date,
    is_active: previous.is_active,
    notes: previous.notes,
  });

  return JSON.stringify(oldSnapshot) !== JSON.stringify(next);
}

export async function searchMedicationCatalog(query: string): Promise<ServiceResult<MedicationCatalogItem[]>> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se puede consultar el catálogo.' };
  }

  let request = supabase
    .from('medication_catalog')
    .select('id,source,source_code,display_name,active_ingredient,strength,form,route,atc_code,created_at,updated_at')
    .order('display_name', { ascending: true })
    .limit(20);

  const trimmed = query.trim();
  if (trimmed.length > 0) {
    request = request.or(`display_name.ilike.%${trimmed}%,active_ingredient.ilike.%${trimmed}%`);
  }

  const { data, error } = await request;

  if (error) {
    return {
      data: [],
      errorMessage: extractErrorMessage(error, 'No fue posible buscar medicamentos en el catálogo.'),
    };
  }

  return {
    data: ((data ?? []) as MedicationCatalogItem[]).map(normalizeMedicationCatalogItem),
    errorMessage: null,
  };
}

export async function searchCimaMedications(query: string): Promise<ServiceResult<ExternalMedicationSearchItem[]>> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se puede consultar CIMA.' };
  }

  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { data: [], errorMessage: null };
  }

  const { data, error } = await supabase.functions.invoke('search-cima-medications', {
    body: { query: trimmed, limit: 20 },
  });

  if (error) {
    return {
      data: [],
      errorMessage: extractErrorMessage(error, 'No fue posible consultar medicamentos externos en CIMA.'),
    };
  }

  const rawItems = Array.isArray((data as { items?: unknown[] } | null)?.items)
    ? ((data as { items: Record<string, unknown>[] }).items ?? [])
    : [];

  return {
    data: rawItems.map(normalizeExternalMedicationSearchItem).filter((item): item is ExternalMedicationSearchItem => Boolean(item)),
    errorMessage: null,
  };
}

export async function addExternalMedicationToPatient(
  input: AddExternalMedicationToPatientInput,
): Promise<ServiceResult<PatientMedication | null>> {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado. No se puede añadir medicamento externo.' };
  }

  const candidate = mapExternalMedicationPayloadToNormalizedCandidate({
    ...input.item.raw_payload,
    source: 'cima',
    cima_name: input.item.display_name,
    cima_cn: input.item.source_code,
    cima_nregistro: input.item.cima_nregistro,
    active_ingredients: input.item.active_ingredient,
    strength: input.item.strength,
    form: input.item.form,
    route: input.item.route,
    atc_code: input.item.atc_code,
    authorization_status: input.item.authorization_status,
    commercialized: input.item.commercialized,
    labtitular: input.item.labtitular,
  });

  const upsertResult = await upsertNormalizedMedicationFromExternal(candidate);
  if (upsertResult.errorMessage || !upsertResult.data) {
    return {
      data: null,
      errorMessage: upsertResult.errorMessage ?? 'No fue posible normalizar el medicamento externo.',
    };
  }

  let catalogItemId: string | null = null;
  if (input.item.source_code) {
    const existingCatalog = await supabase
      .from('medication_catalog')
      .select('id')
      .eq('source', 'external_cima')
      .eq('source_code', input.item.source_code)
      .maybeSingle();

    if (existingCatalog.data?.id) {
      catalogItemId = existingCatalog.data.id as string;
    }
  }

  if (!catalogItemId) {
    const catalogInsert = await supabase
      .from('medication_catalog')
      .insert(mapExternalToCatalogInsert(input.item))
      .select('id')
      .maybeSingle();

    if (catalogInsert.error) {
      return {
        data: null,
        errorMessage: extractErrorMessage(catalogInsert.error, 'No fue posible almacenar el medicamento externo en catálogo.'),
      };
    }
    catalogItemId = (catalogInsert.data?.id as string | undefined) ?? null;
  }

  if (!catalogItemId) {
    return { data: null, errorMessage: 'No fue posible resolver el identificador de catálogo para el medicamento externo.' };
  }

  const patientMedicationInsert = await supabase
    .from('patient_medications')
    .insert({
      patient_id: input.patientId,
      medication_catalog_id: catalogItemId,
      catalog_concept_id: upsertResult.data.conceptId,
      catalog_product_id: upsertResult.data.productId,
      selection_source: 'external_cima',
      selected_label_snapshot: input.item.display_name,
      selected_source_payload: input.item.raw_payload,
      is_active: true,
    })
    .select(PATIENT_MEDICATION_SELECT)
    .maybeSingle();

  if (patientMedicationInsert.error) {
    return {
      data: null,
      errorMessage: extractErrorMessage(patientMedicationInsert.error, 'No fue posible añadir el medicamento externo al paciente.'),
    };
  }

  const persisted = patientMedicationInsert.data
    ? normalizePatientMedication(patientMedicationInsert.data as PatientMedication & { medication_catalog?: MedicationCatalogItem | MedicationCatalogItem[] })
    : null;

  if (!persisted) {
    return { data: null, errorMessage: 'No se recibió la medicación insertada.' };
  }

  return { data: persisted, errorMessage: null };
}

export async function createMedicationCatalogItem(
  input: CreateMedicationCatalogItemInput,
): Promise<ServiceResult<CreateMedicationCatalogItemResult>> {
  if (!supabase) {
    return {
      data: { item: null, duplicate: null },
      errorMessage: 'Supabase no está configurado. No se puede crear el medicamento en catálogo.',
    };
  }

  const displayName = input.display_name.trim();
  if (displayName.length < 2) {
    return {
      data: { item: null, duplicate: null },
      errorMessage: 'El nombre del medicamento debe tener al menos 2 caracteres.',
    };
  }

  const normalizedDisplayName = normalizeMedicationName(displayName);
  const { data: possibleDuplicates, error: duplicateError } = await supabase
    .from('medication_catalog')
    .select('id,source,source_code,display_name,active_ingredient,strength,form,route,atc_code,created_at,updated_at')
    .ilike('display_name', `%${displayName}%`)
    .limit(40);

  if (duplicateError) {
    return {
      data: { item: null, duplicate: null },
      errorMessage: extractErrorMessage(duplicateError, 'No fue posible verificar duplicados en el catálogo.'),
    };
  }

  const duplicate = ((possibleDuplicates ?? []) as MedicationCatalogItem[])
    .map(normalizeMedicationCatalogItem)
    .find((candidate) => normalizeMedicationName(candidate.display_name) === normalizedDisplayName);

  if (duplicate) {
    return { data: { item: null, duplicate }, errorMessage: null };
  }

  const { data, error } = await supabase
    .from('medication_catalog')
    .insert({
      source: 'internal',
      source_code: null,
      display_name: displayName,
      active_ingredient: trimOrNull(input.active_ingredient ?? ''),
      strength: trimOrNull(input.strength ?? ''),
      form: trimOrNull(input.form ?? ''),
      route: trimOrNull(input.route ?? ''),
    })
    .select('id,source,source_code,display_name,active_ingredient,strength,form,route,atc_code,created_at,updated_at')
    .maybeSingle();

  if (error) {
    return {
      data: { item: null, duplicate: null },
      errorMessage: extractErrorMessage(error, 'No fue posible crear el medicamento en el catálogo interno.'),
    };
  }

  return {
    data: {
      item: data ? normalizeMedicationCatalogItem(data as MedicationCatalogItem) : null,
      duplicate: null,
    },
    errorMessage: null,
  };
}

export async function listActivePatientMedications(patientId: string): Promise<ServiceResult<PatientMedication[]>> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se puede consultar medicación activa.' };
  }

  const { data, error } = await supabase
    .from('patient_medications')
    .select(PATIENT_MEDICATION_SELECT)
    .eq('patient_id', patientId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) {
    return {
      data: [],
      errorMessage: extractErrorMessage(error, 'No fue posible consultar la medicación activa del paciente.'),
    };
  }

  return {
    data: ((data ?? []) as Array<PatientMedication & { medication_catalog?: MedicationCatalogItem | MedicationCatalogItem[] }>).map(
      normalizePatientMedication,
    ),
    errorMessage: null,
  };
}

export async function listVisitMedicationSnapshot(visitId: string): Promise<ServiceResult<PatientMedication[]>> {
  const visitResponse = await getVisitById(visitId);
  if (visitResponse.errorMessage || !visitResponse.data?.patient_id) {
    return {
      data: [],
      errorMessage: visitResponse.errorMessage ?? 'No se pudo resolver el paciente de la visita.',
    };
  }

  return listActivePatientMedications(visitResponse.data.patient_id);
}

export async function getLatestMedicationReviewDate(patientId: string): Promise<ServiceResult<string | null>> {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado. No se puede consultar la última revisión.' };
  }

  const { data, error } = await supabase
    .from('patient_medications')
    .select('updated_at')
    .eq('patient_id', patientId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      data: null,
      errorMessage: extractErrorMessage(error, 'No fue posible consultar la fecha de última revisión de medicación.'),
    };
  }

  return { data: data?.updated_at ?? null, errorMessage: null };
}

export async function saveVisitMedicationChanges(input: SaveVisitMedicationInput): Promise<ServiceResult<PatientMedication[]>> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se puede guardar la medicación.' };
  }

  const upserted: PatientMedication[] = [];

  for (const row of input.rows) {
    const payload = {
      patient_id: input.patientId,
      medication_catalog_id: row.medication_catalog_id,
      dose_text: trimOrNull(row.dose_text),
      frequency_text: trimOrNull(row.frequency_text),
      route_text: trimOrNull(row.route_text),
      indication: trimOrNull(row.indication),
      start_date: row.start_date || null,
      end_date: row.is_active ? null : new Date().toISOString().slice(0, 10),
      is_active: row.is_active,
      notes: trimOrNull(row.notes),
    };

    let persisted: PatientMedication | null = null;

    if (row.id) {
      const { data, error } = await supabase
        .from('patient_medications')
        .update(payload)
        .eq('id', row.id)
        .select(PATIENT_MEDICATION_SELECT)
        .maybeSingle();

      if (error) {
        return { data: [], errorMessage: extractErrorMessage(error, 'No fue posible actualizar una medicación del paciente.') };
      }
      persisted = data
        ? normalizePatientMedication(data as PatientMedication & { medication_catalog?: MedicationCatalogItem | MedicationCatalogItem[] })
        : null;
    } else {
      const { data, error } = await supabase
        .from('patient_medications')
        .insert(payload)
        .select(PATIENT_MEDICATION_SELECT)
        .maybeSingle();

      if (error) {
        return { data: [], errorMessage: extractErrorMessage(error, 'No fue posible añadir una nueva medicación.') };
      }
      persisted = data
        ? normalizePatientMedication(data as PatientMedication & { medication_catalog?: MedicationCatalogItem | MedicationCatalogItem[] })
        : null;
    }

    if (!persisted) {
      continue;
    }

    upserted.push(persisted);

    let eventType: MedicationEventType = 'confirmed_no_change';
    let oldValue: Record<string, unknown> | null = null;
    let newValue: Record<string, unknown> | null = null;

    const nextSnapshot = medicationSnapshot(payload);

    if (!row.previous) {
      eventType = 'added';
      newValue = nextSnapshot;
    } else if (row.previous.is_active && !row.is_active) {
      eventType = 'stopped';
      oldValue = medicationSnapshot({
        medication_catalog_id: row.previous.medication_catalog_id,
        dose_text: row.previous.dose_text,
        frequency_text: row.previous.frequency_text,
        route_text: row.previous.route_text,
        indication: row.previous.indication,
        start_date: row.previous.start_date,
        end_date: row.previous.end_date,
        is_active: row.previous.is_active,
        notes: row.previous.notes,
      });
      newValue = nextSnapshot;
    } else if (hasMedicationChanged(row.previous, nextSnapshot)) {
      eventType = 'modified';
      oldValue = medicationSnapshot({
        medication_catalog_id: row.previous.medication_catalog_id,
        dose_text: row.previous.dose_text,
        frequency_text: row.previous.frequency_text,
        route_text: row.previous.route_text,
        indication: row.previous.indication,
        start_date: row.previous.start_date,
        end_date: row.previous.end_date,
        is_active: row.previous.is_active,
        notes: row.previous.notes,
      });
      newValue = nextSnapshot;
    }

    const { error: eventError } = await supabase.from('visit_medication_events').insert({
      visit_id: input.visitId,
      patient_medication_id: persisted.id,
      event_type: eventType,
      old_value: oldValue,
      new_value: newValue,
    });

    if (eventError) {
      return { data: [], errorMessage: extractErrorMessage(eventError, 'No fue posible registrar el evento de medicación.') };
    }
  }

  const refreshed = await listActivePatientMedications(input.patientId);
  if (refreshed.errorMessage) {
    return { data: upserted, errorMessage: refreshed.errorMessage };
  }

  return { data: refreshed.data, errorMessage: null };
}

export async function listVisitMedicationEvents(visitId: string): Promise<ServiceResult<VisitMedicationEvent[]>> {
  if (!supabase) {
    return { data: [], errorMessage: 'Supabase no está configurado. No se puede consultar la trazabilidad de medicación.' };
  }

  const { data, error } = await supabase
    .from('visit_medication_events')
    .select(
      'id,visit_id,patient_medication_id,event_type,old_value,new_value,created_at,patient_medication:patient_medication_id(id,medication_catalog:medication_catalog_id(display_name))',
    )
    .eq('visit_id', visitId)
    .order('created_at', { ascending: false });

  if (error) {
    return {
      data: [],
      errorMessage: extractErrorMessage(error, 'No fue posible consultar los cambios de medicación de la visita.'),
    };
  }

  return {
    data: ((data ?? []) as Array<
      VisitMedicationEvent & {
        patient_medication?:
          | { id: string; medication_catalog?: { display_name: string } | { display_name: string }[] }
          | Array<{ id: string; medication_catalog?: { display_name: string } | { display_name: string }[] }>;
      }
    >).map(normalizeVisitMedicationEvent),
    errorMessage: null,
  };
}
