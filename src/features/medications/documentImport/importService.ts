import { supabase } from '../../../lib/supabase';
import type { PatientMedicationDraft } from '../types';

export async function persistMedicationImport(input: {
  operationId: string;
  patientId: string;
  visitId: string;
  rows: PatientMedicationDraft[];
}): Promise<{ ids: string[]; error: string | null }> {
  if (!supabase) return { ids: [], error: 'Supabase no está configurado.' };
  // Whitelist confirmed fields; never forward fragments, names, documents, CIMA payloads or notes.
  try {
    const { data, error } = await supabase.rpc('import_visit_medication_document', {
      p_operation_id: input.operationId,
      p_patient_id: input.patientId,
      p_visit_id: input.visitId,
      p_rows: input.rows.map((row) => ({
        medication_catalog_id: row.medication_catalog_id,
        dose_text: row.dose_text,
        frequency_text: row.frequency_text,
        route_text: row.route_text,
      })),
    });
    if (error) {
      const message =
        error.code === 'PGRST202'
          ? 'Falta aplicar la migración de importación atómica en Supabase. No se usará el guardado antiguo.'
          : error.code === '23505'
            ? 'Posible duplicado: actualiza la medicación y revisa el lote.'
            : error.code === '42501'
              ? 'No tienes permiso para importar en esta visita.'
              : error.code === '22023'
                ? 'La visita o el lote no son válidos; revisa el catálogo y la visita histórica.'
                : 'No se pudo confirmar el resultado. Reintenta el mismo lote para recuperar su recibo sin duplicarlo. Comprueba el registro antes de iniciar otro lote.';
      return { ids: [], error: message };
    }
    if (!Array.isArray(data) || data.length !== input.rows.length || data.some((id) => typeof id !== 'string'))
      return { ids: [], error: 'Respuesta no confirmada. Reintenta el mismo lote para recuperar el recibo.' };
    return { ids: data, error: null };
  } catch {
    return {
      ids: [],
      error: 'Conexión interrumpida. Reintenta el mismo lote: conserva su clave para evitar duplicados.',
    };
  }
}
