import express from 'express';
import { generateVisitReportPdf } from './generator.js';

const app = express();
const port = Number(process.env.PDF_SERVER_PORT ?? 4173);

app.use(express.json({ limit: '2mb' }));

app.post('/api/reports/pdf', async (req, res) => {
  const { template, data } = req.body ?? {};

  if (template !== 'patient' && template !== 'clinician') {
    res.status(400).json({ error: 'Template inválido. Debe ser "patient" o "clinician".' });
    return;
  }

  if (!data || typeof data.visitId !== 'string' || data.visitId.trim().length === 0) {
    res.status(400).json({ error: 'Payload inválido: falta visitId.' });
    return;
  }

  try {
    const pdfBuffer = await generateVisitReportPdf({ template, data });
    const fileName = template === 'patient' ? `informe-paciente-${data.visitId}.pdf` : `informe-medico-${data.visitId}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error('[pdf-server] Error generando PDF', error);
    res.status(500).json({ error: 'No se pudo generar el PDF con Playwright.' });
  }
});

app.get('/api/reports/health', (_req, res) => {
  res.json({ ok: true, engine: 'playwright-chromium' });
});

app.listen(port, () => {
  console.log(`[pdf-server] escuchando en http://localhost:${port}`);
});
