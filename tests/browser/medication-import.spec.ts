import { test, expect, type Page } from '@playwright/test';
import { textPdf, scannedPdf } from './fixtures';
const C = '44444444-4444-4444-8444-444444444444';
const catalog = {
  id: C,
  display_name: 'Atorvastatina 40 mg',
  active_ingredient: 'Atorvastatina',
  strength: '40 mg',
  form: 'comprimidos',
  route: 'oral',
  source: 'manual',
  source_code: null,
  created_at: '2026-11-01',
  updated_at: '2026-11-01',
};
const treatment = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  patient_id: '22222222-2222-4222-8222-222222222222',
  medication_catalog_id: C,
  dose_text: '1 comprimido',
  frequency_text: 'cada 24 h',
  route_text: 'oral',
  is_active: true,
  medication_catalog: catalog,
  created_at: '2026-11-01',
  updated_at: '2026-11-01',
};
const visit = {
  id: '33333333-3333-4333-8333-333333333333',
  patient_id: treatment.patient_id,
  visit_type: 'baseline',
  visit_date: '2026-11-01',
  visit_number: 1,
};
const lines = [
  'DOCUMENTO SINTETICO DE PRUEBA - NO CONTIENE DATOS REALES',
  'Atorvastatina 40 mg comprimidos; 1 comprimido cada 24 h; oral; activo',
  'Metformina 850 mg comprimidos; 2 comprimidos cada 12 h; suspendido',
];
async function open(page: Page, query = '') {
  await page.goto(`/tests/browser/import-harness.html${query}`);
  await page.getByRole('button', { name: 'Importar medicación desde PDF o imagen', exact: true }).click();
}
async function uploadPdf(page: Page) {
  await page.getByLabel('Documento de tratamiento').setInputFiles({
    name: 'sintetico.pdf',
    mimeType: 'application/pdf',
    buffer: textPdf([
      lines,
      ['Enalapril 20 mg comprimidos; dosis variable; pauta pendiente de revision profesional sin estado determinado'],
    ]),
  });
  await expect(page.getByLabel('Nombre 1', { exact: true })).toHaveValue('Atorvastatina', { timeout: 30000 });
}
async function selectCatalog(page: Page) {
  await page.getByText('Catálogo y normalización (selección obligatoria)', { exact: true }).first().click();
  await page.getByLabel('Término farmacológico para consultar').first().fill('atorvastatina');
  await page.getByLabel('He comprobado que el término solo contiene').first().check();
  await page.getByRole('button', { name: 'Buscar catálogo local', exact: true }).first().click();
  await page.getByRole('button', { name: 'Seleccionar Atorvastatina 40 mg', exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await page.route('https://synthetic.supabase.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const response = path.endsWith('/rpc/import_visit_medication_document')
      ? ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']
      : path.endsWith('/medication_catalog')
        ? [catalog]
        : path.endsWith('/patient_medications')
          ? [treatment]
          : path.endsWith('/visits')
            ? [visit]
            : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
});
test('digital multipage PDF extracts dose, state and original locally; cancel writes nothing', async ({
  page,
  context,
}) => {
  const requests: string[] = [];
  context.on('request', (request) => requests.push(request.url()));
  await open(page);
  await uploadPdf(page);
  await expect(page.getByLabel('Dosis prescrita 1', { exact: true })).toHaveValue('1 comprimido');
  await expect(page.getByLabel('Pauta 1', { exact: true })).toHaveValue('cada 24 h');
  await expect(page.getByLabel('Estado 2', { exact: true })).toHaveValue('stopped');
  await expect(page.getByLabel('Estado 3', { exact: true })).toHaveValue('unknown');
  await expect(page.getByText('Texto local de la página 2 · PDF digital')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar y cerrar', exact: true }).click();
  expect(requests.filter((url) => !url.startsWith('http://127.0.0.1:5174/'))).toEqual([]);
  await page.getByRole('button', { name: 'Importar medicación desde PDF o imagen', exact: true }).click();
  await expect(page.getByLabel('Nombre 1', { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(async () => ({
      local: localStorage.length,
      session: sessionStorage.length,
      databases: (await indexedDB.databases()).length,
    })),
  ).toEqual({ local: 0, session: 0, databases: 0 });
});
test('does not write before explicit confirmation and sends only whitelisted confirmed fields', async ({ page }) => {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST')
      writes.push({ path: new URL(request.url()).pathname, body: request.postDataJSON() });
  });
  await open(page);
  await uploadPdf(page);
  await selectCatalog(page);
  await page.getByLabel('Incorporar 1', { exact: true }).check();
  await page.getByLabel('Revisado 1', { exact: true }).check();
  expect(writes).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Confirmar e incorporar tratamientos', exact: true })).toBeDisabled();
  await page.getByLabel('Confirmo expresamente la incorporación').check();
  await page.getByRole('button', { name: 'Confirmar e incorporar tratamientos', exact: true }).click();
  await expect(page.locator('output')).toHaveText('Lote guardado');
  expect(writes).toHaveLength(1);
  expect(writes[0].path).toBe('/rest/v1/rpc/import_visit_medication_document');
  expect(writes[0].body.p_rows).toEqual([
    { medication_catalog_id: C, dose_text: '1 comprimido', frequency_text: 'cada 24 h', route_text: 'oral' },
  ]);
});
test('duplicate stays blocked and manual edits invalidate review', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST') writes.push(r.url());
  });
  await open(page, '?duplicate');
  await uploadPdf(page);
  await selectCatalog(page);
  await expect(page.getByText(/Posible duplicado con medicación/).first()).toBeVisible();
  await page.getByLabel('Incorporar 1', { exact: true }).check();
  await page.getByLabel('Revisado 1', { exact: true }).check();
  await page.getByLabel('Dosis prescrita 1', { exact: true }).fill('2 comprimidos');
  await expect(page.getByLabel('Revisado 1', { exact: true })).not.toBeChecked();
  await page.getByLabel('Revisado 1', { exact: true }).check();
  await page.getByLabel('Confirmo expresamente la incorporación').check();
  await page.getByRole('button', { name: 'Confirmar e incorporar tratamientos', exact: true }).click();
  expect(writes).toHaveLength(0);
});
async function image(page: Page, mime: 'image/png' | 'image/jpeg') {
  const data = await page.evaluate((type) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 700;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 1600, 700);
    ctx.fillStyle = 'black';
    ctx.font = '34px Arial';
    [
      'DOCUMENTO SINTETICO - SIN DATOS PERSONALES',
      'Atorvastatina 40 mg comprimidos',
      '1 comprimido cada 24 h oral activo',
      'Metformina 850 mg comprimidos',
      '2 comprimidos cada 12 h suspendido',
    ].forEach((line, i) => ctx.fillText(line, 40, 90 + i * 100));
    return canvas.toDataURL(type).split(',')[1];
  }, mime);
  return Buffer.from(data, 'base64');
}
for (const format of ['png', 'jpeg', 'scan'] as const)
  test(`real local OCR: ${format}, no remote requests or persistent cache`, async ({ page, context }) => {
    const remote: string[] = [];
    const resources: string[] = [];
    context.on('request', (request) => {
      if (!request.url().startsWith('http://127.0.0.1:5174/')) remote.push(request.url());
      else resources.push(request.url());
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page);
    const buffer = await image(page, format === 'png' ? 'image/png' : 'image/jpeg');
    await page.getByLabel('Documento de tratamiento').setInputFiles({
      name: `sintetico.${format === 'scan' ? 'pdf' : format}`,
      mimeType: format === 'scan' ? 'application/pdf' : format === 'png' ? 'image/png' : 'image/jpeg',
      buffer: format === 'scan' ? scannedPdf(buffer) : buffer,
    });
    await expect(page.getByLabel('Nombre 1', { exact: true })).toHaveValue(/Atorvastatina/i, { timeout: 60000 });
    await expect(page.getByLabel('Pauta 1', { exact: true })).toHaveValue(/cada 24 h/i);
    await expect(page.getByLabel('Estado 2', { exact: true })).toHaveValue('stopped');
    expect(remote).toEqual([]);
    expect(errors).toEqual([]);
    expect(resources.some((url) => url.includes('spa.traineddata.gz'))).toBe(true);
    expect(resources.some((url) => url.includes('ocr-worker.min.js'))).toBe(true);
    expect(
      await page.evaluate(async () => ({
        local: localStorage.length,
        databases: (await indexedDB.databases()).length,
      })),
    ).toEqual({ local: 0, databases: 0 });
  });
test('cancel OCR and change patient erase review without writes', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST') writes.push(r.url());
  });
  await open(page);
  await page
    .getByLabel('Documento de tratamiento')
    .setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: await image(page, 'image/png') });
  await page.getByRole('button', { name: 'Cancelar procesamiento', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Importar medicación desde PDF o imagen', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Importar medicación desde PDF o imagen', exact: true }).click();
  await uploadPdf(page);
  await page.getByRole('button', { name: 'Cambiar paciente', exact: true }).click();
  await expect(page.getByLabel('Nombre 1', { exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
});
test('manual registration keeps existing save service and dose controls', async ({ page }) => {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  page.on('request', (r) => {
    if (['POST', 'PATCH'].includes(r.method()))
      writes.push({ path: new URL(r.url()).pathname, body: r.postDataJSON() });
  });
  await page.goto('/tests/browser/import-harness.html?manual');
  await expect(page.getByLabel('Dosis (texto libre, opcional)')).toBeVisible();
  await page.getByLabel('Dosis (texto libre, opcional)').fill('2 comprimidos');
  await page.getByRole('button', { name: 'Guardar cambios de medicación', exact: true }).click();
  await expect(page.getByText('Cambios de medicación guardados correctamente.')).toBeVisible();
  expect(writes.some((write) => write.path === '/rest/v1/patient_medications')).toBe(true);
  expect(writes.some((write) => write.path === '/rest/v1/visit_medication_events')).toBe(true);
  expect(writes.some((write) => write.path.includes('import_visit'))).toBe(false);
});
test('CIMA is opt-in, shows alternatives and never changes the prescribed regimen', async ({ page }) => {
  const posted: Record<string, unknown>[] = [];
  await page.route('https://synthetic.supabase.test/functions/v1/search-cima-medications', async (route) => {
    posted.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'one',
            cima_cn: '123456',
            cima_name: 'ATORVASTATINA 40 mg COMPRIMIDOS',
            pharmaceutical_form: 'comprimidos',
          },
          {
            id: 'two',
            cima_cn: '654321',
            cima_name: 'ATORVASTATINA 20 mg COMPRIMIDOS',
            pharmaceutical_form: 'comprimidos',
          },
        ],
      }),
    });
  });
  await open(page);
  await uploadPdf(page);
  expect(posted).toEqual([]);
  await page.getByText('Catálogo y normalización (selección obligatoria)', { exact: true }).first().click();
  await expect(page.getByLabel('Término farmacológico para consultar').first()).toHaveValue('');
  await page.getByLabel('Término farmacológico para consultar').first().fill('atorvastatina');
  await page.getByLabel('He comprobado que el término solo contiene').first().check();
  await page.getByRole('button', { name: 'Consultar CIMA', exact: true }).first().click();
  await expect(page.getByRole('button', { name: /ATORVASTATINA 20 mg COMPRIMIDOS/ })).toBeVisible();
  await expect(page.getByLabel('Nombre 1', { exact: true })).toHaveValue('Atorvastatina');
  await page.getByRole('button', { name: /ATORVASTATINA 40 mg COMPRIMIDOS/ }).click();
  await expect(page.getByLabel('Dosis prescrita 1', { exact: true })).toHaveValue('1 comprimido');
  await expect(page.getByLabel('Pauta 1', { exact: true })).toHaveValue('cada 24 h');
  expect(posted).toEqual([{ query: 'atorvastatina', limit: 20 }]);
});
test('failed network confirmation can retry with the same idempotency key', async ({ page }) => {
  const operations: string[] = [];
  let attempt = 0;
  await page.route('https://synthetic.supabase.test/rest/v1/rpc/import_visit_medication_document', async (route) => {
    operations.push(route.request().postDataJSON().p_operation_id);
    if (attempt++ === 0) await route.abort('failed');
    else
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']),
      });
  });
  await open(page);
  await uploadPdf(page);
  await selectCatalog(page);
  await page.getByLabel('Incorporar 1', { exact: true }).check();
  await page.getByLabel('Revisado 1', { exact: true }).check();
  await page.getByLabel('Confirmo expresamente la incorporación').check();
  await page.getByRole('button', { name: 'Confirmar e incorporar tratamientos', exact: true }).click();
  await expect(page.getByText(/No se pudo confirmar el resultado/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar e incorporar tratamientos', exact: true }).click();
  await expect(page.locator('output')).toHaveText('Lote guardado');
  expect(operations).toHaveLength(2);
  expect(operations[1]).toBe(operations[0]);
});
test('integrated panel imports new treatments while preserving unsaved manual changes', async ({ page }) => {
  const D = '55555555-5555-4555-8555-555555555555';
  const secondCatalog = {
    ...catalog,
    id: D,
    display_name: 'Metformina 850 mg',
    active_ingredient: 'Metformina',
    strength: '850 mg',
  };
  const imported = {
    ...treatment,
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    medication_catalog_id: D,
    medication_catalog: secondCatalog,
  };
  let persisted = false;
  await page.route('https://synthetic.supabase.test/rest/v1/medication_catalog*', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([secondCatalog]) }),
  );
  await page.route('https://synthetic.supabase.test/rest/v1/patient_medications*', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(persisted ? [treatment, imported] : [treatment]),
    }),
  );
  await page.route('https://synthetic.supabase.test/rest/v1/rpc/import_visit_medication_document', async (route) => {
    persisted = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([imported.id]) });
  });
  await page.goto('/tests/browser/import-harness.html?manual');
  await page.getByLabel('Dosis (texto libre, opcional)').fill('CAMBIO MANUAL SINTETICO');
  await page.getByRole('button', { name: 'Importar medicación desde PDF o imagen', exact: true }).click();
  await page.getByLabel('Documento de tratamiento').setInputFiles({
    name: 'synthetic.pdf',
    mimeType: 'application/pdf',
    buffer: textPdf([['Metformina 850 mg comprimidos; 1 comprimido cada 24 h; oral; activo']]),
  });
  await expect(page.getByLabel('Nombre 1', { exact: true })).toHaveValue('Metformina');
  await page.getByText('Catálogo y normalización (selección obligatoria)', { exact: true }).click();
  await page.getByLabel('Término farmacológico para consultar').fill('metformina');
  await page.getByLabel('He comprobado que el término solo contiene').check();
  await page.getByRole('button', { name: 'Buscar catálogo local', exact: true }).click();
  await page.getByRole('button', { name: 'Seleccionar Metformina 850 mg', exact: true }).click();
  await page.getByLabel('Incorporar 1', { exact: true }).check();
  await page.getByLabel('Revisado 1', { exact: true }).check();
  await page.getByLabel('Confirmo expresamente la incorporación').check();
  await page.getByRole('button', { name: 'Confirmar e incorporar tratamientos', exact: true }).click();
  await expect(
    page.getByText('Tratamientos confirmados incorporados con trazabilidad.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel('Dosis (texto libre, opcional)').first()).toHaveValue('CAMBIO MANUAL SINTETICO');
  await expect(page.getByLabel('Dosis (texto libre, opcional)')).toHaveCount(2);
});

test('confirmation reports missing row requirements beside the button and writes nothing', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST') writes.push(r.url());
  });
  await open(page);
  await uploadPdf(page);
  await page.getByLabel('Incorporar 1', { exact: true }).check();
  await page.getByLabel('Estado 1', { exact: true }).selectOption('unknown');
  await page.getByLabel('Confirmo expresamente la incorporación').check();
  await page.getByRole('button', { name: 'Confirmar e incorporar tratamientos', exact: true }).click();
  const summary = page.getByLabel('Preparación de la incorporación');
  await expect(summary).toContainText('1 tratamientos seleccionados');
  await expect(summary).toContainText('Catálogo y normalización');
  await expect(summary).toContainText('confirma el estado');
  await expect(summary).toContainText('marca la revisión profesional');
  await expect(page.getByRole('alert')).toHaveText(
    'No se ha guardado ningún tratamiento. Completa los puntos indicados antes de confirmar.',
  );
  await expect(page.getByRole('alert')).toBeInViewport();
  expect(writes).toEqual([]);
  // Complete the same row and confirm again: validation must not prevent valid saves.
  await selectCatalog(page);
  await page.getByLabel('Estado 1', { exact: true }).selectOption('active');
  await page.getByLabel('Revisado 1', { exact: true }).check();
  await page.getByLabel('Confirmo expresamente la incorporación').check();
  await page.getByRole('button', { name: 'Confirmar e incorporar tratamientos', exact: true }).click();
  await expect(page.locator('output')).toHaveText('Lote guardado');
  expect(writes).toHaveLength(1);
});
