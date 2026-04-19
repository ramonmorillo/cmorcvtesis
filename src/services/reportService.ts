import { getVisitTypeLabel } from '../constants/enums';
import { THESIS_SHORT_FOOTER } from '../constants/institutional';
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

/**
 * MVP assumptions (documented):
 * - Primary summary sources: CMO score, intervention count, questionnaire count.
 * - Fallback source: visit notes (notes are complementary and not the only source when structured data exists).
 * - If everything is missing, the report still returns a neutral professional message.
 */
function deriveSimpleSummary(visit: Visit, cmoScore: number | null, interventions: Intervention[], questionnaires: QuestionnaireResponseRecord[]): string {
  const chunks: string[] = [];

  if (cmoScore !== null) chunks.push(`Nivel CMO registrado (${cmoScore} puntos)`);
  if (interventions.length > 0) chunks.push(`${interventions.length} intervención(es) realizada(s)`);
  if (questionnaires.length > 0) chunks.push(`${questionnaires.length} cuestionario(s) completado(s)`);

  // Fallback/complement only: narrative free text from visit notes.
  if (visit.notes?.trim()) chunks.push(`Observaciones: ${visit.notes.trim()}`);

  if (chunks.length > 0) return `${chunks.join('. ')}.`;
  return 'No disponible: la visita aún no tiene datos estructurados suficientes para un resumen detallado.';
}

function deriveClinicalSummary(visit: Visit, cmoScore: number | null, questionnaires: QuestionnaireResponseRecord[]): string {
  const pieces: string[] = [];
  pieces.push(`Puntuación CMO: ${cmoScore !== null ? cmoScore : 'No disponible'}.`);
  pieces.push(`Cuestionarios registrados: ${questionnaires.length}.`);

  if (visit.notes?.trim()) {
    // Fallback/complement from clinical narrative notes.
    pieces.push(`Observaciones clínicas: ${visit.notes.trim()}.`);
  }

  return pieces.join(' ');
}

/**
 * MVP assumption:
 * - There is no dedicated structured recommendation table yet.
 * - We derive patient recommendations from intervention outcomes when present.
 */
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

/**
 * MVP assumption:
 * - Coordination recommendations are inferred from CMO priority, not from a structured institutional protocol table.
 */
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
      institutionalFooter: THESIS_SHORT_FOOTER,
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
      institutionalFooter: THESIS_SHORT_FOOTER,
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textOrNotAvailable(value: string): string {
  const trimmed = value.trim();
  return trimmed ? trimmed : 'No disponible';
}

function renderList(items: string[], fallback: string): string {
  if (items.length === 0) return `<p>${escapeHtml(fallback)}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(textOrNotAvailable(item))}</li>`).join('')}</ul>`;
}

function basePrintableStyles(): string {
  return `
    body { font-family: Inter, Arial, sans-serif; color: #0f172a; margin: 22px; line-height: 1.4; }
    h1 { margin-bottom: 4px; font-size: 22px; }
    h2 { font-size: 16px; margin-bottom: 6px; }
    .meta { color: #475569; margin-bottom: 14px; }
    .block { margin-top: 14px; }
    .footer { margin-top: 22px; font-size: 12px; color: #475569; border-top: 1px solid #cbd5e1; padding-top: 10px; }
    @media print {
      @page { size: A4; margin: 14mm; }
      body { margin: 0; font-size: 12px; }
    }
  `;
}

export function generatePatientVisitReportHtml(data: PatientVisitReportData): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Informe de visita para paciente</title>
  <style>${basePrintableStyles()}</style>
</head>
<body>
  <h1>Informe de visita para paciente</h1>
  <p class="meta">${escapeHtml(textOrNotAvailable(data.visitTypeLabel))} · ${escapeHtml(textOrNotAvailable(data.visitDateLabel))}<br/>Generado: ${escapeHtml(data.generatedAtLabel)}</p>
  <section class="block"><h2>Resumen de la visita</h2><p>${escapeHtml(textOrNotAvailable(data.simpleSummary))}</p></section>
  <section class="block"><h2>Nivel CMO</h2><p>${escapeHtml(textOrNotAvailable(data.cmoLevelLabel))}</p></section>
  <section class="block"><h2>Intervenciones</h2>${renderList(data.interventions, 'No disponible')}</section>
  <section class="block"><h2>Recomendaciones</h2>${renderList(data.recommendations, 'No disponible')}</section>
  <section class="block"><h2>Seguimiento</h2><p>${escapeHtml(textOrNotAvailable(data.followUp))}</p></section>
  <p class="footer">${escapeHtml(textOrNotAvailable(data.institutionalFooter))}</p>
</body>
</html>`;
}

export function generateClinicianVisitReportHtml(data: ClinicianVisitReportData): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Informe de visita para profesional médico</title>
  <style>${basePrintableStyles()}</style>
</head>
<body>
  <h1>Informe de visita para profesional médico</h1>
  <p class="meta">${escapeHtml(textOrNotAvailable(data.visitTypeLabel))} · ${escapeHtml(textOrNotAvailable(data.visitDateLabel))}<br/>Generado: ${escapeHtml(data.generatedAtLabel)}</p>
  <section class="block"><h2>Resumen clínico</h2><p>${escapeHtml(textOrNotAvailable(data.clinicalSummary))}</p></section>
  <section class="block"><h2>Intervenciones realizadas</h2>${renderList(data.interventions, 'No disponible')}</section>
  <section class="block"><h2>Score / Nivel CMO</h2><p>${escapeHtml(textOrNotAvailable(data.cmoScoreLabel))}</p></section>
  <section class="block"><h2>Cuestionarios relevantes</h2>${renderList(data.relevantQuestionnaires, 'No disponible')}</section>
  <section class="block"><h2>Recomendaciones para coordinación</h2>${renderList(data.careCoordinationRecommendations, 'No disponible')}</section>
  <p class="footer">${escapeHtml(textOrNotAvailable(data.institutionalFooter))}</p>
</body>
</html>`;
}

export function openPrintableHtmlDocument(html: string): void {
  const reportWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!reportWindow) return;

  reportWindow.document.open();
  reportWindow.document.write(html);
  reportWindow.document.close();
}
