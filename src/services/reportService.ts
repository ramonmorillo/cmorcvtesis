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

type ReportTemplateType = 'patient' | 'clinician';

function getReportsApiBaseUrl(): string {
  const configuredBaseUrl = import.meta.env.VITE_REPORTS_API_BASE_URL as string | undefined;
  if (!configuredBaseUrl) return '/api';
  return configuredBaseUrl.replace(/\/$/, '');
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

async function requestPlaywrightPdf(template: ReportTemplateType, data: PatientVisitReportData | ClinicianVisitReportData): Promise<Blob> {
  const response = await fetch(`${getReportsApiBaseUrl()}/reports/pdf`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ template, data }),
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorPayload?.error ?? `Error HTTP ${response.status} al generar el PDF.`);
  }

  return response.blob();
}

export async function downloadPatientVisitReportPdf(data: PatientVisitReportData): Promise<void> {
  const pdfBlob = await requestPlaywrightPdf('patient', data);
  triggerPdfDownload(pdfBlob, `informe-paciente-${data.visitId}.pdf`);
}

export async function downloadClinicianVisitReportPdf(data: ClinicianVisitReportData): Promise<void> {
  const pdfBlob = await requestPlaywrightPdf('clinician', data);
  triggerPdfDownload(pdfBlob, `informe-medico-${data.visitId}.pdf`);
}

export function openPrintableHtmlDocument(): never {
  throw new Error('Motor PDF obsoleto eliminado. Use el servicio Playwright /api/reports/pdf.');
}
