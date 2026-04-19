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
        margin: 22mm 17mm 24mm 17mm;
      }

      * { box-sizing: border-box; }

      body {
        font-family: 'IRIS Unicode';
        color: #172033;
        margin: 0;
        font-size: 12px;
        line-height: 1.55;
        letter-spacing: 0.01em;
      }

      .sheet {
        min-height: 100vh;
        position: relative;
        padding-bottom: 34mm;
      }

      .report-header {
        border: 1px solid #d8e2ef;
        border-top: 5px solid #0e5e78;
        border-radius: 10px;
        padding: 14px 16px;
        margin-bottom: 16px;
        background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
      }

      .institution {
        color: #0e5e78;
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin: 0;
      }

      .brand-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: baseline;
        margin: 8px 0 6px;
      }

      h1 {
        margin: 0;
        font-size: 20px;
        line-height: 1.25;
      }

      .audience {
        color: #28516a;
        font-size: 11px;
        font-weight: 600;
      }

      .meta {
        margin: 0;
        color: #3f4f63;
        font-size: 11px;
      }

      section {
        margin-bottom: 13px;
        page-break-inside: avoid;
      }

      .section-card {
        border: 1px solid #e4ebf4;
        border-radius: 8px;
        padding: 10px 12px;
        background: #ffffff;
      }

      h2 {
        font-size: 13px;
        margin: 0 0 6px;
        color: #0b4d63;
      }

      p {
        margin: 0;
      }

      ul {
        margin: 0;
        padding-left: 18px;
      }

      li + li {
        margin-top: 4px;
      }

      .footer {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        border-top: 1px solid #cbd5e1;
        padding: 7px 0 0;
        font-size: 9.5px;
        color: #425569;
        background: #fff;
      }

      .footer-grid {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        align-items: end;
      }

      .signature {
        text-align: right;
        white-space: nowrap;
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
