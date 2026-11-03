// Reconstrucción del estado farmacoterapéutico histórico de una visita.
//
// `patient_medications` guarda el estado VIGENTE (a nivel de paciente) y se
// actualiza en sitio. La historia por visita está en `visit_medication_events`,
// donde cada cambio registra `old_value` (estado previo completo de la fila).
// El estado al cierre de la visita V se obtiene, sin cambios de esquema,
// deshaciendo sobre el estado vigente los eventos de las visitas POSTERIORES a V:
//   - primer evento posterior 'added'            -> el tratamiento no existía en V.
//   - primer evento posterior 'modified'/'stopped' -> en V valía su old_value.
//   - solo 'confirmed_no_change' (o ninguno)     -> en V valía lo mismo que ahora.
// Función pura (sin Supabase) para poder probarla de forma aislada.

export type MedicationHistoryEvent = {
  visit_id: string;
  patient_medication_id: string;
  event_type: 'added' | 'modified' | 'stopped' | 'confirmed_no_change';
  old_value: Record<string, unknown> | null;
  created_at: string;
};

type MedicationStateRow = {
  id: string;
  is_active: boolean;
  created_at?: string;
};

const SNAPSHOT_KEYS = [
  'medication_catalog_id',
  'dose_text',
  'frequency_text',
  'route_text',
  'indication',
  'start_date',
  'end_date',
  'is_active',
  'notes',
] as const;

/**
 * Devuelve los tratamientos ACTIVOS al cierre de la visita, a partir de TODAS las
 * filas del paciente (activas e inactivas) y de los eventos registrados en las
 * visitas cronológicamente posteriores a ella. No muta las entradas.
 */
export function reconstructMedicationStateAtVisit<T extends MedicationStateRow>(
  allPatientRows: T[],
  laterVisitEvents: MedicationHistoryEvent[],
): T[] {
  const eventsByMedication = new Map<string, MedicationHistoryEvent[]>();
  for (const event of laterVisitEvents) {
    const list = eventsByMedication.get(event.patient_medication_id) ?? [];
    list.push(event);
    eventsByMedication.set(event.patient_medication_id, list);
  }

  const result: T[] = [];
  for (const row of allPatientRows) {
    const events = [...(eventsByMedication.get(row.id) ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const firstInformative = events.find(
      (event) => event.event_type === 'added' || ((event.event_type === 'modified' || event.event_type === 'stopped') && event.old_value),
    );

    let stateAtVisit: T = { ...row };
    if (firstInformative?.event_type === 'added') {
      continue;
    }
    if (firstInformative?.old_value) {
      const restored: Record<string, unknown> = {};
      for (const key of SNAPSHOT_KEYS) {
        if (key in firstInformative.old_value) {
          restored[key] = firstInformative.old_value[key];
        }
      }
      stateAtVisit = { ...row, ...restored } as T;
    }

    if (stateAtVisit.is_active) {
      result.push(stateAtVisit);
    }
  }

  return result;
}
