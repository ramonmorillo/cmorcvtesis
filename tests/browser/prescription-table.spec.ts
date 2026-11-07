import { test, expect, type Page } from '@playwright/test';
import { positionedTextPdf, scannedPdf, type SyntheticTextCell } from './fixtures';
// Same document structure as a prescription table, all identifiers/dates synthetic.
const medications = [
  ['321001 OMEPRAZOL 20MG, 56 CAPSULAS - VIA ORAL', '1 CAPSULA cada', '24 Horas'],
  [
    '321002 TRAMADOL CLORHIDRATO 37,5MG / PARACETAMOL 325MG, 60',
    '1 COMPRIMIDO',
    'cada 12 Horas',
    'COMPRIMIDOS - VIA ORAL',
  ],
  ['321003 SIMVASTATINA 20MG, 28 COMPRIMIDOS - VIA ORAL', '1 COMPRIMIDO', 'cada 24 Horas'],
  ['321004 TADALAFILO 20MG, 4 COMPRIMIDOS - VIA ORAL', '1 COMPRIMIDO', 'cada 5 Dias'],
  ['321005 METFORMINA 850MG, 50 COMPRIMIDOS - VIA ORAL', '1 COMPRIMIDO', 'cada 12 Horas'],
];
function cells(): SyntheticTextCell[] {
  const result = [
    { text: 'NUMERO', x: 50, y: 110 },
    { text: 'PRESCRIPCION', x: 35, y: 135 },
    { text: 'PRESCRIPCIONES / INSTRUCCIONES AL PACIENTE', x: 350, y: 125 },
    { text: 'POSOLOGIA', x: 1270, y: 125 },
    { text: 'FECHA', x: 1480, y: 125 },
    { text: 'FECHA', x: 1640, y: 125 },
  ];
  medications.forEach(([name, dose, frequency, continuation], i) => {
    const y = 195 + i * 140;
    result.push(
      { text: `SYNTH${i}XX`, x: 45, y: y + 10 },
      { text: name, x: 235, y: y + 10 },
      { text: dose, x: 1260, y: y },
      { text: frequency, x: 1260, y: y + 27 },
      { text: '01/01/2031', x: 1455, y: y + 10 },
      { text: '01/06/2031', x: 1615, y: y + 10 },
    );
    if (continuation) result.push({ text: continuation, x: 235, y: y + 36 });
  });
  return result;
}
async function image(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate((cells) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1800;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 1800, 1000);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    for (const x of [20, 220, 1240, 1440, 1600, 1780]) {
      ctx.beginPath();
      ctx.moveTo(x, 80);
      ctx.lineTo(x, 850);
      ctx.stroke();
    }
    for (const y of [80, 150, 290, 430, 570, 710, 850]) {
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(1780, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'black';
    ctx.font = '20px Arial';
    for (const cell of cells) ctx.fillText(cell.text, cell.x, cell.y);
    return canvas.toDataURL('image/jpeg', 0.98).split(',')[1];
  }, cells());
  return Buffer.from(base64, 'base64');
}
for (const format of ['digital', 'image', 'scan'] as const)
  test(`five prescription rows with codes, packaging and multiline posology: ${format}`, async ({ page, context }) => {
    const external: string[] = [];
    context.on('request', (r) => {
      if (!r.url().startsWith('http://127.0.0.1:5174/')) external.push(r.url());
    });
    await page.goto('/tests/browser/import-harness.html');
    await page.getByRole('button', { name: 'Importar medicación desde PDF o imagen', exact: true }).click();
    const buffer = format === 'digital' ? positionedTextPdf(cells()) : await image(page);
    await page.getByLabel('Documento de tratamiento').setInputFiles({
      name: format === 'image' ? 'synthetic-table.jpeg' : 'synthetic-table.pdf',
      mimeType: format === 'image' ? 'image/jpeg' : 'application/pdf',
      buffer: format === 'scan' ? scannedPdf(buffer, 1800, 1000) : buffer,
    });
    await expect(page.getByLabel('Nombre 1', { exact: true })).toHaveValue(/OMEPRAZOL/i, { timeout: 60000 });
    await expect(page.getByRole('textbox', { name: /^Nombre \d+$/ })).toHaveCount(5);
    for (const [i, name] of [
      'OMEPRAZOL',
      'TRAMADOL CLORHIDRATO / PARACETAMOL',
      'SIMVASTATINA',
      'TADALAFILO',
      'METFORMINA',
    ].entries()) {
      await expect(page.getByLabel(`Nombre ${i + 1}`, { exact: true })).toHaveValue(new RegExp(`^${name}$`, 'i'));
      await expect(page.getByLabel(`Dosis prescrita ${i + 1}`, { exact: true })).toHaveValue(
        i === 0 ? /^1 CAPSULA$/i : /^1 COMPRIMIDO$/i,
      );
      await expect(page.getByLabel(`Estado ${i + 1}`, { exact: true })).toHaveValue('unknown');
    }
    await expect(page.getByLabel('Concentración 2', { exact: true })).toHaveValue(/37[,.]5\s?MG \/ 325\s?MG/i);
    await expect(page.getByLabel('Pauta 1', { exact: true })).toHaveValue(/cada 24 Horas/i);
    await expect(page.getByLabel('Pauta 4', { exact: true })).toHaveValue(/cada 5 D[ií]as/i);
    expect(external).toEqual([]);
  });
