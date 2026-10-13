export const DOSE_UNIT_OPTIONS = ['mg', 'g', 'UI', 'ml', 'comprimido(s)', 'cápsula(s)', 'gota(s)', 'puff(s)', 'otra'] as const;

export type DoseUnitOptionValue = (typeof DOSE_UNIT_OPTIONS)[number];

export type DoseFields = {
  dose_amount: string;
  dose_unit_hint: DoseUnitOptionValue | '';
  dose_text: string;
};

function normalizeTextValue(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function comparableDose(value: string): string {
  return value.trim().toLowerCase().replace(/,/g, '.').replace(/\s+/g, ' ');
}

function inferDoseUnitHint(doseText: string): DoseUnitOptionValue | '' {
  const normalized = doseText.toLowerCase();
  const matched = DOSE_UNIT_OPTIONS.find((unit) => unit !== 'otra' && normalized.includes(unit.toLowerCase()));
  return matched ?? '';
}

function inferDoseAmount(doseText: string): string {
  const matched = doseText.replace(',', '.').match(/^([0-9]+(?:\.[0-9]+)?)\b/);
  return matched?.[1]?.replace('.', ',') ?? '';
}

/**
 * Texto de dosis que se persiste en patient_medications.dose_text.
 * Cantidad + unidad forman la parte estructurada; el texto libre se conserva
 * (antes se descartaba en silencio cuando había cantidad).
 */
export function buildDoseText(row: DoseFields): string {
  const freeDoseText = normalizeTextValue(row.dose_text);
  const normalizedAmount = normalizeTextValue(row.dose_amount);
  const hasUnit = Boolean(row.dose_unit_hint) && row.dose_unit_hint !== 'otra';

  if (normalizedAmount) {
    const structured = hasUnit ? `${normalizedAmount} ${row.dose_unit_hint}` : normalizedAmount;
    if (!freeDoseText || comparableDose(freeDoseText) === comparableDose(structured)) return structured;
    return `${structured} · ${freeDoseText}`;
  }

  if (!freeDoseText || !hasUnit) {
    return freeDoseText;
  }

  const isMostlyNumeric = /^[0-9]+([.,][0-9]+)?$/.test(freeDoseText);
  const hasKnownUnit = DOSE_UNIT_OPTIONS.some((unit) => unit !== 'otra' && freeDoseText.toLowerCase().includes(unit.toLowerCase()));
  if (isMostlyNumeric && !hasKnownUnit) {
    return `${freeDoseText} ${row.dose_unit_hint}`;
  }
  return freeDoseText;
}

/**
 * Reparte una dosis guardada entre los campos del formulario sin duplicarla:
 * si es exactamente "cantidad [unidad]" va a los campos estructurados; si no,
 * se mantiene íntegra como texto libre para que pueda editarse y no se trunque.
 */
export function splitSavedDoseText(savedDoseText: string | null | undefined): DoseFields {
  const saved = normalizeTextValue(savedDoseText);
  if (!saved) return { dose_amount: '', dose_unit_hint: '', dose_text: '' };

  const structured: DoseFields = {
    dose_amount: inferDoseAmount(saved),
    dose_unit_hint: inferDoseUnitHint(saved),
    dose_text: '',
  };
  if (structured.dose_amount && comparableDose(buildDoseText(structured)) === comparableDose(saved)) {
    return structured;
  }

  return { dose_amount: '', dose_unit_hint: '', dose_text: saved };
}
