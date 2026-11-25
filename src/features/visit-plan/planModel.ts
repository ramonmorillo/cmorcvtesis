// Modelo puro del plan de visita: tipos, presets, validación y utilidades de presentación.
// Sin dependencias de Supabase ni de React para poder probarlo de forma aislada.

export const PLAN_ITEM_KINDS = ['parameter', 'test', 'action', 'question', 'referral'] as const;
export type PlanItemKind = (typeof PLAN_ITEM_KINDS)[number];

export const PLAN_ITEM_KIND_LABELS: Record<PlanItemKind, string> = {
  parameter: 'Parámetro',
  test: 'Prueba',
  action: 'Actuación',
  question: 'Pregunta',
  referral: 'Derivación',
};

export type PlanItemStatus = 'pending' | 'done' | 'dropped';

export type PlanItem = {
  id: string;
  patient_id: string;
  origin_visit_id: string | null;
  kind: PlanItemKind;
  label: string;
  catalog_code: string | null;
  status: PlanItemStatus;
  completed_visit_id: string | null;
  completed_at: string | null;
  outcome_note: string | null;
  dropped_reason: string | null;
  created_at: string;
};

export type PlanPreset = { label: string; kind: PlanItemKind; catalog_code: string | null };

// Objetivos frecuentes. Los códigos de catálogo enlazan con cost_catalog_items (migración de costes).
export const PLAN_PRESETS: PlanPreset[] = [
  { label: 'Medir tensión arterial', kind: 'parameter', catalog_code: 'bp_measurement' },
  { label: 'Glucemia en ayunas', kind: 'parameter', catalog_code: 'fasting_glucose' },
  { label: 'Perfil lipídico', kind: 'parameter', catalog_code: null },
  { label: 'Pesar / medir cintura', kind: 'parameter', catalog_code: null },
  { label: 'Cribado de fibrilación auricular', kind: 'test', catalog_code: 'af_screening' },
  { label: 'MAPA', kind: 'test', catalog_code: 'abpm' },
  { label: 'HbA1c', kind: 'test', catalog_code: 'hba1c_pl_discs' },
  { label: 'Evaluar adherencia', kind: 'action', catalog_code: null },
  { label: 'Abordar alimentación', kind: 'action', catalog_code: null },
  { label: 'Revisar medicación concomitante', kind: 'action', catalog_code: null },
  { label: 'Revisar control de glucemias', kind: 'action', catalog_code: null },
];

export const PLAN_LABEL_MAX_LENGTH = 200;

type NewPlanItemInput = { label: string; kind: PlanItemKind; catalog_code?: string | null };
export type ValidatedPlanItem = { label: string; kind: PlanItemKind; catalog_code: string | null };
export type ValidationResult = { ok: true; value: ValidatedPlanItem } | { ok: false; message: string };

export function validateNewPlanItem(input: NewPlanItemInput): ValidationResult {
  const label = input.label.trim();
  if (!label) return { ok: false, message: 'Escribe el objetivo antes de añadirlo.' };
  if (label.length > PLAN_LABEL_MAX_LENGTH) {
    return { ok: false, message: `El objetivo no puede superar ${PLAN_LABEL_MAX_LENGTH} caracteres.` };
  }
  if (!PLAN_ITEM_KINDS.includes(input.kind)) return { ok: false, message: 'Tipo de objetivo no válido.' };
  return { ok: true, value: { label, kind: input.kind, catalog_code: input.catalog_code ?? null } };
}

const DAYS_PER_MONTH = 30.4375;

/** Texto corto para "hace cuánto" a partir de días naturales. */
export function describeElapsedDays(days: number | null): string {
  if (days === null) return 'Sin visitas realizadas';
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Hace 1 día';
  if (days < 30) return `Hace ${days} días`;
  if (days < 60) return `Hace ${Math.floor(days / 7)} semanas`;
  if (days < 365) {
    const months = Math.round(days / DAYS_PER_MONTH);
    return months === 1 ? 'Hace 1 mes' : `Hace ${months} meses`;
  }
  const years = Math.floor(days / 365);
  const months = Math.round((days - years * 365) / DAYS_PER_MONTH);
  const yearText = years === 1 ? '1 año' : `${years} años`;
  if (months === 0) return `Hace ${yearText}`;
  return `Hace ${yearText} y ${months === 1 ? '1 mes' : `${months} meses`}`;
}

/** Agrupa objetivos por visita de origen (null = sin visita asociada) conservando el orden de creación. */
export function groupOpenItemsByOrigin<T extends { origin_visit_id: string | null; created_at: string }>(
  items: T[],
): Map<string | null, T[]> {
  const groups = new Map<string | null, T[]>();
  [...items]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .forEach((item) => {
      groups.set(item.origin_visit_id, [...(groups.get(item.origin_visit_id) ?? []), item]);
    });
  return groups;
}
