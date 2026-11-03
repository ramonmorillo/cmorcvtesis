import { useEffect, useMemo, useState } from 'react';

import { Notice } from '../../components/ui/Notice';
import { THESIS_INSTITUTIONAL_REFERENCE } from '../../constants/institutional';
import { getSexLabel, getVisitTypeLabel } from '../../constants/enums';
import { getClinicalAssessmentByVisit } from '../../services/assessmentService';
import { listInterventionsByVisit, type Intervention } from '../../services/interventionService';
import { getPatientById, type Patient } from '../../services/patientService';
import { getVisitById, listVisitsByPatient, type Visit } from '../../services/visitService';
import { normalizeMedicationDisplayName } from '../medications/displayFormat';
import { listVisitMedicationSnapshot } from '../medications/medicationsService';
import {
  buildParameterOptions,
  buildReferralBlocks,
  buildReferralChrome,
  emptyProblem,
  REFERRAL_PRIORITY_OPTIONS,
  validateReferralDraft,
  type ReferralDraft,
  type ReferralIntervention,
  type ReferralPriority,
  type ReferralProblem,
} from './referralModel';
import { layoutDocument, serializePdf, type DocBlock } from './referralPdf';

type Props = { visitId: string };

const SIGNATURE_STORAGE_KEY = 'iris:referral-signature';
type StoredSignature = Pick<ReferralDraft, 'serviceName' | 'professionals' | 'signatureName' | 'signatureLicense' | 'signaturePlace'>;

function readStoredSignature(): Partial<StoredSignature> {
  try {
    return JSON.parse(window.localStorage.getItem(SIGNATURE_STORAGE_KEY) ?? '{}') as Partial<StoredSignature>;
  } catch {
    return {};
  }
}

function storeSignature(draft: ReferralDraft): void {
  try {
    const value: StoredSignature = {
      serviceName: draft.serviceName,
      professionals: draft.professionals,
      signatureName: draft.signatureName,
      signatureLicense: draft.signatureLicense,
      signaturePlace: draft.signaturePlace,
    };
    window.localStorage.setItem(SIGNATURE_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Preferencia local opcional: si el navegador no la permite, no pasa nada.
  }
}

function visitLabel(visit: Visit): string {
  const date = visit.visit_date ?? visit.scheduled_date;
  return `${getVisitTypeLabel(visit.visit_type)}${date ? ` · ${new Date(`${date}T00:00:00`).toLocaleDateString('es-ES')}` : ''}`;
}

function interventionText(item: Intervention): string {
  return [item.intervention_type, item.outcome?.trim() ? `Resultado: ${item.outcome.trim()}` : '', item.notes?.trim() ?? '']
    .filter(Boolean)
    .join(' · ');
}

function initialDraft(patient: Patient | null): ReferralDraft {
  const stored = readStoredSignature();
  const patientLines = patient
    ? [
        `Código de estudio: ${patient.study_code}`,
        [patient.age_at_inclusion ? `Edad en la inclusión: ${patient.age_at_inclusion} años` : '', patient.sex ? `Sexo: ${getSexLabel(patient.sex)}` : '']
          .filter(Boolean)
          .join(' · '),
      ].filter(Boolean)
    : [];
  return {
    serviceName: stored.serviceName ?? patient?.pharmacy_site ?? 'Servicio de Atención Farmacéutica',
    professionals: stored.professionals ?? '',
    reportDate: new Date().toISOString().slice(0, 10),
    recipient: 'Médico/a de Atención Primaria',
    patientDetails: patientLines.join('\n'),
    originVisitLabel: '',
    reason: '',
    parameters: [],
    problems: [emptyProblem('p1')],
    registeredInterventions: [],
    generalProposals: '',
    conclusion: '',
    followUp: '',
    signatureName: stored.signatureName ?? patient?.investigator_name ?? THESIS_INSTITUTIONAL_REFERENCE.doctoralCandidate,
    signatureLicense: stored.signatureLicense ?? '',
    signaturePlace: stored.signaturePlace ?? '',
  };
}

/** Vista previa HTML fiel a la estructura del PDF. */
function PreviewBlocks({ blocks }: { blocks: DocBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        const key = `${block.kind}-${index}`;
        switch (block.kind) {
          case 'title':
            return <h3 key={key}>{block.text}</h3>;
          case 'heading':
            return <h4 key={key}>{block.text}</h4>;
          case 'subheading':
            return <p key={key} className="text-strong">{block.text}</p>;
          case 'paragraph':
          case 'bullet':
          case 'callout': {
            const content = block.segments.map((segment, segIndex) => (segment.bold ? <strong key={segIndex}>{segment.text}</strong> : <span key={segIndex}>{segment.text}</span>));
            if (block.kind === 'bullet') return <p key={key}>• {content}</p>;
            if (block.kind === 'callout') return <Notice key={key} tone="info">{content}</Notice>;
            return <p key={key}>{content}</p>;
          }
          case 'group':
            return <PreviewBlocks key={key} blocks={block.blocks} />;
          default:
            return null;
        }
      })}
    </>
  );
}

export function ReferralReportEditor({ visitId }: Props) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [originVisitId, setOriginVisitId] = useState(visitId);
  const [draft, setDraft] = useState<ReferralDraft | null>(null);
  const [medicationNames, setMedicationNames] = useState<string[]>([]);
  const [loadingOrigin, setLoadingOrigin] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  // Paciente y visitas: una vez por visita de partida.
  useEffect(() => {
    void (async () => {
      const visitResult = await getVisitById(visitId);
      const patientId = visitResult.data?.patient_id;
      if (!patientId) {
        setErrorMessage(visitResult.errorMessage ?? 'No se pudo resolver el paciente de la visita.');
        return;
      }
      const [patientResult, visitsResult] = await Promise.all([getPatientById(patientId), listVisitsByPatient(patientId)]);
      setPatient(patientResult.data);
      setVisits(visitsResult.data);
      setDraft(initialDraft(patientResult.data));
      setOriginVisitId(visitId);
    })();
  }, [visitId]);

  // Datos de la visita de origen: parámetros, intervenciones y medicación de ESA visita.
  useEffect(() => {
    if (!draft || visits.length === 0) return;
    const origin = visits.find((visit) => visit.id === originVisitId);
    if (!origin) return;
    setLoadingOrigin(true);
    void (async () => {
      const [assessmentResult, interventionsResult, medicationResult] = await Promise.all([
        getClinicalAssessmentByVisit(originVisitId),
        listInterventionsByVisit(originVisitId),
        listVisitMedicationSnapshot(originVisitId),
      ]);
      const registered: ReferralIntervention[] = (interventionsResult.data as Intervention[]).map((item) => ({
        id: item.id,
        text: interventionText(item),
        include: item.delivered === true,
      }));
      setMedicationNames(
        medicationResult.data.map((medication) =>
          [normalizeMedicationDisplayName(medication.medication_catalog?.display_name ?? ''), medication.dose_text].filter(Boolean).join(' '),
        ),
      );
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              originVisitLabel: visitLabel(origin),
              parameters: buildParameterOptions((assessmentResult.data ?? null) as Record<string, number | string | null> | null),
              registeredInterventions: registered,
            }
          : prev,
      );
      setErrorMessage(assessmentResult.errorMessage ?? interventionsResult.errorMessage ?? medicationResult.errorMessage ?? null);
      setLoadingOrigin(false);
    })();
    // Solo al cambiar la visita de origen (no en cada edición del borrador).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originVisitId, visits]);

  const blocks = useMemo(() => (draft ? buildReferralBlocks(draft) : []), [draft]);

  if (!draft) {
    return errorMessage ? <Notice tone="danger">{errorMessage}</Notice> : <p className="help-text">Preparando el informe de derivación...</p>;
  }

  const set = <K extends keyof ReferralDraft>(key: K, value: ReferralDraft[K]) => setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  const setProblem = (id: string, patch: Partial<ReferralProblem>) =>
    setDraft((prev) => (prev ? { ...prev, problems: prev.problems.map((problem) => (problem.id === id ? { ...problem, ...patch } : problem)) } : prev));
  const moveProblem = (index: number, delta: number) =>
    setDraft((prev) => {
      if (!prev) return prev;
      const next = [...prev.problems];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, problems: next };
    });

  function handleGenerate() {
    if (!draft) return;
    const problems = validateReferralDraft(draft);
    setIssues(problems);
    if (problems.length > 0) return;
    storeSignature(draft);
    const pages = layoutDocument(buildReferralBlocks(draft), buildReferralChrome(draft, patient?.study_code ?? ''));
    const bytes = serializePdf(pages, 'Informe de derivación a Medicina de Atención Primaria');
    const blob = new Blob([bytes.slice().buffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `derivacion-map-${patient?.study_code ?? 'paciente'}-${draft.reportDate}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="card form-grid referral-editor" aria-labelledby="referral-title">
      <h2 id="referral-title">Informe de derivación a Medicina de Atención Primaria</h2>
      <Notice tone="info">
        Borrador editable: el contenido es responsabilidad del profesional y debe revisarse antes de generar el PDF. No se guarda en IRIS ni se envía a
        ningún servicio externo.
      </Notice>

      <h3>Encabezado</h3>
      <div className="grid-2">
        <label>
          Servicio o establecimiento
          <input value={draft.serviceName} onChange={(event) => set('serviceName', event.target.value)} />
        </label>
        <label>
          Profesionales responsables
          <input value={draft.professionals} onChange={(event) => set('professionals', event.target.value)} placeholder="Opcional" />
        </label>
        <label>
          Fecha del informe
          <input type="date" value={draft.reportDate} onChange={(event) => set('reportDate', event.target.value)} />
        </label>
        <label>
          Destinatario
          <input value={draft.recipient} onChange={(event) => set('recipient', event.target.value)} />
        </label>
        <label>
          Visita de origen
          <select value={originVisitId} onChange={(event) => setOriginVisitId(event.target.value)}>
            {visits.map((visit) => (
              <option key={visit.id} value={visit.id}>
                {visitLabel(visit)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label>
        Datos del paciente (solo los necesarios para la derivación)
        <textarea rows={3} value={draft.patientDetails} onChange={(event) => set('patientDetails', event.target.value)} />
      </label>

      <label>
        Motivo de derivación *
        <textarea rows={2} value={draft.reason} onChange={(event) => set('reason', event.target.value)} />
      </label>

      <fieldset className="form-grid">
        <legend>Parámetros clínicos de la visita de origen{loadingOrigin ? ' (cargando…)' : ''}</legend>
        {draft.parameters.length === 0 ? (
          <p className="help-text">No constan parámetros clínicos registrados en esta visita.</p>
        ) : (
          <div className="grid-2">
            {draft.parameters.map((parameter) => (
              <label key={parameter.key} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={parameter.include}
                  onChange={(event) =>
                    set('parameters', draft.parameters.map((item) => (item.key === parameter.key ? { ...item, include: event.target.checked } : item)))
                  }
                />
                {parameter.label}: {parameter.valueText}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <h3>Problemas detectados</h3>
      <datalist id="referral-medications">
        {medicationNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      {draft.problems.map((problem, index) => (
        <fieldset key={problem.id} className="form-grid">
          <legend>Problema {index + 1}</legend>
          <div className="grid-2">
            <label>
              Título del problema *
              <input value={problem.title} onChange={(event) => setProblem(problem.id, { title: event.target.value })} />
            </label>
            <label>
              Prioridad clínica (criterio del profesional)
              <select value={problem.priority} onChange={(event) => setProblem(problem.id, { priority: event.target.value as ReferralPriority })}>
                {REFERRAL_PRIORITY_OPTIONS.map((option) => (
                  <option key={option || 'none'} value={option}>
                    {option || 'Sin indicar'}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Hallazgos clínicos relevantes (diferenciar datos objetivos e información referida)
            <textarea rows={3} value={problem.findings} onChange={(event) => setProblem(problem.id, { findings: event.target.value })} />
          </label>
          <div className="grid-2">
            <label>
              Medicamentos relacionados
              <input list="referral-medications" value={problem.relatedMedications} onChange={(event) => setProblem(problem.id, { relatedMedications: event.target.value })} />
            </label>
            <label>
              Evidencia disponible y limitaciones
              <input value={problem.evidence} onChange={(event) => setProblem(problem.id, { evidence: event.target.value })} />
            </label>
          </div>
          <div className="grid-2">
            <label>
              Intervención farmacéutica YA realizada
              <textarea rows={2} value={problem.interventionDone} onChange={(event) => setProblem(problem.id, { interventionDone: event.target.value })} />
            </label>
            <label>
              Propuesta para valoración médica
              <textarea rows={2} value={problem.proposal} onChange={(event) => setProblem(problem.id, { proposal: event.target.value })} />
            </label>
          </div>
          <div className="actions-inline">
            <label className="checkbox-row">
              <input type="checkbox" checked={problem.include} onChange={(event) => setProblem(problem.id, { include: event.target.checked })} />
              Incluir en el informe
            </label>
            <button type="button" className="button-secondary button-sm" onClick={() => moveProblem(index, -1)} disabled={index === 0}>
              Subir
            </button>
            <button type="button" className="button-secondary button-sm" onClick={() => moveProblem(index, 1)} disabled={index === draft.problems.length - 1}>
              Bajar
            </button>
            <button
              type="button"
              className="button-secondary button-sm"
              onClick={() => set('problems', draft.problems.filter((item) => item.id !== problem.id))}
              disabled={draft.problems.length === 1}
            >
              Quitar
            </button>
          </div>
        </fieldset>
      ))}
      <div className="actions-inline">
        <button
          type="button"
          className="button-secondary"
          onClick={() => set('problems', [...draft.problems, emptyProblem(`p${Date.now()}`)])}
        >
          Añadir problema
        </button>
      </div>

      <fieldset className="form-grid">
        <legend>Intervenciones registradas en la visita de origen</legend>
        <p className="help-text">Marca solo las efectivamente realizadas. Puedes editar el texto que aparecerá en el informe.</p>
        {draft.registeredInterventions.length === 0 ? (
          <p className="help-text">No constan intervenciones registradas en esta visita.</p>
        ) : (
          draft.registeredInterventions.map((item) => (
            <div key={item.id} className="actions-inline">
              <input
                type="checkbox"
                aria-label="Incluir intervención"
                checked={item.include}
                onChange={(event) =>
                  set('registeredInterventions', draft.registeredInterventions.map((entry) => (entry.id === item.id ? { ...entry, include: event.target.checked } : entry)))
                }
              />
              <input
                style={{ flex: 1 }}
                value={item.text}
                aria-label="Texto de la intervención"
                onChange={(event) =>
                  set('registeredInterventions', draft.registeredInterventions.map((entry) => (entry.id === item.id ? { ...entry, text: event.target.value } : entry)))
                }
              />
            </div>
          ))
        )}
      </fieldset>

      <label>
        Otras propuestas para valoración médica (una por línea)
        <textarea rows={2} value={draft.generalProposals} onChange={(event) => set('generalProposals', event.target.value)} />
      </label>
      <label>
        Conclusión
        <textarea rows={3} value={draft.conclusion} onChange={(event) => set('conclusion', event.target.value)} />
      </label>
      <label>
        Seguimiento propuesto
        <input value={draft.followUp} onChange={(event) => set('followUp', event.target.value)} />
      </label>

      <h3>Firma profesional</h3>
      <div className="grid-2">
        <label>
          Nombre del profesional *
          <input value={draft.signatureName} onChange={(event) => set('signatureName', event.target.value)} />
        </label>
        <label>
          N.º de colegiado/a
          <input value={draft.signatureLicense} onChange={(event) => set('signatureLicense', event.target.value)} placeholder="Si procede" />
        </label>
        <label>
          Localidad
          <input value={draft.signaturePlace} onChange={(event) => set('signaturePlace', event.target.value)} />
        </label>
      </div>

      {issues.length > 0 ? (
        <Notice tone="warning">
          {issues.map((issue) => (
            <div key={issue}>{issue}</div>
          ))}
        </Notice>
      ) : null}
      {errorMessage ? <Notice tone="warning">{errorMessage}</Notice> : null}

      <div className="form-actions">
        <button type="button" className="button-secondary" onClick={() => setShowPreview((prev) => !prev)}>
          {showPreview ? 'Ocultar vista previa' : 'Revisar informe completo'}
        </button>
        <button type="button" onClick={handleGenerate}>
          Generar PDF
        </button>
      </div>

      {showPreview ? (
        <article className="panel-summary" aria-label="Vista previa del informe">
          <PreviewBlocks blocks={blocks} />
        </article>
      ) : null}
    </section>
  );
}
