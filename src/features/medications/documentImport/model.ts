import { readPrescriptionTable, type DocumentWord, type PrescriptionTableRow } from './tableLayout';
import type { MedicationCatalogItem, PatientMedicationDraft } from '../types';

export type TreatmentStatus = 'unknown' | 'active' | 'stopped';
export type Provenance = 'document' | 'manual' | 'cima' | 'undetermined';
export type ImportField = 'name' | 'strength' | 'form' | 'dose' | 'frequency' | 'route' | 'status';
export type Proposal = {
  id: string;
  page: number;
  original: string;
  name: string;
  strength: string;
  form: string;
  dose: string;
  frequency: string;
  route: string;
  status: TreatmentStatus;
  provenance: Record<ImportField, Provenance>;
  selected: boolean;
  reviewed: boolean;
  catalog?: MedicationCatalogItem;
};
export type DocumentPage = {
  page: number;
  text: string;
  method: 'text' | 'ocr';
  words?: DocumentWord[];
  tableRows?: PrescriptionTableRow[];
};
export const normalizeDrug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Heuristics produce candidates, never clinical decisions. Strength is NOT the prescribed dose.
const strengthPattern =
  /\b\d+(?:[.,]\d+)?\s*(?:microgramos?|mcg|mg|gramos?|g|ml|UI|%)\b(?:\s*\/\s*(?:\d+(?:[.,]\d+)?\s*)?(?:ml|mg|g))?/i;
const formPattern =
  /\b(?:comprimidos?|cápsulas?|capsulas?|solución|solucion|jarabe|crema|pomada|parches?|inhalador|colirio|sobres?)\b/i;
const dosePattern =
  /\b\d+(?:[.,]\d+|\s*\/\s*\d+)?\s*(?:comprimidos?|cápsulas?|capsulas?|sobres?|pulsaciones?|gotas?|aplicaciones?|parches?)\b|\bdosis\s*[:=]\s*\d+(?:[.,]\d+)?\s*(?:mg|g|ml|UI)\b/i;
const frequencyPattern =
  /\bcada\s+\d+(?:[.,]\d+)?\s*(?:horas?|h|días?|dias?|semanas?)\b|\b\d+\s*ve(?:z|ces)\s*(?:al|por|\/)\s*d[ií]a\b|\b[0-9½]+\s*-\s*[0-9½]+\s*-\s*[0-9½]+\b|\b(?:desayuno y cena|desayuno|comida|cena|según necesidad|segun necesidad)\b/i;
const routePattern =
  /\b(?:oral|subcutánea|subcutanea|intravenosa|inhalada|tópica|topica|oftálmica|oftalmica|intramuscular|rectal)\b/i;
function cleanMedicationPrefix(text: string): string {
  return text
    .replace(/^\s*(?:[A-Z0-9]{6,12}\s+)?\d{6}\s*/i, '')
    .replace(/^\s*[-•\d.)]+\s*/, '')
    .replace(/^(?:medicamento|tratamiento)\s*:/i, '')
    .trim();
}
function makeProposal(original: string, page: number, id: string, table?: PrescriptionTableRow): Proposal {
  const medication = cleanMedicationPrefix(table?.medication ?? original);
  const identity = medication.split(
    /;|\b(?:dosis|pauta|frecuencia)\s*[:=]|\b\d+(?:[.,]\d+)?\s*(?:comprimidos?|c[áa]psulas?|sobres?)\b|\bcada\b/i,
  )[0];
  const strengths = [...identity.matchAll(new RegExp(strengthPattern.source, 'gi'))];
  const strength = strengths.map((match) => match[0]).join(' / ');
  const names: string[] = [];
  let end = 0;
  for (const match of strengths) {
    const part = identity
      .slice(end, match.index)
      .replace(/^[\s/+,-]+|[\s/+,-]+$/g, '')
      .trim();
    if (part && !formPattern.test(part) && !routePattern.test(part)) names.push(part);
    end = match.index! + match[0].length;
  }
  const name = (names.length ? names.join(' / ') : identity).trim().slice(0, 160);
  // In a recognized table, package quantities belong to the description, never to posology.
  const regimen = (
    table ? table.regimen : original.replace(/,\s*\d+\s*(?:comprimidos|c[áa]psulas|sobres)\b/gi, ' ')
  ).replace(/\s+/g, ' ');
  const form = original.match(formPattern)?.[0] ?? '';
  const matches = (pattern: RegExp) => [...new Set(regimen.match(new RegExp(pattern.source, 'gi')) ?? [])];
  const doses = matches(dosePattern);
  const frequencies = matches(frequencyPattern);
  const ambiguous = /\b(?:variable|alternar|alternos?|ajustar|seg[uú]n controles)\b|\d+\s+o\s+\d+/i.test(original);
  const doseCandidate = doses.length === 1 ? doses[0].replace(/^dosis\s*[:=]\s*/i, '') : '';
  // A pack size is not a prescription. Multiple quantities or uncertain regimens require manual review.
  const packOnly = !/\bdosis\s*[:=]/i.test(original) && (!frequencies.length || Number.parseFloat(doseCandidate) > 10);
  const dose = ambiguous || packOnly ? '' : doseCandidate;
  const frequency = !ambiguous && frequencies.length === 1 ? frequencies[0] : '';
  const route = original.match(routePattern)?.[0] ?? '';
  const stopped = /\b(?:suspendido|suspendida|retirado|retirada|suspender|no tomar)\b/i.test(original);
  const active = /\b(?:activo|activa|continuar)\b/i.test(original);
  const uncertainState = /\bno\s+(?:activ[oa]|suspendid[oa]|continuar)\b/i.test(original);
  const status: TreatmentStatus = uncertainState
    ? 'unknown'
    : stopped && !active
      ? 'stopped'
      : active && !stopped
        ? 'active'
        : 'unknown';
  const values = { name, strength, form, dose, frequency, route, status };
  const provenance = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value && value !== 'unknown' ? 'document' : 'undetermined']),
  ) as Proposal['provenance'];
  return { id, page, original, ...values, provenance, selected: false, reviewed: false };
}
export function parseMedicationPages(pages: DocumentPage[]): Proposal[] {
  const proposals: Proposal[] = [];
  for (const page of pages) {
    const table = page.tableRows ?? (page.words ? readPrescriptionTable(page.words) : null);
    if (table?.length) {
      for (const row of table)
        proposals.push(makeProposal(row.original, page.page, `${page.page}-${proposals.length}`, row));
      continue;
    }
    const lines = page.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    let block = '';
    const flush = () => {
      if (block) proposals.push(makeProposal(block, page.page, `${page.page}-${proposals.length}`));
      block = '';
    };
    for (const line of lines) {
      const cleaned = cleanMedicationPrefix(line);
      const continuation =
        /^(?:(?:dosis|pauta|frecuencia|v[ií]a|estado)\b|suspendid[oa]\b|activ[oa]\b|cada\b|(?:\d+(?:[.,]\d+|\s*\/\s*\d+)?\s*)?(?:comprimidos?|c[áa]psulas?|sobres?|gotas?)\b|\d+\s*(?:horas?|h|d[ií]as?|semanas?)\b)/i.test(
          line,
        );
      if (continuation) {
        if (block) block += `\n${line}`;
        continue;
      }
      if (/^(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}(?:\s+|$))+$/.test(line)) {
        if (block) block += `\n${line}`;
        continue;
      }
      if (/^[A-Z0-9]{6,12}$/.test(line)) continue;
      const startsDrug =
        /[a-záéíóúñ]/i.test(cleaned) &&
        (strengthPattern.test(cleaned) || dosePattern.test(cleaned) || /^(?:medicamento|tratamiento)\s*:/i.test(line));
      if (startsDrug && block && /[/+]\s*$/.test(block)) block += `\n${line}`;
      else if (startsDrug) {
        flush();
        block = line;
      } else {
        flush();
      }
    }
    flush();
  }
  return proposals;
}

export type ExistingTreatment = {
  medication_catalog_id: string;
  display_name: string;
  active_ingredient?: string | null;
};
export function duplicateReason(row: Proposal, existing: ExistingTreatment[], others: Proposal[]): string | null {
  const name = normalizeDrug(row.name);
  const stem = name.replace(/\b\d.*$/, '').trim();
  if (
    existing.some(
      (item) =>
        (row.catalog && item.medication_catalog_id === row.catalog.id) ||
        [item.display_name, item.active_ingredient ?? ''].some((value) => {
          const normalized = normalizeDrug(value);
          const root = normalized.replace(/\b\d.*$/, '').trim();
          return Boolean(name && normalized && (name === normalized || (stem.length >= 3 && root === stem)));
        }),
    )
  )
    return 'Posible duplicado con medicación registrada o preparada. Revisa el registro existente.';
  if (
    others.some(
      (item) =>
        item.id !== row.id &&
        item.selected &&
        ((row.catalog && item.catalog?.id === row.catalog.id) || (name && normalizeDrug(item.name) === name)),
    )
  )
    return 'Posible duplicado dentro del documento. Selecciona una sola propuesta.';
  return null;
}
export function pendingFields(row: Proposal): string[] {
  return [
    !row.name.trim() && 'nombre',
    !row.dose.trim() && 'dosis no determinada',
    !row.frequency.trim() && 'pauta no determinada',
    row.status === 'unknown' && 'estado no determinado',
    row.status === 'stopped' && 'suspendido: no se incorpora como activo',
    !row.catalog && 'selección de catálogo',
    !row.reviewed && 'revisión profesional',
  ].filter((v): v is string => Boolean(v));
}
export function importBlockingIssues(rows: Proposal[], existing: ExistingTreatment[]): string[] {
  const selected = rows.filter((row) => row.selected);
  if (!selected.length) return ['Selecciona al menos un tratamiento mediante la casilla «Seleccionar» de su fila.'];
  if (selected.length > 100) return ['Máximo 100 tratamientos por lote.'];
  return rows.flatMap((row, index) => {
    if (!row.selected) return [];
    const reasons = [
      !row.name.trim() && 'indica el nombre',
      !row.catalog && 'elige una entrada en «Catálogo y normalización»',
      row.status === 'unknown' && 'confirma el estado (no determinado)',
      row.status === 'stopped' && 'está suspendido: descártalo del lote activo',
      !row.reviewed && 'marca la revisión profesional de esta fila',
      duplicateReason(row, existing, selected),
    ].filter(Boolean);
    return reasons.length ? [`Tratamiento ${index + 1} · ${row.name || 'sin nombre'}: ${reasons.join('; ')}.`] : [];
  });
}
export function prepareImportDrafts(rows: Proposal[], existing: ExistingTreatment[]): PatientMedicationDraft[] {
  const issues = importBlockingIssues(rows, existing);
  if (issues.length) throw Error(issues.join('\n'));
  const selected = rows.filter((row) => row.selected);
  // Explicit whitelist: no original text, document metadata or normalisation payload leaves review.
  return selected.map((row) => ({
    medication_catalog_id: row.catalog!.id,
    dose_text: row.dose.trim(),
    frequency_text: row.frequency.trim(),
    route_text: row.route.trim(),
    indication: '',
    start_date: '',
    notes: '',
    is_active: true,
  }));
}

export function isDrugOnlyQuery(query: string): boolean {
  return (
    /^[a-záéíóúüñ][a-záéíóúüñ /-]{1,59}$/i.test(query.trim()) &&
    !/\b(?:paciente|nombre|dni|historia|fecha|tel[eé]fono|direcci[oó]n)\b/i.test(query)
  );
}
