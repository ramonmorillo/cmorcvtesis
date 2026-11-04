// Modelo editable del informe de derivación a Medicina de Atención Primaria (MAP)
// y su conversión a bloques maquetables. Solo plantillas locales: no genera
// contenido clínico; todo texto procede de datos registrados o del profesional.

import type { DocBlock, DocHeaderFooter, TextSegment } from './referralPdf';

export type ReferralPriority = '' | 'Valoración preferente' | 'Valoración ordinaria' | 'Para conocimiento';

export const REFERRAL_PRIORITY_OPTIONS: ReferralPriority[] = ['', 'Valoración preferente', 'Valoración ordinaria', 'Para conocimiento'];

export type ReferralProblem = {
  id: string;
  include: boolean;
  title: string;
  priority: ReferralPriority;
  /** Hallazgos (datos objetivos e información referida por el paciente, diferenciados en el texto). */
  findings: string;
  relatedMedications: string;
  /** Evidencia disponible y limitaciones (p. ej., ausencia de registro objetivo). */
  evidence: string;
  /** Intervención farmacéutica YA realizada para este problema. */
  interventionDone: string;
  /** Actuación que se propone/solicita para valoración médica. */
  proposal: string;
};

export type ReferralParameter = {
  key: string;
  label: string;
  /** Valor con unidad, tal como consta en el registro. */
  valueText: string;
  include: boolean;
};

export type ReferralIntervention = { id: string; text: string; include: boolean };

export type ReferralDraft = {
  serviceName: string;
  professionals: string;
  reportDate: string; // yyyy-mm-dd
  recipient: string;
  patientDetails: string; // multilínea, editable
  originVisitLabel: string; // p. ej. "Mes 6 · 23/10/2026"
  reason: string;
  parameters: ReferralParameter[];
  problems: ReferralProblem[];
  registeredInterventions: ReferralIntervention[];
  generalProposals: string;
  conclusion: string;
  followUp: string;
  signatureName: string;
  signatureLicense: string;
  signaturePlace: string;
};

export function emptyProblem(id: string): ReferralProblem {
  return { id, include: true, title: '', priority: '', findings: '', relatedMedications: '', evidence: '', interventionDone: '', proposal: '' };
}

export function formatLongDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (!isoDate || Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Parámetros de la evaluación clínica de la visita (solo los que constan). */
type AssessmentLike = Partial<Record<string, number | string | null>>;

const PARAMETER_DEFS: Array<{ key: string; label: string; unit: string; digits?: number }> = [
  { key: 'systolic_bp', label: 'PA sistólica', unit: 'mmHg' },
  { key: 'diastolic_bp', label: 'PA diastólica', unit: 'mmHg' },
  { key: 'heart_rate', label: 'Frecuencia cardiaca', unit: 'lpm' },
  { key: 'weight_kg', label: 'Peso', unit: 'kg', digits: 1 },
  { key: 'bmi', label: 'IMC', unit: 'kg/m²', digits: 1 },
  { key: 'waist_cm', label: 'Perímetro abdominal', unit: 'cm', digits: 1 },
  { key: 'fasting_glucose_mg_dl', label: 'Glucemia en ayunas', unit: 'mg/dl' },
  { key: 'hba1c_pct', label: 'HbA1c', unit: '%', digits: 1 },
  { key: 'ldl_mg_dl', label: 'LDL-colesterol', unit: 'mg/dl' },
  { key: 'hdl_mg_dl', label: 'HDL-colesterol', unit: 'mg/dl' },
  { key: 'non_hdl_mg_dl', label: 'Colesterol no-HDL', unit: 'mg/dl' },
];

export function buildParameterOptions(assessment: AssessmentLike | null): ReferralParameter[] {
  if (!assessment) return [];
  const options: ReferralParameter[] = [];
  for (const def of PARAMETER_DEFS) {
    const raw = assessment[def.key];
    if (raw === null || raw === undefined || raw === '') continue;
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value)) continue;
    const valueText = `${value.toLocaleString('es-ES', { maximumFractionDigits: def.digits ?? 0 })} ${def.unit}`;
    options.push({ key: def.key, label: def.label, valueText, include: false });
  }
  // PA en una sola línea cuando constan ambas.
  const sys = options.find((option) => option.key === 'systolic_bp');
  const dia = options.find((option) => option.key === 'diastolic_bp');
  if (sys && dia) {
    const merged: ReferralParameter = {
      key: 'blood_pressure',
      label: 'Presión arterial',
      valueText: `${sys.valueText.replace(' mmHg', '')}/${dia.valueText}`,
      include: false,
    };
    return [merged, ...options.filter((option) => option !== sys && option !== dia)];
  }
  return options;
}

const has = (value: string) => value.trim().length > 0;
const para = (segments: TextSegment[]): DocBlock => ({ kind: 'paragraph', segments });
const labelled = (label: string, text: string): DocBlock => para([{ text: `${label} `, bold: true }, { text: text.trim() }]);

/** Divide texto multilínea en párrafos (líneas en blanco o saltos simples). */
function paragraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function buildReferralBlocks(draft: ReferralDraft): DocBlock[] {
  const blocks: DocBlock[] = [];
  let section = 0;
  const heading = (text: string) => {
    section += 1;
    blocks.push({ kind: 'heading', text: `${section}. ${text}` });
  };

  blocks.push({ kind: 'title', text: 'Informe de derivación a Medicina de Atención Primaria' });
  blocks.push(labelled('Fecha del informe:', formatLongDate(draft.reportDate)));
  if (has(draft.recipient)) blocks.push(labelled('Destinatario:', draft.recipient));
  if (has(draft.originVisitLabel)) blocks.push(labelled('Visita de origen:', draft.originVisitLabel));

  if (has(draft.patientDetails)) {
    heading('Datos del paciente');
    paragraphs(draft.patientDetails).forEach((line) => blocks.push(para([{ text: line }])));
  }

  if (has(draft.reason)) {
    heading('Motivo de derivación');
    blocks.push({ kind: 'callout', segments: [{ text: draft.reason.trim() }] });
  }

  const parameters = draft.parameters.filter((parameter) => parameter.include);
  if (parameters.length > 0) {
    heading('Parámetros clínicos relevantes');
    blocks.push(
      para([{ text: `Valores registrados en la visita de origen${has(draft.originVisitLabel) ? ` (${draft.originVisitLabel})` : ''}.`, bold: false }]),
    );
    parameters.forEach((parameter) => blocks.push({ kind: 'bullet', segments: [{ text: `${parameter.label}: `, bold: true }, { text: parameter.valueText }] }));
  }

  const problems = draft.problems.filter((problem) => problem.include && has(problem.title));
  if (problems.length > 0) {
    heading('Problemas detectados');
    problems.forEach((problem, index) => {
      const inner: DocBlock[] = [
        { kind: 'subheading', text: `${section}.${index + 1}. ${problem.title.trim()}${problem.priority ? ` — ${problem.priority.toUpperCase()}` : ''}` },
      ];
      paragraphs(problem.findings).forEach((line) => inner.push(para([{ text: line }])));
      if (has(problem.relatedMedications)) inner.push(labelled('Medicamentos relacionados:', problem.relatedMedications));
      if (has(problem.evidence)) inner.push(labelled('Evidencia disponible y limitaciones:', problem.evidence));
      blocks.push({ kind: 'group', keepTogether: true, blocks: inner });
    });
  }

  const problemNumber = (problem: ReferralProblem) => problems.indexOf(problem) + 1;
  const interventionLines = [
    ...problems.filter((problem) => has(problem.interventionDone)).map((problem) => ({ ref: `Problema ${problemNumber(problem)}`, text: problem.interventionDone })),
    ...draft.registeredInterventions.filter((item) => item.include && has(item.text)).map((item) => ({ ref: '', text: item.text })),
  ];
  if (interventionLines.length > 0) {
    heading('Intervenciones farmacéuticas realizadas');
    interventionLines.forEach((line) =>
      blocks.push({ kind: 'bullet', segments: [...(line.ref ? [{ text: `${line.ref}: `, bold: true }] : []), { text: line.text.trim() }] }),
    );
  }

  const proposalLines = problems.filter((problem) => has(problem.proposal));
  if (proposalLines.length > 0 || has(draft.generalProposals)) {
    heading('Propuestas para valoración médica');
    blocks.push(para([{ text: 'Las siguientes propuestas se someten a la valoración y decisión del médico responsable.' }]));
    proposalLines.forEach((problem) =>
      blocks.push({ kind: 'bullet', segments: [{ text: `Problema ${problemNumber(problem)}: `, bold: true }, { text: problem.proposal.trim() }] }),
    );
    paragraphs(draft.generalProposals).forEach((line) => blocks.push({ kind: 'bullet', segments: [{ text: line }] }));
  }

  if (has(draft.conclusion) || has(draft.followUp)) {
    heading('Conclusión y seguimiento');
    paragraphs(draft.conclusion).forEach((line) => blocks.push(para([{ text: line }])));
    if (has(draft.followUp)) blocks.push(labelled('Seguimiento propuesto:', draft.followUp));
  }

  // Firma: bloque indivisible.
  const signature: DocBlock[] = [{ kind: 'spacer', height: 8 }];
  if (has(draft.signatureName)) signature.push(labelled('Farmacéutico/a:', draft.signatureName));
  if (has(draft.signatureLicense)) signature.push(labelled('N.º de colegiado/a:', draft.signatureLicense));
  signature.push(para([{ text: `${has(draft.signaturePlace) ? `En ${draft.signaturePlace.trim()}, a` : 'Fecha:'} ${formatLongDate(draft.reportDate)}.` }]));
  signature.push({ kind: 'signatureSpace', height: 40 });
  signature.push(para([{ text: `Fdo.: ${has(draft.signatureName) ? draft.signatureName.trim() : ''}` }]));
  blocks.push({ kind: 'group', keepTogether: true, blocks: signature });

  return blocks;
}

export function buildReferralChrome(draft: ReferralDraft, studyCode: string): DocHeaderFooter {
  return {
    headerTitle: has(draft.serviceName) ? draft.serviceName.trim() : 'Servicio de Atención Farmacéutica',
    headerSubtitle: has(draft.professionals) ? draft.professionals.trim() : '',
    footerLeft: `Informe de derivación a MAP${studyCode ? ` · ${studyCode}` : ''} · Propuestas sujetas a valoración médica`,
  };
}

/** Campos imprescindibles antes de generar el PDF. */
export function validateReferralDraft(draft: ReferralDraft): string[] {
  const issues: string[] = [];
  if (!has(draft.reason)) issues.push('Indica el motivo de derivación.');
  if (!draft.problems.some((problem) => problem.include && has(problem.title))) issues.push('Incluye al menos un problema con título.');
  if (!has(draft.signatureName)) issues.push('Indica el nombre del profesional firmante.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.reportDate)) issues.push('Indica una fecha de informe válida.');
  return issues;
}
