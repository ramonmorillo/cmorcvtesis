import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { VisitTabs } from '../components/common/VisitTabs';
import { getVisitTypeLabel } from '../constants/enums';
import {
  isQuestionnaireVisitType,
  listQuestionnairesByVisit,
  saveQuestionnaireBundle,
  type QuestionnaireResponseRecord,
  type QuestionnaireResponseUpsertInput,
} from '../services/questionnaireService';
import { getVisitById } from '../services/visitService';

const IEXPAC_ITEM_KEYS = Array.from({ length: 11 }, (_, idx) => `q${idx + 1}` as const);
const EQ5D_DIMENSIONS = ['mobility', 'selfcare', 'activities', 'pain', 'anxiety'] as const;

type LikertValue = 1 | 2 | 3 | 4 | 5;

type IexpacForm = Record<(typeof IEXPAC_ITEM_KEYS)[number], '' | `${LikertValue}`> & { q12: '' | `${LikertValue}` };
type MoriskyForm = { q1: '' | 'yes' | 'no'; q2: '' | 'yes' | 'no'; q3: '' | 'yes' | 'no'; q4: '' | 'yes' | 'no' };
type Eq5dForm = Record<(typeof EQ5D_DIMENSIONS)[number], '' | `${LikertValue}`> & { vas: '' | string };

const LIKERT_LABELS: Array<{ value: LikertValue; label: string }> = [
  { value: 1, label: 'Nunca' },
  { value: 2, label: 'Casi nunca' },
  { value: 3, label: 'A veces' },
  { value: 4, label: 'Casi siempre' },
  { value: 5, label: 'Siempre' },
];

const IEXPAC_QUESTIONS = [
  'Me ayudan a cumplir el plan de tratamiento.',
  'Resuelven mis dudas cuando lo necesito.',
  'Tengo información clara para manejar mi problema de salud.',
  'Siento que coordinan bien mi atención entre profesionales.',
  'Me animan a participar en decisiones sobre mi salud.',
  'Revisan conmigo cómo va el tratamiento en cada visita.',
  'Me explican de forma comprensible los cambios de medicación.',
  'Recibo apoyo para mejorar hábitos de salud.',
  'Me siento acompañado/a en el seguimiento de mi enfermedad.',
  'Puedo contactar con el equipo cuando aparece una incidencia.',
  'Percibo continuidad y organización en mi atención.',
] as const;

function parseLikert(value: string): LikertValue | null {
  if (value === '1' || value === '2' || value === '3' || value === '4' || value === '5') {
    return Number(value) as LikertValue;
  }
  return null;
}

function calculateIexpac(form: IexpacForm): { totalScore: number; secondaryScore: number | null; responses: Record<string, number> } | null {
  const responses: Record<string, number> = {};
  let sum = 0;

  for (const key of IEXPAC_ITEM_KEYS) {
    const value = parseLikert(form[key]);
    if (value === null) return null;
    responses[key] = value;
    sum += value;
  }

  const globalScore = Number((10 * (sum - 11) / 44).toFixed(2));
  const q12 = parseLikert(form.q12);

  if (q12 !== null) {
    responses.q12 = q12;
  }

  return {
    totalScore: globalScore,
    secondaryScore: q12,
    responses,
  };
}

function calculateMorisky(form: MoriskyForm): { totalScore: number; responses: Record<string, boolean>; adherenceLabel: string } | null {
  if (!form.q1 || !form.q2 || !form.q3 || !form.q4) return null;

  const answers = {
    q1: form.q1 === 'yes',
    q2: form.q2 === 'yes',
    q3: form.q3 === 'yes',
    q4: form.q4 === 'yes',
  };

  const adherent = form.q1 === 'no' && form.q2 === 'yes' && form.q3 === 'no' && form.q4 === 'no';

  return {
    totalScore: adherent ? 1 : 0,
    responses: answers,
    adherenceLabel: adherent ? 'Alta adherencia' : 'Baja adherencia',
  };
}

function calculateEq5d(form: Eq5dForm): { totalScore: number | null; secondaryScore: number; responses: Record<string, unknown>; profile: string } | null {
  const dimensionScores = EQ5D_DIMENSIONS.map((dimension) => parseLikert(form[dimension]));
  if (dimensionScores.some((x) => x === null)) return null;

  const vasRaw = Number(form.vas);
  if (!Number.isFinite(vasRaw) || vasRaw < 0 || vasRaw > 100) return null;

  const values = dimensionScores as LikertValue[];
  const profile = values.join('');

  return {
    totalScore: null,
    secondaryScore: vasRaw,
    responses: {
      mobility: values[0],
      selfcare: values[1],
      activities: values[2],
      pain: values[3],
      anxiety: values[4],
      vas: vasRaw,
      profile,
    },
    profile,
  };
}

function hydrateIexpac(record: QuestionnaireResponseRecord | undefined): IexpacForm {
  const r = record?.responses ?? {};
  const out: IexpacForm = {
    q1: '', q2: '', q3: '', q4: '', q5: '', q6: '', q7: '', q8: '', q9: '', q10: '', q11: '', q12: '',
  };

  IEXPAC_ITEM_KEYS.forEach((key) => {
    const v = r[key];
    if (v === 1 || v === 2 || v === 3 || v === 4 || v === 5) {
      out[key] = String(v) as `${LikertValue}`;
    }
  });

  const q12 = r.q12;
  if (q12 === 1 || q12 === 2 || q12 === 3 || q12 === 4 || q12 === 5) {
    out.q12 = String(q12) as `${LikertValue}`;
  }

  return out;
}

function hydrateMorisky(record: QuestionnaireResponseRecord | undefined): MoriskyForm {
  const r = record?.responses ?? {};
  const toYesNo = (value: unknown): '' | 'yes' | 'no' => {
    if (value === true) return 'yes';
    if (value === false) return 'no';
    return '';
  };

  return {
    q1: toYesNo(r.q1),
    q2: toYesNo(r.q2),
    q3: toYesNo(r.q3),
    q4: toYesNo(r.q4),
  };
}

function hydrateEq5d(record: QuestionnaireResponseRecord | undefined): Eq5dForm {
  const r = record?.responses ?? {};
  const parseDimension = (value: unknown): '' | `${LikertValue}` => {
    if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) {
      return String(value) as `${LikertValue}`;
    }
    return '';
  };

  return {
    mobility: parseDimension(r.mobility),
    selfcare: parseDimension(r.selfcare),
    activities: parseDimension(r.activities),
    pain: parseDimension(r.pain),
    anxiety: parseDimension(r.anxiety),
    vas: typeof r.vas === 'number' && Number.isFinite(r.vas) ? String(r.vas) : '',
  };
}

export function VisitQuestionnairesPage() {
  const { visitId = '' } = useParams();
  const [visitPatientId, setVisitPatientId] = useState('');
  const [visitType, setVisitType] = useState<string | null>(null);
  const [iexpacForm, setIexpacForm] = useState<IexpacForm>({ q1: '', q2: '', q3: '', q4: '', q5: '', q6: '', q7: '', q8: '', q9: '', q10: '', q11: '', q12: '' });
  const [moriskyForm, setMoriskyForm] = useState<MoriskyForm>({ q1: '', q2: '', q3: '', q4: '' });
  const [eq5dForm, setEq5dForm] = useState<Eq5dForm>({ mobility: '', selfcare: '', activities: '', pain: '', anxiety: '', vas: '' });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const questionnaireEnabled = isQuestionnaireVisitType(visitType);

  const iexpacMetrics = useMemo(() => calculateIexpac(iexpacForm), [iexpacForm]);
  const moriskyMetrics = useMemo(() => calculateMorisky(moriskyForm), [moriskyForm]);
  const eq5dMetrics = useMemo(() => calculateEq5d(eq5dForm), [eq5dForm]);

  useEffect(() => {
    async function loadData() {
      const [visitRes, responsesRes] = await Promise.all([
        getVisitById(visitId),
        listQuestionnairesByVisit(visitId),
      ]);

      if (visitRes.data) {
        setVisitPatientId(visitRes.data.patient_id);
        setVisitType(visitRes.data.visit_type);
      }

      if (responsesRes.errorMessage) {
        setErrorMessage(responsesRes.errorMessage);
      }

      const byType = new Map(responsesRes.data.map((record) => [record.questionnaire_type, record]));
      setIexpacForm(hydrateIexpac(byType.get('iexpac')));
      setMoriskyForm(hydrateMorisky(byType.get('morisky')));
      setEq5dForm(hydrateEq5d(byType.get('eq5d')));
    }

    void loadData();
  }, [visitId]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!visitPatientId || !visitType) {
      setErrorMessage('No se pudo resolver la visita. Recarga e inténtalo de nuevo.');
      return;
    }

    if (!questionnaireEnabled) {
      setErrorMessage('Los cuestionarios solo están disponibles en visitas basal/final.');
      return;
    }

    if (!iexpacMetrics || !moriskyMetrics || !eq5dMetrics) {
      setErrorMessage('Completa todos los campos obligatorios de IEXPAC, Morisky y EQ-5D-5L.');
      return;
    }

    const payload: QuestionnaireResponseUpsertInput[] = [
      {
        visit_id: visitId,
        questionnaire_type: 'iexpac',
        responses: iexpacMetrics.responses,
        total_score: iexpacMetrics.totalScore,
        secondary_score: iexpacMetrics.secondaryScore,
      },
      {
        visit_id: visitId,
        questionnaire_type: 'morisky',
        responses: moriskyMetrics.responses,
        total_score: moriskyMetrics.totalScore,
        secondary_score: null,
      },
      {
        visit_id: visitId,
        questionnaire_type: 'eq5d',
        responses: eq5dMetrics.responses,
        total_score: eq5dMetrics.totalScore,
        secondary_score: eq5dMetrics.secondaryScore,
      },
    ];

    setSaving(true);
    const result = await saveQuestionnaireBundle(payload);
    setSaving(false);

    if (result.errorMessage) {
      setErrorMessage(result.errorMessage);
      return;
    }

    const refreshed = await listQuestionnairesByVisit(visitId);
    if (refreshed.errorMessage) {
      setErrorMessage(refreshed.errorMessage);
      return;
    }

    const refreshedByType = new Map(refreshed.data.map((record) => [record.questionnaire_type, record]));
    setIexpacForm(hydrateIexpac(refreshedByType.get('iexpac')));
    setMoriskyForm(hydrateMorisky(refreshedByType.get('morisky')));
    setEq5dForm(hydrateEq5d(refreshedByType.get('eq5d')));
    setSuccessMessage('Cuestionarios guardados correctamente.');
  };

  return (
    <div className="page-stack">
      <section className="card">
        <h1>Cuestionarios PRO</h1>
        <VisitTabs visitId={visitId} active="questionnaires" />

        <p className="help-text" style={{ marginTop: '0.75rem' }}>
          Visita actual: <strong>{getVisitTypeLabel(visitType)}</strong>
        </p>

        {!questionnaireEnabled ? (
          <p className="help-text" style={{ marginTop: '0.75rem' }}>
            Este bloque solo aplica a visitas basal y final (Mes 12 provisional).
          </p>
        ) : null}
      </section>

      <section className="card">
        <form className="form-grid" onSubmit={handleSave}>
          <article className="questionnaire-card">
            <h2>IEXPAC</h2>
            <p className="help-text">11 ítems obligatorios + 12 opcional. Escala 1–5.</p>
            <div className="questionnaire-grid">
              {IEXPAC_QUESTIONS.map((question, index) => {
                const key = `q${index + 1}` as (typeof IEXPAC_ITEM_KEYS)[number];
                return (
                  <div key={key}>
                    <p style={{ marginBottom: '0.35rem', fontWeight: 600 }}>{index + 1}. {question}</p>
                    <div className="radio-row">
                      {LIKERT_LABELS.map((item) => (
                        <label key={item.value} className="radio-inline">
                          <input
                            type="radio"
                            name={`iexpac-${key}`}
                            value={item.value}
                            checked={iexpacForm[key] === String(item.value)}
                            onChange={(e) => setIexpacForm((prev) => ({ ...prev, [key]: e.target.value as `${LikertValue}` }))}
                            disabled={!questionnaireEnabled}
                          />
                          {item.value} · {item.label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}

              <div>
                <p style={{ marginBottom: '0.35rem', fontWeight: 600 }}>12. Tras alta hospitalaria, ¿hubo continuidad asistencial? (opcional)</p>
                <div className="radio-row">
                  <label className="radio-inline">
                    <input
                      type="radio"
                      name="iexpac-q12-empty"
                      checked={iexpacForm.q12 === ''}
                      onChange={() => setIexpacForm((prev) => ({ ...prev, q12: '' }))}
                      disabled={!questionnaireEnabled}
                    />
                    Sin respuesta
                  </label>
                  {LIKERT_LABELS.map((item) => (
                    <label key={item.value} className="radio-inline">
                      <input
                        type="radio"
                        name="iexpac-q12"
                        value={item.value}
                        checked={iexpacForm.q12 === String(item.value)}
                        onChange={(e) => setIexpacForm((prev) => ({ ...prev, q12: e.target.value as `${LikertValue}` }))}
                        disabled={!questionnaireEnabled}
                      />
                      {item.value} · {item.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <p className="help-text" style={{ marginTop: '0.75rem' }}>
              Score global IEXPAC: <strong>{iexpacMetrics ? iexpacMetrics.totalScore.toFixed(2) : '-'}</strong> / 10
            </p>
          </article>

          <article className="questionnaire-card">
            <h2>Morisky-Green (4 ítems)</h2>
            <div className="questionnaire-grid">
              {[
                '¿Olvida alguna vez tomar los medicamentos?',
                '¿Toma los medicamentos a la hora indicada?',
                'Cuando se encuentra bien, ¿deja de tomar la medicación?',
                'Si alguna vez le sientan mal, ¿deja usted de tomarlos?',
              ].map((question, idx) => {
                const key = `q${idx + 1}` as keyof MoriskyForm;

                return (
                  <label key={key}>
                    {question}
                    <select
                      value={moriskyForm[key]}
                      onChange={(e) => setMoriskyForm((prev) => ({ ...prev, [key]: e.target.value as 'yes' | 'no' | '' }))}
                      disabled={!questionnaireEnabled}
                    >
                      <option value="">Seleccionar</option>
                      <option value="yes">Sí</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                );
              })}
            </div>

            <p className="help-text" style={{ marginTop: '0.75rem' }}>
              Estado adherencia:{' '}
              <span className={moriskyMetrics?.totalScore === 1 ? 'badge-success' : 'badge-muted'}>
                {moriskyMetrics?.adherenceLabel ?? 'Pendiente'}
              </span>
            </p>
          </article>

          <article className="questionnaire-card">
            <h2>EQ-5D-5L (España)</h2>
            <div className="questionnaire-grid">
              {[
                ['mobility', 'Movilidad'],
                ['selfcare', 'Autocuidado'],
                ['activities', 'Actividades cotidianas'],
                ['pain', 'Dolor/Malestar'],
                ['anxiety', 'Ansiedad/Depresión'],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <select
                    value={eq5dForm[key as keyof typeof eq5dForm] as string}
                    onChange={(e) => setEq5dForm((prev) => ({ ...prev, [key]: e.target.value as `${LikertValue}` | '' }))}
                    disabled={!questionnaireEnabled}
                  >
                    <option value="">Nivel</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                </label>
              ))}

              <label>
                VAS (0–100)
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={eq5dForm.vas}
                  onChange={(e) => setEq5dForm((prev) => ({ ...prev, vas: e.target.value }))}
                  disabled={!questionnaireEnabled}
                />
              </label>
            </div>

            <p className="help-text" style={{ marginTop: '0.75rem' }}>
              Perfil EQ-5D: <strong>{eq5dMetrics?.profile ?? '-'}</strong> · VAS: <strong>{eq5dMetrics?.secondaryScore ?? '-'}</strong>
            </p>
          </article>

          <button type="submit" disabled={!questionnaireEnabled || saving}>{saving ? 'Guardando...' : 'Guardar cuestionarios'}</button>
        </form>

        {successMessage ? <div className="success-state" style={{ marginTop: '0.8rem' }}>{successMessage}</div> : null}
        {errorMessage ? <ErrorState title="No se pudieron guardar los cuestionarios" message={errorMessage} /> : null}
      </section>

      <section className="card">
        <div className="actions-inline">
          <Link to={`/visits/${visitId}/stratification`}>Volver a datos clínicos</Link>
          <Link to={`/visits/${visitId}/interventions`}>Ir a intervenciones</Link>
          {visitPatientId ? <Link to={`/patients/${visitPatientId}`}>Volver a paciente</Link> : null}
        </div>
      </section>
    </div>
  );
}
