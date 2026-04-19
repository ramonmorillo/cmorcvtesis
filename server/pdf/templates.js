const SIGNATURE_NAME = 'María Romero Murillo';
const SIGNATURE_ROLE = 'Farmacéutica responsable de la visita';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderList(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<li>No disponible</li>';
  }

  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
}

function renderBaseDocument({ title, subtitle, generatedAtLabel, bodySections, institutionalFooter }) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page {
        size: A4;
        margin: 22mm 18mm 22mm 18mm;
      }
      * { box-sizing: border-box; }
      body {
        font-family: "Noto Sans", "Segoe UI", Arial, sans-serif;
        color: #142033;
        margin: 0;
        font-size: 12.5px;
        line-height: 1.5;
      }
      .report-header {
        border-bottom: 2px solid #0e5e78;
        margin-bottom: 18px;
        padding-bottom: 12px;
      }
      .institution {
        color: #0e5e78;
        font-size: 12px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        margin: 0 0 6px;
      }
      h1 {
        margin: 0;
        font-size: 21px;
      }
      .meta {
        margin-top: 8px;
        color: #334155;
      }
      section {
        margin-bottom: 14px;
        page-break-inside: avoid;
      }
      h2 {
        font-size: 14px;
        margin: 0 0 6px;
        color: #0b4d63;
      }
      ul {
        margin: 0;
        padding-left: 20px;
      }
      .signature-block {
        margin-top: 28px;
        page-break-inside: avoid;
      }
      .signature-line {
        border-top: 1px solid #334155;
        margin-top: 24px;
        width: 320px;
      }
      .signature-name {
        margin: 6px 0 2px;
        font-weight: 700;
      }
      .footer {
        border-top: 1px solid #cbd5e1;
        margin-top: 18px;
        padding-top: 8px;
        font-size: 10px;
        color: #475569;
      }
      .unicode-proof {
        color: #0f172a;
        font-size: 11px;
      }
    </style>
  </head>
  <body>
    <header class="report-header">
      <p class="institution">IRIS · Plataforma clínica de atención farmacéutica cardiovascular</p>
      <p class="meta"><strong>Branding:</strong> IRIS</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="meta">${escapeHtml(subtitle)} · Generado: ${escapeHtml(generatedAtLabel)}</p>
      <p class="unicode-proof">Unicode validado: á é í ó ú ñ Ñ ü ¿ ¡</p>
    </header>
    ${bodySections}
    <section class="signature-block">
      <div class="signature-line"></div>
      <p class="signature-name">${SIGNATURE_NAME}</p>
      <p>${SIGNATURE_ROLE}</p>
    </section>
    <footer class="footer">${escapeHtml(institutionalFooter)}</footer>
  </body>
</html>`;
}

export function renderPatientTemplate(data) {
  return renderBaseDocument({
    title: 'Informe de visita para paciente',
    subtitle: `${data.visitTypeLabel} · ${data.visitDateLabel}`,
    generatedAtLabel: data.generatedAtLabel,
    institutionalFooter: data.institutionalFooter,
    bodySections: `
      <section>
        <h2>Resumen para paciente</h2>
        <p>${escapeHtml(data.simpleSummary)}</p>
      </section>
      <section>
        <h2>Nivel de prioridad CMO</h2>
        <p>${escapeHtml(data.cmoLevelLabel)}</p>
      </section>
      <section>
        <h2>Intervenciones realizadas</h2>
        <ul>${renderList(data.interventions)}</ul>
      </section>
      <section>
        <h2>Recomendaciones prácticas</h2>
        <ul>${renderList(data.recommendations)}</ul>
      </section>
      <section>
        <h2>Plan de seguimiento</h2>
        <p>${escapeHtml(data.followUp)}</p>
      </section>
    `,
  });
}

export function renderClinicianTemplate(data) {
  return renderBaseDocument({
    title: 'Informe clínico para profesional',
    subtitle: `${data.visitTypeLabel} · ${data.visitDateLabel}`,
    generatedAtLabel: data.generatedAtLabel,
    institutionalFooter: data.institutionalFooter,
    bodySections: `
      <section>
        <h2>Resumen clínico estructurado</h2>
        <p>${escapeHtml(data.clinicalSummary)}</p>
      </section>
      <section>
        <h2>Puntuación CMO</h2>
        <p>${escapeHtml(data.cmoScoreLabel)}</p>
      </section>
      <section>
        <h2>Intervenciones registradas</h2>
        <ul>${renderList(data.interventions)}</ul>
      </section>
      <section>
        <h2>Cuestionarios relevantes</h2>
        <ul>${renderList(data.relevantQuestionnaires)}</ul>
      </section>
      <section>
        <h2>Recomendaciones de coordinación asistencial</h2>
        <ul>${renderList(data.careCoordinationRecommendations)}</ul>
      </section>
    `,
  });
}
