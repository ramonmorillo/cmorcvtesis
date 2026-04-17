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

// Valores internos normalizados para visit_status_enum según el código existente en el proyecto.
export const VISIT_STATUS_OPTIONS = [
  { value: 'programada',    label: 'Programada' },
  { value: 'realizada',     label: 'Realizada' },
  { value: 'cancelada',     label: 'Cancelada' },
  { value: 'no_presentada', label: 'No presentada' },
] as const;

export type VisitStatus = (typeof VISIT_STATUS_OPTIONS)[number]['value'];

export const SMOKER_STATUS_OPTIONS = [
  { value: 'si', label: 'Sí' },
  { value: 'no', label: 'No' },
] as const;

export type SmokerStatus = (typeof SMOKER_STATUS_OPTIONS)[number]['value'];
