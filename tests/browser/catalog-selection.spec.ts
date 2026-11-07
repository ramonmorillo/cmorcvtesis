import { test, expect, type Page } from '@playwright/test';
import { textPdf } from './fixtures';
const C = '44444444-4444-4444-8444-444444444444';
const name =
  'OMEPRAZOL CINFA 20 mg CAPSULAS DURAS GASTRORRESISTENTES EFG PRESENTACION SINTETICA PARA COMPROBAR QUE LOS NOMBRES LARGOS SE AJUSTAN A LA COLUMNA';
const item = {
  id: C,
  source: 'external_cima',
  source_code: '321999',
  display_name: name,
  active_ingredient: 'Omeprazol',
  strength: '20 mg',
  form: 'capsulas',
  route: 'oral',
  atc_code: null,
  created_at: '2031-01-01',
  updated_at: '2031-01-01',
};
async function upload(page: Page) {
  await page.goto('/tests/browser/import-harness.html');
  await page.getByRole('button', { name: 'Importar medicación desde PDF o imagen', exact: true }).click();
  await page.getByLabel('Documento de tratamiento').setInputFiles({
    name: 'synthetic.pdf',
    mimeType: 'application/pdf',
    buffer: textPdf([['Omeprazol 20 mg capsulas; 1 capsula cada 24 h; oral; activo']]),
  });
  await expect(page.getByLabel('Nombre 1', { exact: true })).toHaveValue('Omeprazol');
}
async function cima(page: Page) {
  await page.getByText('Buscar en catálogo local o CIMA (opcional)', { exact: true }).click();
  await page.getByLabel('Término farmacológico para consultar').fill('omeprazol');
  await page.getByLabel('He comprobado que el término solo contiene').check();
  await page.getByRole('button', { name: 'Consultar CIMA', exact: true }).click();
}
async function confirm(page: Page) {
  await page.getByLabel('Incorporar 1', { exact: true }).check();
  await page.getByLabel('Revisado 1', { exact: true }).check();
  await page.getByLabel('Confirmo expresamente la incorporación').check();
  await page.getByRole('button', { name: 'Confirmar e incorporar tratamientos', exact: true }).click();
}
function backend(page: Page, posts: { path: string; body: Record<string, unknown> }[]) {
  page.on('request', (r) => {
    if (r.method() === 'POST') posts.push({ path: new URL(r.url()).pathname, body: r.postDataJSON() });
  });
  return page.route('https://synthetic.supabase.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/functions/v1/search-cima-medications')
      ? {
          items: [
            {
              id: 'synthetic',
              cima_cn: '321999',
              cima_name: name,
              pharmaceutical_form: 'capsulas',
              raw_payload: { principiosActivos: [{ nombre: 'Omeprazol' }] },
            },
          ],
        }
      : path.endsWith('/rpc/import_visit_medication_document')
        ? ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']
        : path.endsWith('/medication_catalog') && route.request().method() === 'POST'
          ? { ...item, ...route.request().postDataJSON() }
          : path.endsWith('/medication_catalog')
            ? []
            : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}
test('CIMA selection remains selected and saves through catalogue resolution only after final confirmation', async ({
  page,
}) => {
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  await backend(page, posts);
  await upload(page);
  await cima(page);
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page.locator('.medication-import-selection')).toHaveText(`Seleccionado: ${name}.`);
  await expect(page.getByLabel('Dosis prescrita 1', { exact: true })).toHaveValue('1 capsula');
  await expect(page.getByLabel('Pauta 1', { exact: true })).toHaveValue('cada 24 h');
  expect(posts.filter((post) => post.path.includes('/rest/'))).toEqual([]);
  await confirm(page);
  await expect(page.locator('output')).toHaveText('Lote guardado');
  expect(posts.filter((post) => post.path.endsWith('/medication_catalog'))).toHaveLength(1);
  const catalog = posts.find((post) => post.path.endsWith('/medication_catalog'))!;
  expect(catalog.body).toMatchObject({ source: 'external_cima', source_code: '321999', display_name: name });
  expect(JSON.stringify(catalog.body)).not.toContain('cada 24 h');
  expect(posts.find((post) => post.path.endsWith('/rpc/import_visit_medication_document'))?.body.p_rows).toEqual([
    { medication_catalog_id: C, dose_text: '1 capsula', frequency_text: 'cada 24 h', route_text: 'oral' },
  ]);
  expect(posts.some((post) => post.path.endsWith('/patient_medications'))).toBe(false);
});
test('manual reviewed name can be saved without consulting CIMA', async ({ page }) => {
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  await backend(page, posts);
  await upload(page);
  await page.getByRole('button', { name: 'Usar nombre revisado sin CIMA', exact: true }).click();
  expect(posts).toEqual([]);
  await expect(page.locator('.medication-import-selection')).toContainText('Omeprazol 20 mg capsulas');
  await confirm(page);
  await expect(page.locator('output')).toHaveText('Lote guardado');
  expect(posts.some((post) => post.path.includes('/functions/'))).toBe(false);
  expect(posts.find((post) => post.path.endsWith('/medication_catalog'))?.body).toMatchObject({
    source: 'manual',
    display_name: 'Omeprazol 20 mg capsulas',
    strength: '20 mg',
  });
});
test('cancelling a selected CIMA presentation creates neither catalogue nor clinical records', async ({ page }) => {
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  await backend(page, posts);
  await upload(page);
  await cima(page);
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await page.getByRole('button', { name: 'Cancelar y cerrar', exact: true }).click();
  expect(posts.filter((post) => post.path.includes('/rest/'))).toEqual([]);
});
test('catalogue permission errors are visible and do not send a clinical batch', async ({ page }) => {
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  await backend(page, posts);
  await page.route('https://synthetic.supabase.test/rest/v1/medication_catalog*', async (route) => {
    if (route.request().method() === 'POST')
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ code: '42501', message: 'synthetic RLS rejection' }),
      });
    else await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await upload(page);
  await page.getByRole('button', { name: 'Usar nombre revisado sin CIMA', exact: true }).click();
  await confirm(page);
  await expect(page.getByRole('alert')).toContainText('no se pudo preparar su catálogo');
  expect(posts.some((post) => post.path.includes('/rpc/'))).toBe(false);
});
for (const width of [1440, 1024, 390])
  test(`long CIMA choices never hide dose, state or review at viewport ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const posts: { path: string; body: Record<string, unknown> }[] = [];
    await backend(page, posts);
    await upload(page);
    await page.addStyleTag({ content: '#root { max-width:1100px; margin:auto; padding:12px; }' });
    await cima(page);
    for (const phase of ['results', 'selected']) {
      if (phase === 'selected') await page.getByRole('button', { name: new RegExp(name) }).click();
      if (width === 1440 && phase === 'selected')
        await page.screenshot({ path: testInfo.outputPath('catalog-selected.png'), fullPage: true });
      const dimensions = await page.evaluate(() => ({
        viewport: innerWidth,
        body: document.documentElement.scrollWidth,
        table: document.querySelector('.medication-import-table')!.scrollWidth,
        container: document.querySelector('.medication-import-table')!.clientWidth,
      }));
      expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
      expect(dimensions.table).toBeLessThanOrEqual(dimensions.container + 1);
      for (const control of [
        page.getByLabel('Dosis prescrita 1', { exact: true }),
        page.getByLabel('Estado 1', { exact: true }),
        page.getByLabel('Revisado 1', { exact: true }),
      ]) {
        const box = await control.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      }
    }
  });

test('retrying a confirmed CIMA lot reuses its resolved catalogue and operation key', async ({ page }) => {
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  await backend(page, posts);
  let attempt = 0;
  await page.route('https://synthetic.supabase.test/rest/v1/rpc/import_visit_medication_document', async (route) => {
    if (attempt++ === 0) await route.abort('failed');
    else
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']),
      });
  });
  await upload(page);
  await cima(page);
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await confirm(page);
  await expect(page.getByRole('alert')).toContainText('No se pudo confirmar el resultado');
  await page.getByRole('button', { name: 'Confirmar e incorporar tratamientos', exact: true }).click();
  await expect(page.locator('output')).toHaveText('Lote guardado');
  expect(posts.filter((post) => post.path.endsWith('/medication_catalog'))).toHaveLength(1);
  const calls = posts.filter((post) => post.path.includes('/rpc/'));
  expect(calls).toHaveLength(2);
  expect(calls[0].body).toEqual(calls[1].body);
});

test('a narrow application panel uses cards even on a wide desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  await backend(page, posts);
  await upload(page);
  await page.addStyleTag({ content: '#root { max-width:760px; margin:auto; padding:12px; }' });
  await cima(page);
  await page.getByRole('button', { name: new RegExp(name) }).click();
  const box = await page.getByLabel('Estado 1', { exact: true }).boundingBox();
  expect(box).not.toBeNull();
  const dimensions = await page
    .locator('.medication-import-table')
    .evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
  await expect(page.locator('.medication-import tbody > tr')).toHaveCSS('display', 'grid');
});
