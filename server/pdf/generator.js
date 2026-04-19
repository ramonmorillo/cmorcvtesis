import { chromium } from 'playwright';
import { renderClinicianTemplate, renderPatientTemplate } from './templates.js';

function templateToHtml(template, data) {
  if (template === 'patient') return renderPatientTemplate(data);
  if (template === 'clinician') return renderClinicianTemplate(data);
  throw new Error('Template de informe no soportado.');
}

export async function generateVisitReportPdf({ template, data }) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const html = templateToHtml(template, data);
    await page.setContent(html, { waitUntil: 'networkidle' });

    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '22mm', right: '18mm', bottom: '22mm', left: '18mm' },
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }
}
