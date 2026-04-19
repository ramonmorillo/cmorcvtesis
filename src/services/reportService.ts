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

type PdfLine = {
  text: string;
  size: number;
  font: 'normal' | 'bold';
  indent?: number;
  spacingAfter?: number;
};

const PDF_PAGE_WIDTH = 595.28;
const PDF_PAGE_HEIGHT = 841.89;
const PDF_MARGIN_TOP = 56;
const PDF_MARGIN_BOTTOM = 56;
const PDF_MARGIN_LEFT = 56;
const PDF_MARGIN_RIGHT = 56;
const PDF_BODY_COLOR = '0.07 0.11 0.19 rg';
const PDF_MUTED_COLOR = '0.30 0.35 0.42 rg';
const PDF_HEADER_COLOR = '0.02 0.24 0.55 rg';
const PDF_LINE_HEIGHT = 1.35;

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
  if (priority === 1) return 'Nivel 1 · Prioridad';
  if (priority === 2) return 'Nivel 2 · Intermedio';
  if (priority === 3) return 'Nivel 3 · Basal';
  return 'No disponible';
}

function formatQuestionnaireItem(item: QuestionnaireResponseRecord): string {
  const score = typeof item.total_score === 'number' ? ` · score ${item.total_score}` : '';
  return `${item.questionnaire_type.toUpperCase()}${score}`;
}

function formatInterventionItem(item: Intervention): string {
  if (item.outcome?.trim()) return `${item.intervention_type} (${item.outcome.trim()})`;
  return item.intervention_type;
}

function deriveSimpleSummary(visit: Visit, cmoScore: number | null, interventions: Intervention[], questionnaires: QuestionnaireResponseRecord[]): string {
  const chunks: string[] = [];

  if (cmoScore !== null) chunks.push(`Nivel CMO registrado (${cmoScore} puntos)`);
  if (interventions.length > 0) chunks.push(`${interventions.length} intervención(es) realizada(s)`);
  if (questionnaires.length > 0) chunks.push(`${questionnaires.length} cuestionario(s) completado(s)`);
  if (visit.notes?.trim()) chunks.push(`Observaciones: ${visit.notes.trim()}`);

  if (chunks.length > 0) return `${chunks.join('. ')}.`;
  return 'No disponible: la visita aún no tiene datos estructurados suficientes para un resumen detallado.';
}

function deriveClinicalSummary(visit: Visit, cmoScore: number | null, questionnaires: QuestionnaireResponseRecord[]): string {
  const pieces: string[] = [];
  pieces.push(`Puntuación CMO: ${cmoScore !== null ? cmoScore : 'No disponible'}.`);
  pieces.push(`Cuestionarios registrados: ${questionnaires.length}.`);

  if (visit.notes?.trim()) {
    pieces.push(`Observaciones clínicas: ${visit.notes.trim()}.`);
  }

  return pieces.join(' ');
}

function derivePatientRecommendations(interventions: Intervention[]): string[] {
  const specificRecommendations = interventions
    .map((item) => item.outcome?.trim())
    .filter((value): value is string => Boolean(value));

  if (specificRecommendations.length > 0) {
    return specificRecommendations.slice(0, 4).map((text) => `• ${text}`);
  }

  return [
    'Mantenga la medicación tal y como se le ha indicado y consulte si aparece cualquier efecto no esperado.',
  ];
}

function deriveCoordinationRecommendations(cmoPriority: number | null | undefined): string[] {
  if (cmoPriority === 1) {
    return [
      'Inferida por prioridad CMO: coordinar revisión clínica prioritaria con medicina de familia/especialista en ≤ 7 días.',
    ];
  }

  if (cmoPriority === 2) {
    return [
      'Inferida por prioridad CMO: compartir evolución clínica y ajustar seguimiento con atención primaria.',
    ];
  }

  if (cmoPriority === 3) {
    return [
      'Inferida por prioridad CMO: mantener coordinación habitual y reevaluar en la próxima visita programada.',
    ];
  }

  return ['No disponible: no existe prioridad CMO registrada para inferir coordinación.'];
}

function getInstitutionalFooter(): string {
  return [
    `Proyecto vinculado a la tesis doctoral “${THESIS_INSTITUTIONAL_REFERENCE.projectTitle}”.`,
    `Doctoranda: ${THESIS_INSTITUTIONAL_REFERENCE.doctoralCandidate}.`,
    `Directores: ${THESIS_INSTITUTIONAL_REFERENCE.thesisDirectors}.`,
    `${THESIS_INSTITUTIONAL_REFERENCE.university}.`,
    `${THESIS_INSTITUTIONAL_REFERENCE.siceiaCode}.`,
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
        'Se recomienda revisión en la próxima visita programada y contacto previo si aparecen dudas, síntomas nuevos o problemas con la medicación.',
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
      patientResult.errorMessage ??
      cmoResult.errorMessage ??
      interventionsResult.errorMessage ??
      questionnairesResult.errorMessage ??
      null,
    missingFields,
  };
}

function textOrNotAvailable(value: string): string {
  const trimmed = value.trim();
  return trimmed ? trimmed : 'No disponible';
}

function normalizeList(items: string[]): string[] {
  const normalized = items.map((item) => textOrNotAvailable(item));
  return normalized.length > 0 ? normalized : ['No disponible'];
}

function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['No disponible'];

  const lines: string[] = [];
  let currentLine = '';
  const averageCharWidth = fontSize * 0.52;

  words.forEach((word) => {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length * averageCharWidth <= maxWidth) {
      currentLine = candidate;
      return;
    }

    if (currentLine) lines.push(currentLine);
    currentLine = word;
  });

  if (currentLine) lines.push(currentLine);
  return lines;
}

function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function pushSection(lines: PdfLine[], title: string, body: string | string[], options?: { bullet?: boolean }) {
  lines.push({ text: title, size: 12, font: 'bold', spacingAfter: 4 });

  const values = Array.isArray(body) ? normalizeList(body) : [textOrNotAvailable(body)];
  values.forEach((value, index) => {
    const bulletPrefix = options?.bullet ? '• ' : '';
    lines.push({ text: `${bulletPrefix}${value}`, size: 10.5, font: 'normal', indent: options?.bullet ? 8 : 0, spacingAfter: 2 });
    if (index === values.length - 1) {
      lines.push({ text: '', size: 5, font: 'normal', spacingAfter: 6 });
    }
  });
}

function buildPatientReportLines(data: PatientVisitReportData): PdfLine[] {
  const lines: PdfLine[] = [
    { text: 'INFORME DE VISITA PARA PACIENTE', size: 18, font: 'bold', spacingAfter: 6 },
    {
      text: `${textOrNotAvailable(data.visitTypeLabel)} · Fecha visita: ${textOrNotAvailable(data.visitDateLabel)}`,
      size: 10,
      font: 'normal',
      spacingAfter: 2,
    },
    { text: `Fecha/hora de generación: ${textOrNotAvailable(data.generatedAtLabel)}`, size: 10, font: 'normal', spacingAfter: 10 },
  ];

  pushSection(lines, 'Resumen de la visita', data.simpleSummary);
  pushSection(lines, 'Nivel CMO', data.cmoLevelLabel);
  pushSection(lines, 'Intervenciones', data.interventions, { bullet: true });
  pushSection(lines, 'Recomendaciones para el paciente', data.recommendations, { bullet: true });
  pushSection(lines, 'Seguimiento recomendado', data.followUp);
  pushSection(lines, 'Referencia institucional', data.institutionalFooter);

  return lines;
}

function buildClinicianReportLines(data: ClinicianVisitReportData): PdfLine[] {
  const lines: PdfLine[] = [
    { text: 'INFORME DE VISITA PARA PROFESIONAL MÉDICO', size: 18, font: 'bold', spacingAfter: 6 },
    {
      text: `${textOrNotAvailable(data.visitTypeLabel)} · Fecha visita: ${textOrNotAvailable(data.visitDateLabel)}`,
      size: 10,
      font: 'normal',
      spacingAfter: 2,
    },
    { text: `Fecha/hora de generación: ${textOrNotAvailable(data.generatedAtLabel)}`, size: 10, font: 'normal', spacingAfter: 10 },
  ];

  pushSection(lines, 'Resumen clínico', data.clinicalSummary);
  pushSection(lines, 'Puntuación / nivel CMO', data.cmoScoreLabel);
  pushSection(lines, 'Intervenciones realizadas', data.interventions, { bullet: true });
  pushSection(lines, 'Cuestionarios relevantes', data.relevantQuestionnaires, { bullet: true });
  pushSection(lines, 'Recomendaciones de coordinación asistencial', data.careCoordinationRecommendations, { bullet: true });
  pushSection(lines, 'Referencia institucional', data.institutionalFooter);

  return lines;
}

function createPdfPages(lines: PdfLine[]): string[] {
  const pages: string[] = [];
  let y = PDF_PAGE_HEIGHT - PDF_MARGIN_TOP;
  let currentCommands: string[] = [`${PDF_HEADER_COLOR}`];

  const availableWidth = PDF_PAGE_WIDTH - PDF_MARGIN_LEFT - PDF_MARGIN_RIGHT;

  lines.forEach((line) => {
    const lineIndent = line.indent ?? 0;
    const wrapped = line.text
      ? wrapText(line.text, availableWidth - lineIndent, line.size)
      : [''];

    wrapped.forEach((wrappedLine) => {
      const requiredHeight = line.size * PDF_LINE_HEIGHT;
      if (y - requiredHeight < PDF_MARGIN_BOTTOM) {
        pages.push(currentCommands.join('\n'));
        currentCommands = [`${PDF_HEADER_COLOR}`];
        y = PDF_PAGE_HEIGHT - PDF_MARGIN_TOP;
      }

      currentCommands.push(line.font === 'bold' ? '/F2 1 Tf' : '/F1 1 Tf');
      currentCommands.push(`${line.size} Tf`);
      currentCommands.push(line.size <= 10 ? PDF_MUTED_COLOR : PDF_BODY_COLOR);
      currentCommands.push(`1 0 0 1 ${(PDF_MARGIN_LEFT + lineIndent).toFixed(2)} ${y.toFixed(2)} Tm`);
      currentCommands.push(`(${escapePdfText(wrappedLine || ' ')}) Tj`);
      y -= requiredHeight;
    });

    if (line.spacingAfter) y -= line.spacingAfter;
  });

  pages.push(currentCommands.join('\n'));
  return pages;
}

function buildPdfBlob(pageStreams: string[]): Blob {
  const objects: string[] = [];
  const pageObjectNumbers: number[] = [];

  const catalogObj = 1;
  const pagesObj = 2;
  const fontRegularObj = 3;
  const fontBoldObj = 4;
  let nextObj = 5;

  objects[catalogObj] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[fontRegularObj] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[fontBoldObj] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';

  pageStreams.forEach((stream) => {
    const contentObj = nextObj++;
    const pageObj = nextObj++;

    const streamContent = `BT\n${stream}\nET`;
    objects[contentObj] = `<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`;
    objects[pageObj] =
      `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 ${fontRegularObj} 0 R /F2 ${fontBoldObj} 0 R >> >> /Contents ${contentObj} 0 R >>`;

    pageObjectNumbers.push(pageObj);
  });

  const kids = pageObjectNumbers.map((obj) => `${obj} 0 R`).join(' ');
  objects[pagesObj] = `<< /Type /Pages /Kids [${kids}] /Count ${pageObjectNumbers.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (let i = 1; i < objects.length; i += 1) {
    const body = objects[i];
    if (!body) continue;
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${body}\nendobj\n`;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += '0000000000 65535 f \n';

  for (let i = 1; i < objects.length; i += 1) {
    const offset = offsets[i] ?? 0;
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length} /Root ${catalogObj} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}

function triggerPdfDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFilePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export async function generatePatientVisitReportPdf(data: PatientVisitReportData): Promise<Blob> {
  const lines = buildPatientReportLines(data);
  const pages = createPdfPages(lines);
  return buildPdfBlob(pages);
}

export async function generateClinicianVisitReportPdf(data: ClinicianVisitReportData): Promise<Blob> {
  const lines = buildClinicianReportLines(data);
  const pages = createPdfPages(lines);
  return buildPdfBlob(pages);
}

export async function downloadPatientVisitReportPdf(data: PatientVisitReportData): Promise<void> {
  const pdfBlob = await generatePatientVisitReportPdf(data);
  triggerPdfDownload(pdfBlob, `informe-paciente-${safeFilePart(data.visitId)}.pdf`);
}

export async function downloadClinicianVisitReportPdf(data: ClinicianVisitReportData): Promise<void> {
  const pdfBlob = await generateClinicianVisitReportPdf(data);
  triggerPdfDownload(pdfBlob, `informe-medico-${safeFilePart(data.visitId)}.pdf`);
}

/**
 * Obsoleto: el flujo HTML imprimible con popup ha sido reemplazado por generación PDF directa.
 */
export function openPrintableHtmlDocument(): never {
  throw new Error('openPrintableHtmlDocument está obsoleto. Use las funciones de PDF directo.');
}
