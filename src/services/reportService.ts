import { getVisitTypeLabel } from '../constants/enums';
import { THESIS_INSTITUTIONAL_REFERENCE } from '../constants/institutional';
import { getCmoScoreByVisit } from './cmoScoreService';
import { listInterventionsByVisit, type Intervention } from './interventionService';
import { getPatientById } from './patientService';
import { listQuestionnairesByVisit, type QuestionnaireResponseRecord } from './questionnaireService';
import { getVisitById, type Visit } from './visitService';

export type PatientVisitReportData = {
  visitId: string;
  visitTypeLabel: string;
  visitDateLabel: string;
  generatedAtLabel: string;
  simpleSummary: string;
  cmoLevelLabel: string;
  interventions: string[];
  recommendations: string[];
  followUp: string;
  institutionalFooter: string;
};

export type ClinicianVisitReportData = {
  visitId: string;
  visitTypeLabel: string;
  visitDateLabel: string;
  generatedAtLabel: string;
  cmoScoreLabel: string;
  relevantQuestionnaires: string[];
  interventions: string[];
  clinicalSummary: string;
  careCoordinationRecommendations: string[];
  institutionalFooter: string;
};

export type VisitReportLoadResult = {
  patientReportData: PatientVisitReportData | null;
  clinicianReportData: ClinicianVisitReportData | null;
  errorMessage: string | null;
  missingFields: string[];
};

function toDateLabel(value: string | null): string {
  if (!value) return 'No disponible';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-ES');
}

function toDateTimeLabel(value: Date): string {
  return value.toLocaleString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function cmoPriorityLabel(priority: number | null | undefined): string {
  if (priority === 1) return 'Nivel 1 · Prioridad alta';
  if (priority === 2) return 'Nivel 2 · Seguimiento estrecho';
  if (priority === 3) return 'Nivel 3 · Seguimiento rutinario';
  return 'No disponible';
}

function formatQuestionnaireItem(item: QuestionnaireResponseRecord): string {
  const labels: Record<QuestionnaireResponseRecord['questionnaire_type'], string> = {
    iexpac: 'IEXPAC (experiencia del paciente)',
    morisky: 'Morisky-Green (adherencia terapéutica)',
    eq5d: 'EQ-5D-5L (calidad de vida percibida)',
  };
  const score = typeof item.total_score === 'number' ? ` · puntuación: ${item.total_score}` : ' · puntuación no disponible';
  return `${labels[item.questionnaire_type]}${score}`;
}

function formatInterventionItem(item: Intervention): string {
  if (item.outcome?.trim()) return `${item.intervention_type}: ${item.outcome.trim()}`;
  return item.intervention_type;
}

function deriveSimpleSummary(visit: Visit, cmoScore: number | null, interventions: Intervention[], questionnaires: QuestionnaireResponseRecord[]): string {
  const chunks: string[] = [];
  if (cmoScore !== null) chunks.push(`Su nivel de prioridad CMO actual es ${cmoScore}`);
  if (interventions.length > 0) chunks.push(`Durante esta visita se registraron ${interventions.length} intervenciones farmacéuticas`);
  if (questionnaires.length > 0) chunks.push(`Se completaron ${questionnaires.length} cuestionarios de seguimiento`);
  if (visit.notes?.trim()) chunks.push(`Observaciones relevantes del equipo clínico: ${visit.notes.trim()}`);
  return chunks.length > 0
    ? `${chunks.join('. ')}.`
    : 'En esta visita no se registró información clínica suficiente para ampliar el resumen.';
}

function deriveClinicalSummary(visit: Visit, cmoScore: number | null, questionnaires: QuestionnaireResponseRecord[]): string {
  return [
    `Priorización clínica CMO actual: ${cmoScore !== null ? cmoScore : 'No disponible'}.`,
    `Cuestionarios con respuesta registrados en la visita: ${questionnaires.length}.`,
    visit.notes?.trim() ? `Evolución clínica y observaciones relevantes: ${visit.notes.trim()}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function derivePatientRecommendations(interventions: Intervention[]): string[] {
  const items = interventions.map((item) => item.outcome?.trim()).filter((v): v is string => Boolean(v));
  if (items.length > 0) return items.slice(0, 4);
  return [
    'Mantenga la medicación exactamente según la pauta indicada y evite cambios por cuenta propia.',
    'Si aparece algún síntoma nuevo o un efecto adverso, contacte con su centro de salud lo antes posible.',
    'Lleve a la próxima consulta una lista actualizada de toda su medicación, incluidas dosis y horarios.',
  ];
}

function deriveCoordinationRecommendations(cmoPriority: number | null | undefined): string[] {
  if (cmoPriority === 1) {
    return [
      'Caso de alta prioridad: coordinar revisión médica preferente en un plazo máximo de 7 días.',
      'Verificar conciliación terapéutica y riesgo de eventos adversos antes del próximo contacto.',
    ];
  }

  if (cmoPriority === 2) {
    return [
      'Mantener coordinación con atención primaria para ajuste de plan farmacoterapéutico.',
      'Programar reevaluación de adherencia y control clínico en el siguiente contacto asistencial.',
    ];
  }

  if (cmoPriority === 3) {
    return [
      'Continuar circuito asistencial habitual con reevaluación periódica.',
      'Sin alertas de alta prioridad; mantener monitorización en visita programada.',
    ];
  }

  return ['No hay prioridad CMO registrada para emitir recomendaciones de coordinación específicas.'];
}

function getInstitutionalFooter(): string {
  return [
    `IRIS · Proyecto de tesis doctoral: “${THESIS_INSTITUTIONAL_REFERENCE.projectTitle}”.`,
    `Doctoranda: ${THESIS_INSTITUTIONAL_REFERENCE.doctoralCandidate}.`,
    `Universidad: ${THESIS_INSTITUTIONAL_REFERENCE.university}.`,
    `Referencia institucional: ${THESIS_INSTITUTIONAL_REFERENCE.siceiaCode}.`,
  ].join(' ');
}

export async function loadVisitReportData(visitId: string): Promise<VisitReportLoadResult> {
  const visitResult = await getVisitById(visitId);
  if (visitResult.errorMessage || !visitResult.data) {
    return {
      patientReportData: null,
      clinicianReportData: null,
      errorMessage: visitResult.errorMessage ?? 'No se encontró la visita.',
      missingFields: ['visit'],
    };
  }

  const visit = visitResult.data;
  const [patientResult, cmoResult, interventionsResult, questionnairesResult] = await Promise.all([
    getPatientById(visit.patient_id),
    getCmoScoreByVisit(visitId),
    listInterventionsByVisit(visitId),
    listQuestionnairesByVisit(visitId),
  ]);

  const missingFields: string[] = [];
  if (!patientResult.data) missingFields.push('patient');
  if (!visit.visit_date && !visit.scheduled_date) missingFields.push('visit_date');
  if (!cmoResult.data) missingFields.push('cmo_score');
  if ((interventionsResult.data ?? []).length === 0) missingFields.push('interventions');
  if ((questionnairesResult.data ?? []).length === 0) missingFields.push('questionnaires');

  const patient = patientResult.data;
  const interventions = interventionsResult.data ?? [];
  const questionnaires = questionnairesResult.data ?? [];
  const cmoScore = cmoResult.data?.score ?? null;

  const visitTypeLabel = getVisitTypeLabel(visit.visit_type);
  const visitDateLabel = toDateLabel(visit.visit_date ?? visit.scheduled_date);
  const generatedAtLabel = toDateTimeLabel(new Date());
  const cmoLevel = cmoPriorityLabel(cmoResult.data?.priority);
  const patientLabel = patient?.study_code ? `Paciente ${patient.study_code}` : 'Paciente';

  return {
    patientReportData: {
      visitId,
      visitTypeLabel: visitTypeLabel || 'No disponible',
      visitDateLabel,
      generatedAtLabel,
      simpleSummary: `${patientLabel}. ${deriveSimpleSummary(visit, cmoScore, interventions, questionnaires)}`,
      cmoLevelLabel: cmoLevel,
      interventions: interventions.map(formatInterventionItem),
      recommendations: derivePatientRecommendations(interventions),
      followUp:
        'Plan de seguimiento: acudir a la próxima visita programada con su medicación actualizada. Si aparecen dudas, olvida dosis o nota efectos adversos, contacte antes con su equipo de salud para ajustar el plan.',
      institutionalFooter: getInstitutionalFooter(),
    },
    clinicianReportData: {
      visitId,
      visitTypeLabel: visitTypeLabel || 'No disponible',
      visitDateLabel,
      generatedAtLabel,
      cmoScoreLabel: cmoResult.data ? `${cmoResult.data.score} puntos · ${cmoLevel}` : 'No disponible',
      relevantQuestionnaires: questionnaires.map(formatQuestionnaireItem),
      interventions: interventions.map(formatInterventionItem),
      clinicalSummary: deriveClinicalSummary(visit, cmoScore, questionnaires),
      careCoordinationRecommendations: deriveCoordinationRecommendations(cmoResult.data?.priority),
      institutionalFooter: getInstitutionalFooter(),
    },
    errorMessage:
      patientResult.errorMessage ?? cmoResult.errorMessage ?? interventionsResult.errorMessage ?? questionnairesResult.errorMessage ?? null,
    missingFields,
  };
}

type RGB = [number, number, number];

type PdfPage = { commands: string[] };

class ClientPdfDocument {
  private readonly width = 595;
  private readonly height = 842;
  private pages: PdfPage[] = [];

  getAllPages(): PdfPage[] {
    return this.pages;
  }

  addPage(): PdfPage {
    const page = { commands: [] };
    this.pages.push(page);
    return page;
  }

  drawRect(page: PdfPage, x: number, y: number, w: number, h: number, color: RGB): void {
    page.commands.push(`${color[0]} ${color[1]} ${color[2]} rg ${x} ${y} ${w} ${h} re f`);
  }

  drawLine(page: PdfPage, x1: number, y1: number, x2: number, y2: number, width: number, color: RGB): void {
    page.commands.push(`${width} w ${color[0]} ${color[1]} ${color[2]} RG ${x1} ${y1} m ${x2} ${y2} l S`);
  }

  drawText(page: PdfPage, text: string, x: number, y: number, size: number, bold: boolean, color: RGB): void {
    const safe = text
      .normalize('NFC')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
    page.commands.push(`BT ${color[0]} ${color[1]} ${color[2]} rg /F${bold ? 2 : 1} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${safe}) Tj ET`);
  }

  toBytes(): Uint8Array {
    const encoder = new TextEncoder();
    const objects: string[] = [];
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');

    const pageObjectIds: number[] = [];
    const contentObjectIds: number[] = [];
    let nextId = 5;

    this.pages.forEach(() => {
      const pageId = nextId;
      const contentId = nextId + 1;
      pageObjectIds.push(pageId);
      contentObjectIds.push(contentId);
      nextId += 2;
    });

    const kids = pageObjectIds.map((id) => `${id} 0 R`).join(' ');
    objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageObjectIds.length} >>`);
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

    this.pages.forEach((page, index) => {
      const pageId = pageObjectIds[index];
      const contentId = contentObjectIds[index];
      objects[pageId - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.width} ${this.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
      const stream = page.commands.join('\n');
      objects[contentId - 1] = `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`;
    });

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((obj, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
    });

    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    offsets.slice(1).forEach((offset) => {
      pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return encoder.encode(pdf);
  }
}

const LAYOUT = { width: 595, height: 842, marginX: 48, marginBottom: 44 };
const COLORS = {
  navy: [0.05, 0.16, 0.32] as RGB,
  light: [0.94, 0.96, 0.98] as RGB,
  text: [0.1, 0.12, 0.15] as RGB,
  muted: [0.35, 0.39, 0.44] as RGB,
  white: [1, 1, 1] as RGB,
};

type ReportContext = {
  pdf: ClientPdfDocument;
  page: PdfPage;
  cursorY: number;
  title: string;
  subtitle: string;
};

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let line = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${line} ${words[i]}`;
    if (candidate.length <= maxChars) line = candidate;
    else {
      lines.push(line);
      line = words[i];
    }
  }
  lines.push(line);
  return lines;
}

function drawHeader(ctx: ReportContext): void {
  ctx.pdf.drawRect(ctx.page, 0, LAYOUT.height - 112, LAYOUT.width, 112, COLORS.navy);
  ctx.pdf.drawText(ctx.page, 'UNIDAD DE FARMACIA CLÍNICA · INFORME INSTITUCIONAL', LAYOUT.marginX, LAYOUT.height - 38, 10, true, COLORS.white);
  ctx.pdf.drawText(ctx.page, ctx.title, LAYOUT.marginX, LAYOUT.height - 66, 18, true, COLORS.white);
  ctx.pdf.drawText(ctx.page, ctx.subtitle, LAYOUT.marginX, LAYOUT.height - 88, 11, false, [0.9, 0.93, 0.99]);
  ctx.cursorY = LAYOUT.height - 132;
}

function newPage(ctx: ReportContext): void {
  ctx.page = ctx.pdf.addPage();
  drawHeader(ctx);
}

function ensureSpace(ctx: ReportContext, needed: number): void {
  if (ctx.cursorY - needed < LAYOUT.marginBottom + 24) newPage(ctx);
}

function drawSectionTitle(ctx: ReportContext, title: string): void {
  ensureSpace(ctx, 30);
  ctx.pdf.drawRect(ctx.page, LAYOUT.marginX, ctx.cursorY - 10, LAYOUT.width - LAYOUT.marginX * 2, 22, COLORS.light);
  ctx.pdf.drawText(ctx.page, title, LAYOUT.marginX + 10, ctx.cursorY - 3, 11, true, COLORS.text);
  ctx.cursorY -= 28;
}

function drawLabelValue(ctx: ReportContext, label: string, value: string): void {
  ensureSpace(ctx, 22);
  ctx.pdf.drawText(ctx.page, `${label}:`, LAYOUT.marginX, ctx.cursorY, 10.5, true, COLORS.text);
  ctx.pdf.drawText(ctx.page, value, LAYOUT.marginX + 132, ctx.cursorY, 10.5, false, COLORS.text);
  ctx.cursorY -= 18;
}

function drawParagraph(ctx: ReportContext, text: string, bullet?: boolean): void {
  const lines = wrapText(text, bullet ? 88 : 92);
  ensureSpace(ctx, lines.length * 15 + 4);
  lines.forEach((line, i) => {
    if (bullet && i === 0) ctx.pdf.drawText(ctx.page, '•', LAYOUT.marginX, ctx.cursorY, 11, true, COLORS.text);
    ctx.pdf.drawText(ctx.page, line, LAYOUT.marginX + (bullet ? 14 : 0), ctx.cursorY, 10.5, false, COLORS.text);
    ctx.cursorY -= 14;
  });
  ctx.cursorY -= 2;
}

function drawFooter(pdf: ClientPdfDocument, page: PdfPage, footer: string): void {
  pdf.drawLine(page, LAYOUT.marginX, LAYOUT.marginBottom + 22, LAYOUT.width - LAYOUT.marginX, LAYOUT.marginBottom + 22, 1, [0.82, 0.85, 0.9]);
  wrapText(footer, 108).slice(0, 2).forEach((line, i) => {
    pdf.drawText(page, line, LAYOUT.marginX, LAYOUT.marginBottom + 10 - i * 10, 8.5, false, COLORS.muted);
  });
  pdf.drawText(page, 'Firma profesional: María Romero Murillo', LAYOUT.width - LAYOUT.marginX - 220, LAYOUT.marginBottom - 2, 9, true, COLORS.text);
}

function triggerPdfDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildPatientPdf(data: PatientVisitReportData): Uint8Array {
  const pdf = new ClientPdfDocument();
  const ctx: ReportContext = {
    pdf,
    page: pdf.addPage(),
    cursorY: 0,
    title: 'Informe de continuidad asistencial (Paciente)',
    subtitle: 'Documento clínico para seguimiento farmacoterapéutico',
  };
  drawHeader(ctx);

  drawLabelValue(ctx, 'Visita', data.visitTypeLabel);
  drawLabelValue(ctx, 'Fecha de visita', data.visitDateLabel);
  drawLabelValue(ctx, 'Generado el', data.generatedAtLabel);
  drawLabelValue(ctx, 'Nivel CMO', data.cmoLevelLabel);

  drawSectionTitle(ctx, 'Resumen de la visita');
  drawParagraph(ctx, data.simpleSummary);

  drawSectionTitle(ctx, 'Intervenciones farmacéuticas registradas');
  (data.interventions.length > 0 ? data.interventions : ['No se registraron intervenciones específicas en esta visita.']).forEach((item) => drawParagraph(ctx, item, true));

  drawSectionTitle(ctx, 'Recomendaciones para la persona paciente');
  data.recommendations.forEach((item) => drawParagraph(ctx, item, true));

  drawSectionTitle(ctx, 'Plan de seguimiento');
  drawParagraph(ctx, data.followUp);

  pdf.getAllPages().forEach((page) => drawFooter(pdf, page, data.institutionalFooter));
  return pdf.toBytes();
}

function buildClinicianPdf(data: ClinicianVisitReportData): Uint8Array {
  const pdf = new ClientPdfDocument();
  const ctx: ReportContext = {
    pdf,
    page: pdf.addPage(),
    cursorY: 0,
    title: 'Informe médico de soporte CMO-RCV',
    subtitle: 'Versión profesional para decisión clínica y coordinación asistencial',
  };
  drawHeader(ctx);

  drawLabelValue(ctx, 'Visita', data.visitTypeLabel);
  drawLabelValue(ctx, 'Fecha de visita', data.visitDateLabel);
  drawLabelValue(ctx, 'Generado el', data.generatedAtLabel);
  drawLabelValue(ctx, 'Puntuación CMO', data.cmoScoreLabel);

  drawSectionTitle(ctx, 'Síntesis clínica');
  drawParagraph(ctx, data.clinicalSummary);

  drawSectionTitle(ctx, 'Cuestionarios relevantes de la visita');
  (data.relevantQuestionnaires.length > 0 ? data.relevantQuestionnaires : ['Sin cuestionarios disponibles para esta visita.']).forEach((item) =>
    drawParagraph(ctx, item, true),
  );

  drawSectionTitle(ctx, 'Intervenciones registradas');
  (data.interventions.length > 0 ? data.interventions : ['No se registraron intervenciones para esta visita.']).forEach((item) => drawParagraph(ctx, item, true));

  drawSectionTitle(ctx, 'Recomendaciones de coordinación asistencial');
  data.careCoordinationRecommendations.forEach((item) => drawParagraph(ctx, item, true));

  pdf.getAllPages().forEach((page) => drawFooter(pdf, page, data.institutionalFooter));
  return pdf.toBytes();
}

export async function downloadPatientVisitReportPdf(data: PatientVisitReportData): Promise<void> {
  const bytes = buildPatientPdf(data);
  triggerPdfDownload(bytes, `informe-paciente-${data.visitId}.pdf`);
}

export async function downloadClinicianVisitReportPdf(data: ClinicianVisitReportData): Promise<void> {
  const bytes = buildClinicianPdf(data);
  triggerPdfDownload(bytes, `informe-medico-${data.visitId}.pdf`);
}

export function openPrintableHtmlDocument(): never {
  throw new Error('Motor HTML intermedio eliminado. El PDF se genera en cliente y descarga automáticamente.');
}
