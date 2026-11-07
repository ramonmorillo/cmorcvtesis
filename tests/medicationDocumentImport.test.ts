import { describe, expect, it } from 'vitest';
import {
  duplicateReason,
  isDrugOnlyQuery,
  parseMedicationPages,
  pendingFields,
  prepareImportDrafts,
  type Proposal,
} from '../src/features/medications/documentImport/model';
import type { MedicationCatalogItem } from '../src/features/medications/types';
const parse = (text: string) => parseMedicationPages([{ page: 1, text, method: 'text' }]);
const catalog = {
  id: 'catalog-1',
  display_name: 'Atorvastatina 40 mg',
  active_ingredient: 'Atorvastatina',
} as MedicationCatalogItem;
const ready = (): Proposal => ({
  ...parse('Atorvastatina 40 mg comprimidos; 1 comprimido cada 24 h; oral; activo')[0],
  catalog,
  selected: true,
  reviewed: true,
});
describe('document medication proposals', () => {
  it('extracts several medications without confusing strength and prescribed dose', () => {
    const rows = parse(
      'Atorvastatina 40 mg comprimidos; 1 comprimido cada 24 h; oral; activo\nMetformina 850 mg comprimidos; 2 comprimidos cada 12 h; activo',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: 'Atorvastatina',
      strength: '40 mg',
      dose: '1 comprimido',
      frequency: 'cada 24 h',
      route: 'oral',
      status: 'active',
    });
    expect(rows[1].dose).toBe('2 comprimidos');
  });
  it('does not invent prescribed dose, frequency or active state from strength', () => {
    const [row] = parse('Enalapril 20 mg comprimidos');
    expect(row).toMatchObject({ strength: '20 mg', dose: '', frequency: '', status: 'unknown' });
    expect(pendingFields(row)).toContain('estado no determinado');
  });
  it('keeps multiline original and page', () => {
    const [row] = parseMedicationPages([
      { page: 3, text: 'Enalapril 20 mg\nDosis: 1 comprimido\nPauta: cada 12 h\nEstado: suspendido', method: 'ocr' },
    ]);
    expect(row.page).toBe(3);
    expect(row.status).toBe('stopped');
    expect(row.original).toContain('\nPauta:');
  });
  it('leaves conflicting states and ambiguous regimens pending', () => {
    const [row] = parse('Enalapril 20 mg activo, suspendido. Pauta variable según controles');
    expect(row.status).toBe('unknown');
    expect(row.frequency).toBe('');
    expect(row.original).toContain('variable');
  });
  it('blocks suspended and unreviewed rows', () => {
    expect(() => prepareImportDrafts([{ ...ready(), status: 'stopped' }], [])).toThrow();
    expect(() => prepareImportDrafts([{ ...ready(), reviewed: false }], [])).toThrow();
    expect(() => prepareImportDrafts([{ ...ready(), status: 'unknown' }], [])).toThrow();
  });
  it('detects catalogue, name, ingredient and within-document duplicates', () => {
    expect(duplicateReason(ready(), [{ medication_catalog_id: catalog.id, display_name: 'Otro' }], [])).toBeTruthy();
    expect(
      duplicateReason(ready(), [{ medication_catalog_id: 'x', display_name: 'ATORVASTATINA 20 mg' }], []),
    ).toBeTruthy();
    expect(
      duplicateReason(
        ready(),
        [{ medication_catalog_id: 'x', display_name: 'Marca', active_ingredient: 'atorvastatina' }],
        [],
      ),
    ).toBeTruthy();
    expect(duplicateReason(ready(), [], [{ ...ready(), id: 'other' }])).toBeTruthy();
    expect(() => prepareImportDrafts([ready(), { ...ready(), id: 'other' }], [])).toThrow();
  });
  it('creates a strict whitelist, excluding original, names, document and CIMA payloads', () => {
    const [draft] = prepareImportDrafts([ready()], []);
    expect(draft).toEqual({
      medication_catalog_id: 'catalog-1',
      dose_text: '1 comprimido',
      frequency_text: 'cada 24 h',
      route_text: 'oral',
      indication: '',
      start_date: '',
      notes: '',
      is_active: true,
    });
    expect(JSON.stringify(draft)).not.toContain('Atorvastatina');
  });
  it('requires explicit row selection and a catalog choice', () => {
    expect(() => prepareImportDrafts([{ ...ready(), selected: false }], [])).toThrow();
    expect(() => prepareImportDrafts([{ ...ready(), catalog: undefined }], [])).toThrow();
  });
  it('allows explicitly reviewed undetermined dose without filling it', () => {
    expect(prepareImportDrafts([{ ...ready(), dose: '', frequency: '' }], [])[0].dose_text).toBe('');
  });
  it('does not turn packaging, alternatives or conflicting frequencies into a prescription', () => {
    for (const text of [
      'Atorvastatina 40 mg 28 comprimidos',
      'Atorvastatina 40 mg 28 comprimidos; 1 comprimido cada 24 h',
      'Atorvastatina 40 mg; 1 o 2 comprimidos cada 24 h',
    ]) {
      expect(parse(text)[0].dose).toBe('');
    }
    expect(parse('Enalapril 20 mg; cada 12 h o cada 24 h')[0].frequency).toBe('');
  });
  it('does not automatically select extracted rows', () => {
    expect(parse('Enalapril 20 mg')[0].selected).toBe(false);
  });
  it('rejects obvious identifiers and full clinical lines from drug queries', () => {
    expect(isDrugOnlyQuery('atorvastatina')).toBe(true);
    for (const query of [
      'Paciente Juan',
      'DNI 12345678',
      'Enalapril 20 mg',
      'Juan\nAtorvastatina',
      'fecha nacimiento',
      'a@b.es',
    ])
      expect(isDrugOnlyQuery(query)).toBe(false);
  });
});
