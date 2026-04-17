export const SEX_TYPE_OPTIONS = [
  { value: 'male', label: 'Varón' },
  { value: 'female', label: 'Mujer' },
  { value: 'other', label: 'Otro' },
  { value: 'unknown', label: 'Desconocido' },
] as const;

export type SexType = (typeof SEX_TYPE_OPTIONS)[number]['value'];

export const VISIT_TYPE_OPTIONS = [
  { value: 'basal', label: 'Basal' },
  { value: 'seguimiento', label: 'Seguimiento' },
  { value: 'extraordinaria', label: 'Extraordinaria' },
] as const;

export type VisitType = (typeof VISIT_TYPE_OPTIONS)[number]['value'];

// Valores del enum de BD (en inglés) con etiquetas de UI en español.
export const VISIT_STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Programada' },
  { value: 'completed', label: 'Completada' },
  { value: 'cancelled', label: 'Cancelada' },
] as const;

export type VisitStatus = (typeof VISIT_STATUS_OPTIONS)[number]['value'];

export function getVisitStatusLabel(status: VisitStatus | null): string {
  if (!status) {
    return '-';
  }

  return VISIT_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export const SMOKER_STATUS_OPTIONS = [
  { value: 'si', label: 'Sí' },
  { value: 'no', label: 'No' },
] as const;

export type SmokerStatus = (typeof SMOKER_STATUS_OPTIONS)[number]['value'];
