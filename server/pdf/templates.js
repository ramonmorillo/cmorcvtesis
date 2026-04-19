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

function renderSection({ title, content }) {
  return `
    <section class="section-card">
      <h2>${escapeHtml(title)}</h2>
      ${content}
    </section>
  `;
}

function renderSummaryBox({ title, items }) {
  return `
    <section class="summary-box" aria-label="${escapeHtml(title)}">
      <p class="summary-title">${escapeHtml(title)}</p>
      <dl class="summary-grid">
        ${items
          .map(
            ({ label, value }) => `
              <div class="summary-item">
                <dt>${escapeHtml(label)}</dt>
                <dd>${escapeHtml(value)}</dd>
              </div>
            `,
          )
          .join('')}
      </dl>
    </section>
  `;
}

function renderHeader({ audienceLabel, reportSubtitle, visitId, visitTypeLabel, visitDateLabel, generatedAtLabel }) {
  return `
    <header class="report-header">
      <p class="brand">IRIS</p>
      <div class="title-row">
        <h1>${escapeHtml(reportSubtitle)}</h1>
        <span class="audience">${escapeHtml(audienceLabel)}</span>
      </div>
      <hr class="header-separator" />
      <dl class="meta-grid">
        <div class="meta-item">
          <dt>ID de visita</dt>
          <dd>${escapeHtml(visitId)}</dd>
        </div>
        <div class="meta-item">
          <dt>Tipo de visita</dt>
          <dd>${escapeHtml(visitTypeLabel)}</dd>
        </div>
        <div class="meta-item">
          <dt>Fecha de visita</dt>
          <dd>${escapeHtml(visitDateLabel)}</dd>
        </div>
        <div class="meta-item">
          <dt>Fecha de generación</dt>
          <dd>${escapeHtml(generatedAtLabel)}</dd>
        </div>
      </dl>
    </header>
  `;
}

function renderSignatureSection() {
  return renderSection({
    title: 'Firma profesional',
    content: `
      <div class="signature-block">
        <p class="signature-name">${escapeHtml(SIGNATURE_NAME)}</p>
        <p class="signature-role">${escapeHtml(SIGNATURE_ROLE)}</p>
      </div>
    `,
  });
}

function renderFooter({ institutionalFooter }) {
  return `
    <footer class="footer">
      <div class="footer-grid">
        <p class="footer-ref">${escapeHtml(institutionalFooter)}</p>
        <p class="page-number"></p>
      </div>
    </footer>
  `;
}

function renderBaseDocument({ header, summaryBox, bodySections, institutionalFooter }) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>IRIS</title>
    <style>
      @font-face {
        font-family: 'IRIS Unicode';
        src: local('Noto Sans'), local('Arial Unicode MS'), local('DejaVu Sans');
        font-weight: 100 900;
      }

      @page {
        size: A4;
        margin: 18mm 15mm 24mm 15mm;
      }

      * { box-sizing: border-box; }

      body {
        font-family: 'IRIS Unicode';
        color: #1f2b3a;
        margin: 0;
        font-size: 11.4px;
        line-height: 1.64;
        background: #ffffff;
      }

      .sheet {
        min-height: 100vh;
        position: relative;
        padding-bottom: 26mm;
      }

      .report-header {
        margin-bottom: 14px;
      }

      .brand {
        margin: 0;
        font-size: 20px;
        line-height: 1;
        font-weight: 700;
        letter-spacing: 0.09em;
        color: #15364a;
      }

      .title-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 8px;
        margin-top: 5px;
      }

      h1 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: #1b3042;
      }

      .audience {
        color: #41566b;
        font-size: 10px;
        font-weight: 600;
        border: 1px solid #d4dee8;
        border-radius: 999px;
        padding: 1px 8px;
        background: #f7f9fc;
      }

      .header-separator {
        border: 0;
        border-top: 1px solid #cdd8e4;
        margin: 8px 0 9px;
      }

      .meta-grid {
        margin: 0;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px 16px;
      }

      .meta-item dt {
        font-size: 9.5px;
        color: #627488;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin: 0 0 1px;
      }

      .meta-item dd {
        margin: 0;
        font-size: 11px;
        color: #1f2b3a;
      }

      .summary-box {
        border: 1px solid #d8e1ea;
        background: #f8fafc;
        border-radius: 6px;
        padding: 9px 10px 8px;
        margin-bottom: 12px;
        page-break-inside: avoid;
      }

      .summary-title {
        margin: 0 0 6px;
        font-size: 11.1px;
        font-weight: 700;
        color: #21384d;
      }

      .summary-grid {
        margin: 0;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }

      .summary-item dt {
        margin: 0;
        font-size: 9.2px;
        color: #5e7185;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }

      .summary-item dd {
        margin: 1px 0 0;
        font-size: 11px;
        font-weight: 600;
        color: #203446;
      }

      section {
        margin-bottom: 10px;
        page-break-inside: avoid;
      }

      .section-card {
        border: 1px solid #e0e7ef;
        border-radius: 6px;
        padding: 8px 10px 9px;
        background: #fff;
      }

      h2 {
        margin: 0 0 6px;
        font-size: 11.8px;
        color: #17364a;
        font-weight: 700;
      }

      p {
        margin: 0;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }

      ul {
        margin: 0;
        padding-left: 16px;
      }

      li {
        margin: 0;
      }

      li + li {
        margin-top: 4px;
      }

      .signature-block {
        display: inline-block;
        border-top: 1px solid #ccd7e2;
        padding-top: 8px;
        min-width: 58%;
      }

      .signature-name {
        font-weight: 700;
        margin-bottom: 1px;
      }

      .signature-role {
        color: #4d6074;
      }

      .footer {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        border-top: 1px solid #d6dee8;
        padding-top: 6px;
        background: #fff;
      }

      .footer-grid {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 10px;
      }

      .footer-ref {
        margin: 0;
        font-size: 8.8px;
        color: #51657a;
      }

      .page-number {
        margin: 0;
        font-size: 8.8px;
        color: #51657a;
        white-space: nowrap;
      }

      .page-number::before {
        content: 'Pág. ' counter(page) '/' counter(pages);
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <main class="sheet">
      ${header}
      ${summaryBox}
      ${bodySections}
    </main>
    ${renderFooter({ institutionalFooter })}
  </body>
</html>`;
}

export function renderPatientTemplate(data) {
  const header = renderHeader({
    audienceLabel: 'Versión paciente',
    reportSubtitle: 'Informe de visita (Paciente)',
    visitId: data.visitId,
    visitTypeLabel: data.visitTypeLabel,
    visitDateLabel: data.visitDateLabel,
    generatedAtLabel: data.generatedAtLabel,
  });

  const summaryBox = renderSummaryBox({
    title: 'Resumen superior de seguimiento',
    items: [
      { label: 'Nivel CMO', value: data.cmoLevelLabel },
      { label: 'Estado de seguimiento', value: data.followUp },
      { label: 'Tipo de visita', value: data.visitTypeLabel },
    ],
  });

  const bodySections = [
    renderSection({ title: 'Resumen de la visita', content: `<p>${escapeHtml(data.simpleSummary)}</p>` }),
    renderSection({ title: 'Intervenciones registradas', content: `<ul>${renderList(data.interventions)}</ul>` }),
    renderSection({ title: 'Recomendaciones', content: `<ul>${renderList(data.recommendations)}</ul>` }),
    renderSection({ title: 'Seguimiento', content: `<p>${escapeHtml(data.followUp)}</p>` }),
    renderSignatureSection(),
  ].join('');

  return renderBaseDocument({
    header,
    summaryBox,
    bodySections,
    institutionalFooter: data.institutionalFooter,
  });
}

export function renderClinicianTemplate(data) {
  const header = renderHeader({
    audienceLabel: 'Versión médica',
    reportSubtitle: 'Informe de visita (Médico)',
    visitId: data.visitId,
    visitTypeLabel: data.visitTypeLabel,
    visitDateLabel: data.visitDateLabel,
    generatedAtLabel: data.generatedAtLabel,
  });

  const summaryBox = renderSummaryBox({
    title: 'Resumen superior de seguimiento',
    items: [
      { label: 'Puntuación CMO', value: data.cmoScoreLabel },
      { label: 'Tipo de seguimiento', value: data.visitTypeLabel },
      {
        label: 'Estado de seguimiento',
        value: data.careCoordinationRecommendations?.[0] ?? 'No disponible',
      },
    ],
  });

  const bodySections = [
    renderSection({ title: 'Resumen clínico', content: `<p>${escapeHtml(data.clinicalSummary)}</p>` }),
    renderSection({ title: 'Cuestionarios relevantes', content: `<ul>${renderList(data.relevantQuestionnaires)}</ul>` }),
    renderSection({ title: 'Intervenciones registradas', content: `<ul>${renderList(data.interventions)}</ul>` }),
    renderSection({
      title: 'Recomendaciones',
      content: `<ul>${renderList(data.careCoordinationRecommendations)}</ul>`,
    }),
    renderSection({
      title: 'Seguimiento',
      content: `<p>${escapeHtml(data.careCoordinationRecommendations?.[0] ?? 'No disponible.')}</p>`,
    }),
    renderSignatureSection(),
  ].join('');

  return renderBaseDocument({
    header,
    summaryBox,
    bodySections,
    institutionalFooter: data.institutionalFooter,
  });
}
