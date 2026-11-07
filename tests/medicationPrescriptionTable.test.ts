import { describe, expect, it } from 'vitest';
import {
  parseMedicationPages,
  importBlockingIssues,
  type Proposal,
} from '../src/features/medications/documentImport/model';
import { readPrescriptionTable, type DocumentWord } from '../src/features/medications/documentImport/tableLayout';
const cells = [
  ['321001 OMEPRAZOL 20MG, 56 CAPSULAS - VÍA ORAL', '1 CAPSULA cada\n24 Horas'],
  ['321002 TRAMADOL CLORHIDRATO 37,5MG / PARACETAMOL 325MG, 60\nCOMPRIMIDOS - VÍA ORAL', '1 COMPRIMIDO\ncada 12 Horas'],
  ['321003 SIMVASTATINA 20MG, 28 COMPRIMIDOS - VÍA ORAL', '1 COMPRIMIDO\ncada 24 Horas'],
  ['321004 TADALAFILO 20MG, 4 COMPRIMIDOS - VÍA ORAL', '1 COMPRIMIDO\ncada 5 Días'],
  ['321005 METFORMINA 850MG, 50 COMPRIMIDOS - VÍA ORAL', '1 COMPRIMIDO\ncada 12 Horas'],
];
function line(text: string, x: number, y: number): DocumentWord[] {
  let cursor = x;
  return text.split(' ').map((text) => {
    const x0 = cursor;
    cursor += text.length * 6 + 6;
    return { text, x0, x1: cursor - 6, y0: y, y1: y + 12 };
  });
}
function tableWords(): DocumentWord[] {
  const words = [
    ...line('PRESCRIPCIONES / INSTRUCCIONES AL PACIENTE', 150, 30),
    ...line('POSOLOGÍA', 600, 30),
    ...line('FECHA', 740, 30),
  ];
  cells.forEach(([medication, regimen], i) => {
    const y = 100 + i * 70;
    words.push(...line(`SYNTH${i}XX`, 20, y));
    medication.split('\n').forEach((text, n) => words.push(...line(text, 150, y + n * 18)));
    regimen.split('\n').forEach((text, n) => words.push(...line(text, 600, y - 4 + n * 18)));
    words.push(...line('01/01/2031', 740, y), ...line('01/06/2031', 830, y));
  });
  return words;
}
describe('prescription table rows (synthetic, no personal identifiers)', () => {
  it('uses coordinates to produce five prescriptions even with column-wise OCR reading order', () => {
    const words = tableWords().reverse();
    const rows = parseMedicationPages([{ page: 1, text: 'column-wise OCR', method: 'ocr', words }]);
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.name)).toEqual([
      'OMEPRAZOL',
      'TRAMADOL CLORHIDRATO / PARACETAMOL',
      'SIMVASTATINA',
      'TADALAFILO',
      'METFORMINA',
    ]);
    expect(rows.map((row) => row.dose)).toEqual([
      '1 CAPSULA',
      '1 COMPRIMIDO',
      '1 COMPRIMIDO',
      '1 COMPRIMIDO',
      '1 COMPRIMIDO',
    ]);
    expect(rows.map((row) => row.frequency)).toEqual([
      'cada 24 Horas',
      'cada 12 Horas',
      'cada 24 Horas',
      'cada 5 Días',
      'cada 12 Horas',
    ]);
    expect(rows[1].strength).toBe('37,5MG / 325MG');
    expect(rows.every((row) => row.status === 'unknown' && !row.selected)).toBe(true);
    expect(rows[0].original).toContain('321001');
    expect(rows[0].original).not.toContain('321002');
  });
  it('requires explicit table evidence rather than rearranging arbitrary paragraphs', () => {
    const words = tableWords().filter((word) => word.text !== 'POSOLOGÍA');
    expect(readPrescriptionTable(words)).toBeNull();
  });
  it('joins split capsule regimens without creating fictitious medications', () => {
    const text =
      'SYNTH01X 321001 OMEPRAZOL 20MG, 56 CAPSULAS - VÍA ORAL\n1 CAPSULA cada\n24 Horas\n01/01/2031 01/06/2031\n321005 METFORMINA 850MG, 50 COMPRIMIDOS - VÍA ORAL\n1 COMPRIMIDO\ncada 12 Horas';
    const rows = parseMedicationPages([{ page: 1, text, method: 'ocr' }]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: 'OMEPRAZOL', dose: '1 CAPSULA', frequency: 'cada 24 Horas' });
    expect(rows[1]).toMatchObject({ name: 'METFORMINA', dose: '1 COMPRIMIDO', frequency: 'cada 12 Horas' });
  });
  it('never creates a row from an orphaned posology or a header', () => {
    expect(
      parseMedicationPages([
        { page: 1, text: 'POSOLOGÍA\n1 CAPSULA cada\n24 Horas\nCOMPRIMIDOS - VÍA ORAL', method: 'ocr' },
      ]),
    ).toEqual([]);
  });
  it('retains multiline combination names and both concentrations', () => {
    const [row] = parseMedicationPages([
      {
        page: 1,
        text: '321002 TRAMADOL CLORHIDRATO 37,5MG /\nPARACETAMOL 325MG, 60 COMPRIMIDOS - VÍA ORAL\n1 COMPRIMIDO cada 12 Horas',
        method: 'ocr',
      },
    ]);
    expect(row).toMatchObject({
      name: 'TRAMADOL CLORHIDRATO / PARACETAMOL',
      strength: '37,5MG / 325MG',
      dose: '1 COMPRIMIDO',
    });
  });
  it('gives actionable row-level reasons when final confirmation is insufficient', () => {
    const [row] = parseMedicationPages([
      { page: 1, text: '321001 OMEPRAZOL 20MG, 56 CAPSULAS - VÍA ORAL', method: 'text' },
    ]);
    const issues = importBlockingIssues([{ ...row, selected: true }], []);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('Tratamiento 1 · OMEPRAZOL');
    expect(issues[0]).toContain('Catálogo y normalización');
    expect(issues[0]).toContain('estado');
    expect(issues[0]).toContain('revisión profesional');
    expect(importBlockingIssues([row], [])[0]).toContain('Selecciona al menos');
    expect(
      importBlockingIssues(
        [
          {
            ...row,
            selected: true,
            reviewed: true,
            status: 'active',
            catalog: { id: 'synthetic' } as Proposal['catalog'],
          },
        ],
        [],
      ),
    ).toEqual([]);
  });
});
