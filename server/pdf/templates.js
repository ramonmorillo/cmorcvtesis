const SIGNATURE_NAME = 'María Romero Murillo';
const SIGNATURE_ROLE = 'Farmacéutica clínica · Coordinación asistencial IRIS';

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
    return '<li>No disponible.</li>';
  }

  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
}

function renderBaseDocument({ title, subtitle, generatedAtLabel, bodySections, institutionalFooter, audienceLabel }) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      @font-face {
        font-family: 'IRIS Unicode';
        src: local('Noto Sans'), local('Arial Unicode MS'), local('DejaVu Sans');
        font-weight: 100 900;
      }

      @page {
        size: A4;
        margin: 20mm 16mm 24mm 16mm;
      }

      * { box-sizing: border-box; }

      body {
        font-family: 'IRIS Unicode';
        color: #1a2433;
        margin: 0;
        font-size: 12px;
        line-height: 1.58;
        letter-spacing: 0.01em;
        background: #ffffff;
      }

      .sheet {
        min-height: 100vh;
        position: relative;
        padding-bottom: 36mm;
      }

      .report-header {
        border: 1px solid #d5dfec;
        border-top: 4px solid #0a4f66;
        border-radius: 8px;
        padding: 13px 15px 12px;
        margin-bottom: 18px;
        background: linear-gradient(180deg, #f6f9fd 0%, #ffffff 100%);
        box-shadow: 0 0 0 1px #eef3f9 inset;
      }

      .institution {
        color: #0a4f66;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        margin: 0;
      }

      .brand-row {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        align-items: baseline;
        margin: 9px 0 7px;
      }

      h1 {
        margin: 0;
        font-size: 19px;
        line-height: 1.3;
        color: #12283b;
        letter-spacing: 0.01em;
      }

      .audience {
        color: #224a62;
        font-size: 10.5px;
        font-weight: 600;
        border: 1px solid #cfdceb;
        border-radius: 999px;
        padding: 2px 8px;
        background: #f6f9fd;
      }

      .meta {
        margin: 0;
        color: #3b4c61;
        font-size: 10.5px;
      }

      section {
        margin-bottom: 12px;
        page-break-inside: avoid;
      }

      .section-card {
        border: 1px solid #dfe7f2;
        border-radius: 7px;
        padding: 10px 11px;
        background: #ffffff;
        box-shadow: 0 1px 0 #f3f6fa;
      }

      h2 {
        font-size: 12.8px;
        margin: 0 0 7px;
        color: #0c4b61;
        padding-bottom: 4px;
        border-bottom: 1px solid #e8eef6;
      }

      p {
        margin: 0;
      }

      ul {
        margin: 0;
        padding-left: 17px;
      }

      li + li {
        margin-top: 3px;
      }

      .footer {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        border-top: 1px solid #c5d2e2;
        padding: 8px 0 0;
        font-size: 9.3px;
        color: #3f5267;
        background: #fff;
      }

      .footer-grid {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 12px;
        align-items: end;
      }

      .signature {
        text-align: right;
        white-space: nowrap;
        padding-left: 12px;
        border-left: 1px solid #d7e1ed;
      }

      .signature-name {
        font-weight: 700;
      }

      .page-number::before {
        content: 'Página ' counter(page) ' de ' counter(pages);
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main class="sheet">
      <header class="report-header">
        <p class="institution">IRIS · Plataforma clínica de atención farmacéutica cardiovascular</p>
        <div class="brand-row">
          <h1>${escapeHtml(title)}</h1>
          <span class="audience">${escapeHtml(audienceLabel)}</span>
        </div>
        <p class="meta">${escapeHtml(subtitle)}</p>
        <p class="meta">Fecha de generación: ${escapeHtml(generatedAtLabel)}</p>
      </header>

      ${bodySections}
    </main>

    <footer class="footer">
      <div class="footer-grid">
        <div>
          <p>${escapeHtml(institutionalFooter)}</p>
          <p class="page-number"></p>
        </div>
        <div class="signature">
          <p class="signature-name">${SIGNATURE_NAME}</p>
          <p>${SIGNATURE_ROLE}</p>
        </div>
      </div>
    </footer>
  </body>
</html>`;
}

export function renderPatientTemplate(data) {
  return renderBaseDocument({
    title: 'Informe de visita para paciente',
    audienceLabel: 'Versión paciente',
    subtitle: `${data.visitTypeLabel} · ${data.visitDateLabel}`,
    generatedAtLabel: data.generatedAtLabel,
    institutionalFooter: data.institutionalFooter,
    bodySections: `
      <section class="section-card">
        <h2>Resumen de la visita</h2>
        <p>${escapeHtml(data.simpleSummary)}</p>
      </section>
      <section class="section-card">
        <h2>Nivel de prioridad CMO</h2>
        <p>${escapeHtml(data.cmoLevelLabel)}</p>
      </section>
      <section class="section-card">
        <h2>Intervenciones realizadas</h2>
        <ul>${renderList(data.interventions)}</ul>
      </section>
      <section class="section-card">
        <h2>Recomendaciones prácticas</h2>
        <ul>${renderList(data.recommendations)}</ul>
      </section>
      <section class="section-card">
        <h2>Plan de seguimiento</h2>
        <p>${escapeHtml(data.followUp)}</p>
      </section>
    `,
  });
}

export function renderClinicianTemplate(data) {
  return renderBaseDocument({
    title: 'Informe clínico para profesional',
    audienceLabel: 'Versión médica',
    subtitle: `${data.visitTypeLabel} · ${data.visitDateLabel}`,
    generatedAtLabel: data.generatedAtLabel,
    institutionalFooter: data.institutionalFooter,
    bodySections: `
      <section class="section-card">
        <h2>Síntesis clínica estructurada</h2>
        <p>${escapeHtml(data.clinicalSummary)}</p>
      </section>
      <section class="section-card">
        <h2>Puntuación CMO</h2>
        <p>${escapeHtml(data.cmoScoreLabel)}</p>
      </section>
      <section class="section-card">
        <h2>Intervenciones registradas</h2>
        <ul>${renderList(data.interventions)}</ul>
      </section>
      <section class="section-card">
        <h2>Cuestionarios relevantes</h2>
        <ul>${renderList(data.relevantQuestionnaires)}</ul>
      </section>
      <section class="section-card">
        <h2>Recomendaciones de coordinación asistencial</h2>
        <ul>${renderList(data.careCoordinationRecommendations)}</ul>
      </section>
    `,
  });
}
