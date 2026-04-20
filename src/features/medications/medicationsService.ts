import { supabase } from '../../lib/supabase';
import { getVisitById } from '../../services/visitService';
import type { MedicationCatalogItem, MedicationEventType, PatientMedication, PatientMedicationDraft } from './types';

type ServiceResult<T> = { data: T; errorMessage: string | null };

type SaveVisitMedicationInput = {
  visitId: string;
  patientId: string;
  rows: PatientMedicationDraft[];
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
    medication_catalog: medicationCatalog,
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

  return { data: (data ?? []) as MedicationCatalogItem[], errorMessage: null };
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
