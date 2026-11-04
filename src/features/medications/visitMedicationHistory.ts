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
 * Estado de TODAS las filas que existían al cierre de la visita (activas e inactivas),
 * a partir de todas las filas del paciente y de los eventos de visitas posteriores.
 * No muta las entradas.
 */
export function reconstructAllMedicationRowsAtVisit<T extends MedicationStateRow>(
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
      result.push({ ...row, ...restored } as T);
      continue;
    }
    result.push({ ...row });
  }

  return result;
}

/**
 * Devuelve los tratamientos ACTIVOS al cierre de la visita, a partir de TODAS las
 * filas del paciente (activas e inactivas) y de los eventos registrados en las
 * visitas cronológicamente posteriores a ella. No muta las entradas.
 */
export function reconstructMedicationStateAtVisit<T extends MedicationStateRow>(
  allPatientRows: T[],
  laterVisitEvents: MedicationHistoryEvent[],
): T[] {
  return reconstructAllMedicationRowsAtVisit(allPatientRows, laterVisitEvents).filter((row) => row.is_active);
}

// ---------------------------------------------------------------------------
// Tratamientos suspendidos / históricos al cierre de una visita.
//
// Unidad de conteo: EPISODIO TERAPÉUTICO = una fila de patient_medications
// (desde su alta hasta su suspensión). Una reintroducción crea una fila nueva,
// es decir, un episodio nuevo. El contador "medicamentos suspendidos" cuenta
// medicamentos distintos (medication_catalog_id) con algún episodio suspendido
// y SIN episodio activo en esa visita, para no contar dos veces el mismo
// medicamento ni contar como suspendido uno reintroducido.
// ---------------------------------------------------------------------------

type HistoryRow = MedicationStateRow & {
  medication_catalog_id: string;
  dose_text?: string | null;
  frequency_text?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  notes?: string | null;
};

export type HistoryEventWithValues = MedicationHistoryEvent & { new_value?: Record<string, unknown> | null };

export type SuspendedMedicationEpisode<T extends HistoryRow> = {
  row: T;
  /** Última dosis/posología registrada mientras estuvo activo (old_value del evento de suspensión), si consta. */
  lastDoseText: string | null;
  lastFrequencyText: string | null;
  startDate: string | null;
  /** Fecha de fin registrada (end_date); null si no consta. */
  suspensionDate: string | null;
  /** Visita en la que se documentó la suspensión; null si no consta un evento 'stopped'. */
  documentedInVisitId: string | null;
  /** Hay otro episodio activo del mismo medicamento en esta visita. */
  reintroduced: boolean;
};

export type MedicationHistoryAtVisit<T extends HistoryRow> = {
  active: T[];
  suspended: SuspendedMedicationEpisode<T>[];
  /** Medicamentos distintos suspendidos y no reintroducidos al cierre de la visita. */
  suspendedMedicationCount: number;
};

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * @param chronologicalVisitIds visitas del paciente en orden cronológico.
 * @param allPatientEvents eventos de medicación de TODAS las visitas del paciente.
 */
export function buildMedicationHistoryAtVisit<T extends HistoryRow>(
  allPatientRows: T[],
  allPatientEvents: HistoryEventWithValues[],
  chronologicalVisitIds: string[],
  visitId: string,
): MedicationHistoryAtVisit<T> {
  const visitIndex = chronologicalVisitIds.indexOf(visitId);
  const laterIds = new Set(visitIndex >= 0 ? chronologicalVisitIds.slice(visitIndex + 1) : []);
  const upToIds = new Set(visitIndex >= 0 ? chronologicalVisitIds.slice(0, visitIndex + 1) : chronologicalVisitIds);

  const rowsAtVisit = reconstructAllMedicationRowsAtVisit(
    allPatientRows,
    allPatientEvents.filter((event) => laterIds.has(event.visit_id)),
  );
  const active = rowsAtVisit.filter((row) => row.is_active);
  const activeCatalogIds = new Set(active.map((row) => row.medication_catalog_id));

  const suspended = rowsAtVisit
    .filter((row) => !row.is_active)
    .map((row) => {
      const stoppedEvent = allPatientEvents
        .filter((event) => event.patient_medication_id === row.id && event.event_type === 'stopped' && upToIds.has(event.visit_id))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      const lastActive = stoppedEvent?.old_value ?? null;
      return {
        row,
        lastDoseText: textOrNull(lastActive?.dose_text) ?? textOrNull(row.dose_text),
        lastFrequencyText: textOrNull(lastActive?.frequency_text) ?? textOrNull(row.frequency_text),
        startDate: textOrNull(row.start_date) ?? textOrNull(lastActive?.start_date),
        suspensionDate: textOrNull(row.end_date) ?? textOrNull(stoppedEvent?.new_value?.end_date),
        documentedInVisitId: stoppedEvent?.visit_id ?? null,
        reintroduced: activeCatalogIds.has(row.medication_catalog_id),
      };
    })
    .sort((a, b) => (b.suspensionDate ?? '').localeCompare(a.suspensionDate ?? ''));

  const suspendedMedicationCount = new Set(
    suspended.filter((episode) => !episode.reintroduced).map((episode) => episode.row.medication_catalog_id),
  ).size;

  return { active, suspended, suspendedMedicationCount };
}
