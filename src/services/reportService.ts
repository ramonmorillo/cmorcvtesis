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

type PdfFontKind = 'regular' | 'bold';
type PdfElement = { text: string; size: number; font: PdfFontKind; indent?: number; spacingAfter?: number };

const PDF_PAGE_WIDTH = 595.28;
const PDF_PAGE_HEIGHT = 841.89;
const PDF_MARGIN = 48;
const PDF_CONTENT_WIDTH = PDF_PAGE_WIDTH - PDF_MARGIN * 2;
const PDF_LINE_HEIGHT = 1.35;
const PDF_DEBUG_LOGS = true;
const SPANISH_CHARSET_SAMPLE = 'áéíóúñÁÉÍÓÚÑ';

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
  const score = typeof item.total_score === 'number' ? ` · puntuación ${item.total_score}` : '';
  return `${item.questionnaire_type.toUpperCase()}${score}`;
}

function formatInterventionItem(item: Intervention): string {
  if (item.outcome?.trim()) return `${item.intervention_type}: ${item.outcome.trim()}`;
  return item.intervention_type;
}

function deriveSimpleSummary(visit: Visit, cmoScore: number | null, interventions: Intervention[], questionnaires: QuestionnaireResponseRecord[]): string {
  const chunks: string[] = [];
  if (cmoScore !== null) chunks.push(`Su nivel de prioridad CMO actual es ${cmoScore}`);
  if (interventions.length > 0) chunks.push(`Se registraron ${interventions.length} intervención(es) en esta visita`);
  if (questionnaires.length > 0) chunks.push(`Se completaron ${questionnaires.length} cuestionario(s) de seguimiento`);
  if (visit.notes?.trim()) chunks.push(`Comentario clínico relevante: ${visit.notes.trim()}`);
  return chunks.length > 0 ? `${chunks.join('. ')}.` : 'No hay información clínica suficiente para elaborar un resumen ampliado en esta visita.';
}

function deriveClinicalSummary(visit: Visit, cmoScore: number | null, questionnaires: QuestionnaireResponseRecord[]): string {
  return [
    `Priorización clínica CMO: ${cmoScore !== null ? cmoScore : 'No disponible'}.`,
    `Total de cuestionarios con respuesta: ${questionnaires.length}.`,
    visit.notes?.trim() ? `Evolución/observaciones: ${visit.notes.trim()}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function derivePatientRecommendations(interventions: Intervention[]): string[] {
  const items = interventions.map((item) => item.outcome?.trim()).filter((v): v is string => Boolean(v));
  if (items.length > 0) return items.slice(0, 4);
  return [
    'Mantenga la medicación según la pauta indicada.',
    'Si aparecen síntomas nuevos o efectos adversos, contacte con su centro de salud.',
    'Lleve a la próxima consulta una lista actualizada de su tratamiento.',
  ];
}

function deriveCoordinationRecommendations(cmoPriority: number | null | undefined): string[] {
  if (cmoPriority === 1) {
    return [
      'Caso de alta prioridad: coordinar revisión médica preferente en ≤ 7 días.',
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
    `Proyecto de tesis doctoral: “${THESIS_INSTITUTIONAL_REFERENCE.projectTitle}”.`,
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
      followUp: 'Siguiente paso: acudir a la próxima visita programada. Contacte antes si detecta síntomas nuevos, dudas con su medicación o dificultades para seguir el plan.',
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
  const averageCharWidth = fontSize * 0.5;

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

const PDF_WINANSI_OVERRIDES: Record<string, number> = {
  '€': 128,
  '‚': 130,
  'ƒ': 131,
  '„': 132,
  '…': 133,
  '†': 134,
  '‡': 135,
  'ˆ': 136,
  '‰': 137,
  'Š': 138,
  '‹': 139,
  'Œ': 140,
  'Ž': 142,
  '‘': 145,
  '’': 146,
  '“': 147,
  '”': 148,
  '•': 149,
  '–': 150,
  '—': 151,
  '˜': 152,
  '™': 153,
  'š': 154,
  '›': 155,
  'œ': 156,
  'ž': 158,
  'Ÿ': 159,
};

function escapePdfText(value: string): string {
  let out = '';

  for (const char of value) {
    if (char === '\\') {
      out += '\\\\';
      continue;
    }
    if (char === '(') {
      out += '\\(';
      continue;
    }
    if (char === ')') {
      out += '\\)';
      continue;
    }

    const override = PDF_WINANSI_OVERRIDES[char];
    if (override !== undefined) {
      out += `\\${override.toString(8).padStart(3, '0')}`;
      continue;
    }

    const code = char.charCodeAt(0);
    if (code >= 32 && code <= 126) {
      out += char;
    } else if (code >= 160 && code <= 255) {
      out += `\\${code.toString(8).padStart(3, '0')}`;
    } else {
      out += '?';
    }
  }

  return out;
}

function pushSection(lines: PdfElement[], title: string, body: string | string[], options?: { bullet?: boolean }) {
  lines.push({ text: title, size: 11.5, font: 'bold', spacingAfter: 6 });
  const values = Array.isArray(body) ? normalizeList(body) : [textOrNotAvailable(body)];
  values.forEach((value, index) => {
    lines.push({ text: `${options?.bullet ? '• ' : ''}${value}`, size: 10, font: 'regular', indent: options?.bullet ? 10 : 0, spacingAfter: 2 });
    if (index === values.length - 1) lines.push({ text: '', size: 4, font: 'regular', spacingAfter: 8 });
  });
}

function buildPatientReportLines(data: PatientVisitReportData): PdfElement[] {
  const lines: PdfElement[] = [];
  pushSection(lines, 'Resumen para paciente', data.simpleSummary);
  pushSection(lines, 'Nivel de prioridad actual', data.cmoLevelLabel);
  pushSection(lines, 'Intervenciones realizadas', data.interventions, { bullet: true });
  pushSection(lines, 'Recomendaciones prácticas', data.recommendations, { bullet: true });
  pushSection(lines, 'Plan de seguimiento', data.followUp);
  pushSection(lines, 'Validación de caracteres', `Muestra UTF-8: ${SPANISH_CHARSET_SAMPLE}`);
  return lines;
}

function buildClinicianReportLines(data: ClinicianVisitReportData): PdfElement[] {
  const lines: PdfElement[] = [];
  pushSection(lines, 'Resumen clínico estructurado', data.clinicalSummary);
  pushSection(lines, 'Puntuación y nivel CMO', data.cmoScoreLabel);
  pushSection(lines, 'Intervenciones registradas', data.interventions, { bullet: true });
  pushSection(lines, 'Cuestionarios interpretables', data.relevantQuestionnaires, { bullet: true });
  pushSection(lines, 'Coordinación asistencial sugerida', data.careCoordinationRecommendations, { bullet: true });
  pushSection(lines, 'Validación de caracteres', `Muestra UTF-8: ${SPANISH_CHARSET_SAMPLE}`);
  return lines;
}

function createPdfPages(kind: 'patient' | 'clinician', meta: { visitTypeLabel: string; visitDateLabel: string; generatedAtLabel: string; footer: string }, lines: PdfElement[]): string[] {
  const pages: string[] = [];
  let y = PDF_PAGE_HEIGHT - PDF_MARGIN;
  let commands: string[] = [];

  const startPage = () => {
    commands = [];
    y = PDF_PAGE_HEIGHT - PDF_MARGIN;

    commands.push('0.02 0.24 0.55 rg');
    commands.push(`${PDF_MARGIN} ${y - 10} ${PDF_CONTENT_WIDTH} 42 re f`);
    commands.push('1 1 1 rg');
    commands.push('BT');
    commands.push('/F2 13 Tf');
    commands.push(`1 0 0 1 ${PDF_MARGIN + 12} ${y + 13} Tm (${escapePdfText(kind === 'patient' ? 'INFORME PARA PACIENTE' : 'INFORME CLÍNICO PARA PROFESIONAL')}) Tj`);
    commands.push('/F1 9 Tf');
    commands.push(`1 0 0 1 ${PDF_MARGIN + 12} ${y - 2} Tm (${escapePdfText(`${textOrNotAvailable(meta.visitTypeLabel)} · ${textOrNotAvailable(meta.visitDateLabel)}`)}) Tj`);
    commands.push('ET');
    y -= 58;

    commands.push('0.95 0.97 1 rg');
    commands.push(`${PDF_MARGIN} ${y - 42} ${PDF_CONTENT_WIDTH} 40 re f`);
    commands.push('0.08 0.15 0.24 rg');
    commands.push('BT');
    commands.push('/F2 10 Tf');
    commands.push(`1 0 0 1 ${PDF_MARGIN + 10} ${y - 26} Tm (${escapePdfText('Resumen institucional de la visita')}) Tj`);
    commands.push('/F1 9 Tf');
    commands.push(`1 0 0 1 ${PDF_MARGIN + 195} ${y - 26} Tm (${escapePdfText(`Generado: ${textOrNotAvailable(meta.generatedAtLabel)}`)}) Tj`);
    commands.push('ET');
    y -= 56;
  };

  const closePage = () => {
    commands.push('0.4 0.45 0.55 rg');
    commands.push('BT');
    commands.push('/F1 8 Tf');
    commands.push(`1 0 0 1 ${PDF_MARGIN} ${PDF_MARGIN - 10} Tm (${escapePdfText(meta.footer)}) Tj`);
    commands.push('ET');
    pages.push(commands.join('\n'));
  };

  startPage();
  const usableWidth = PDF_CONTENT_WIDTH - 16;

  for (const line of lines) {
    const wrapped = line.text ? wrapText(line.text, usableWidth - (line.indent ?? 0), line.size) : [''];
    for (const text of wrapped) {
      const required = line.size * PDF_LINE_HEIGHT;
      if (y - required < PDF_MARGIN + 24) {
        closePage();
        startPage();
      }
      commands.push(line.font === 'bold' ? '0.04 0.18 0.43 rg' : '0.08 0.12 0.18 rg');
      commands.push('BT');
      commands.push(`${line.font === 'bold' ? '/F2' : '/F1'} ${line.size} Tf`);
      commands.push(`1 0 0 1 ${(PDF_MARGIN + 8 + (line.indent ?? 0)).toFixed(2)} ${y.toFixed(2)} Tm`);
      commands.push(`(${escapePdfText(text || ' ')}) Tj`);
      commands.push('ET');
      y -= required;
    }
    if (line.spacingAfter) y -= line.spacingAfter;
  }

  closePage();
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
    objects[contentObj] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
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

function validatePdfBlobStructure(blob: Blob): Promise<{ hasPdfHeader: boolean; hasXref: boolean; hasTrailer: boolean; hasEOF: boolean }> {
  return blob.text().then((text) => ({
    hasPdfHeader: text.startsWith('%PDF-'),
    hasXref: text.includes('\nxref\n'),
    hasTrailer: text.includes('\ntrailer\n'),
    hasEOF: text.trimEnd().endsWith('%%EOF'),
  }));
}

function logPdfDebug(context: {
  reportType: 'patient' | 'clinician';
  fileName: string;
  dataPreview: Record<string, unknown>;
  linesCount: number;
  pagesCount: number;
  blob: Blob;
  renderError?: unknown;
}): void {
  if (!PDF_DEBUG_LOGS) return;

  console.info('[PDF DEBUG] report data preview', {
    reportType: context.reportType,
    fileName: context.fileName,
    dataPreview: context.dataPreview,
    linesCount: context.linesCount,
    pagesCount: context.pagesCount,
  });

  validatePdfBlobStructure(context.blob)
    .then((structure) => console.info('[PDF DEBUG] blob structure', { ...structure, reportType: context.reportType, fileName: context.fileName }))
    .catch((error) => console.error('[PDF DEBUG] structure validation error', error));

  if (context.renderError) console.error('[PDF DEBUG] document build error', context.renderError);
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
  const pages = createPdfPages(
    'patient',
    {
      visitTypeLabel: data.visitTypeLabel,
      visitDateLabel: data.visitDateLabel,
      generatedAtLabel: data.generatedAtLabel,
      footer: data.institutionalFooter,
    },
    lines,
  );
  return buildPdfBlob(pages);
}

export async function generateClinicianVisitReportPdf(data: ClinicianVisitReportData): Promise<Blob> {
  const lines = buildClinicianReportLines(data);
  const pages = createPdfPages(
    'clinician',
    {
      visitTypeLabel: data.visitTypeLabel,
      visitDateLabel: data.visitDateLabel,
      generatedAtLabel: data.generatedAtLabel,
      footer: data.institutionalFooter,
    },
    lines,
  );
  return buildPdfBlob(pages);
}

export async function downloadPatientVisitReportPdf(data: PatientVisitReportData): Promise<void> {
  const fileName = `informe-paciente-${safeFilePart(data.visitId)}.pdf`;
  try {
    const pdfBlob = await generatePatientVisitReportPdf(data);
    logPdfDebug({
      reportType: 'patient',
      fileName,
      dataPreview: { visitId: data.visitId, visitTypeLabel: data.visitTypeLabel },
      linesCount: buildPatientReportLines(data).length,
      pagesCount: 1,
      blob: pdfBlob,
    });
    triggerPdfDownload(pdfBlob, fileName);
  } catch (error) {
    logPdfDebug({ reportType: 'patient', fileName, dataPreview: { visitId: data.visitId }, linesCount: 0, pagesCount: 0, blob: new Blob([]), renderError: error });
    throw error;
  }
}

export async function downloadClinicianVisitReportPdf(data: ClinicianVisitReportData): Promise<void> {
  const fileName = `informe-medico-${safeFilePart(data.visitId)}.pdf`;
  try {
    const pdfBlob = await generateClinicianVisitReportPdf(data);
    logPdfDebug({
      reportType: 'clinician',
      fileName,
      dataPreview: { visitId: data.visitId, visitTypeLabel: data.visitTypeLabel },
      linesCount: buildClinicianReportLines(data).length,
      pagesCount: 1,
      blob: pdfBlob,
    });
    triggerPdfDownload(pdfBlob, fileName);
  } catch (error) {
    logPdfDebug({ reportType: 'clinician', fileName, dataPreview: { visitId: data.visitId }, linesCount: 0, pagesCount: 0, blob: new Blob([]), renderError: error });
    throw error;
  }
}

export function openPrintableHtmlDocument(): never {
  throw new Error('openPrintableHtmlDocument está obsoleto. Use las funciones de PDF directo.');
}
