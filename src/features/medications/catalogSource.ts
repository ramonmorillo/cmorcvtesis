import type { MedicationCatalogItem, MedicationCatalogSource, MedicationOrigin } from './types';

const KNOWN_SOURCES: ReadonlySet<MedicationCatalogSource> = new Set(['internal', 'external_cima', 'external_other']);

export function normalizeMedicationCatalogSource(source: string | null | undefined): MedicationCatalogSource {
  const normalized = (source ?? '').trim().toLowerCase();
  if (KNOWN_SOURCES.has(normalized as MedicationCatalogSource)) {
    return normalized as MedicationCatalogSource;
  }

  return normalized.includes('cima') ? 'external_cima' : 'internal';
}

export function resolveMedicationOrigin(item: Pick<MedicationCatalogItem, 'source' | 'source_code'>): MedicationOrigin {
  if (item.source === 'internal') {
    return { kind: 'internal', source: 'internal' };
  }

  return {
    kind: 'external',
    source: item.source,
    source_code: item.source_code,
  };
}
