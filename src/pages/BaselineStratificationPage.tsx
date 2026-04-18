import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { SMOKER_STATUS_OPTIONS } from '../constants/enums';
import type { SmokerStatus } from '../constants/enums';
import { ErrorState } from '../components/common/ErrorState';
import {
  getClinicalAssessmentByVisit,
  upsertClinicalAssessment,
  type NewClinicalAssessmentInput,
} from '../services/assessmentService';
import { scoreCmo, type CmoLevel, type CmoScoringInput, type CmoScoringResult } from '../services/cmoScoringEngine';
import { upsertCmoScore } from '../services/cmoScoreService';
import { getPatientById } from '../services/patientService';
import { getVisitById } from '../services/visitService';

function toNumber(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toSmokerStatus(value: string): SmokerStatus | null {
  return value === 'never' || value === 'former' || value === 'current' || value === 'unknown' ? value : null;
}

function toSex(value: string): CmoScoringInput['sex'] {
  if (value === 'male' || value === 'female' || value === 'other') return value;
  return null;
}

const LEVEL_META: Record<CmoLevel, { label: string; color: string; bg: string; border: string }> = {
  1: { label: 'Nivel 1 · Prioridad',  color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
  2: { label: 'Nivel 2 · Intermedio', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  3: { label: 'Nivel 3 · Basal',      color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
};

const NUMERIC_FIELDS: [string, string][] = [
  ['systolic_bp',          'TA sistólica (mmHg)'],
  ['diastolic_bp',         'TA diastólica (mmHg)'],
  ['heart_rate',           'FC (lpm)'],
  ['weight_kg',            'Peso (kg)'],
  ['height_cm',            'Talla (cm)'],
  ['bmi',                  'IMC (kg/m²)'],
  ['waist_cm',             'Cintura (cm)'],
  ['ldl_mg_dl',            'LDL (mg/dL)'],
  ['hdl_mg_dl',            'HDL (mg/dL)'],
  ['non_hdl_mg_dl',        'No-HDL (mg/dL)'],
  ['fasting_glucose_mg_dl','Glucosa (mg/dL)'],
  ['hba1c_pct',            'HbA1c (%)'],
  ['score2_value',         'SCORE2 (%)'],
  ['framingham_value',     'Framingham (%)'],
  ['diet_score',           'Dieta (0–10)'],
  ['adverse_events_count', 'Eventos adversos'],
];

const PHYSICAL_ACTIVITY_LEVEL_OPTIONS = [
  { value: 'low', label: 'Baja' },
  { value: 'moderate', label: 'Moderada' },
  { value: 'high', label: 'Alta' },
  { value: 'unknown', label: 'Desconocida' },
] as const;

const ALCOHOL_USE_OPTIONS = [
  { value: 'none', label: 'No' },
  { value: 'occasional', label: 'Ocasional' },
  { value: 'moderate', label: 'Moderado' },
  { value: 'high', label: 'Alto' },
  { value: 'unknown', label: 'Desconocido' },
] as const;

export function BaselineStratificationPage() {
  const { visitId = '' } = useParams();
  const [visitPatientId, setVisitPatientId] = useState<string>('');
  const [form, setForm] = useState<Record<string, string>>({ smoker_status: 'unknown' });
  const [highRiskMedicationPresent, setHighRiskMedicationPresent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    async function loadCurrent() {
      const [visitRes, assessmentRes] = await Promise.all([
        getVisitById(visitId),
        getClinicalAssessmentByVisit(visitId),
      ]);

      const patientId = visitRes.data?.patient_id ?? '';
      if (patientId) setVisitPatientId(patientId);
      if (assessmentRes.errorMessage) setErrorMessage(assessmentRes.errorMessage);

      const patientRes = patientId ? await getPatientById(patientId) : { data: null };
      const rawSex = patientRes.data?.sex ?? '';
      const defaultSex = (rawSex === 'male' || rawSex === 'female' || rawSex === 'other') ? rawSex : '';

      if (assessmentRes.data) {
        const v = assessmentRes.data;
        setForm({
          systolic_bp:           String(v.systolic_bp ?? ''),
          diastolic_bp:          String(v.diastolic_bp ?? ''),
          heart_rate:            String(v.heart_rate ?? ''),
          weight_kg:             String(v.weight_kg ?? ''),
          height_cm:             String(v.height_cm ?? ''),
          bmi:                   String(v.bmi ?? ''),
          waist_cm:              String(v.waist_cm ?? ''),
          ldl_mg_dl:             String(v.ldl_mg_dl ?? ''),
          hdl_mg_dl:             String(v.hdl_mg_dl ?? ''),
          non_hdl_mg_dl:         String(v.non_hdl_mg_dl ?? ''),
          fasting_glucose_mg_dl: String(v.fasting_glucose_mg_dl ?? ''),
          hba1c_pct:             String(v.hba1c_pct ?? ''),
          score2_value:          String(v.score2_value ?? ''),
          framingham_value:      String(v.framingham_value ?? ''),
          smoker_status:         v.smoker_status ?? 'unknown',
          sex:                   defaultSex,
          physical_activity_level: v.physical_activity_level ?? '',
          alcohol_use:           v.alcohol_use ?? '',
          diet_score:            String(v.diet_score ?? ''),
          safety_incidents:      v.safety_incidents ?? '',
          adverse_events_count:  String(v.adverse_events_count ?? ''),
        });
        setHighRiskMedicationPresent(Boolean(v.high_risk_medication_present));
      } else if (defaultSex) {
        setForm((prev: Record<string, string>) => ({ ...prev, sex: defaultSex }));
      }
    }
    void loadCurrent();
  }, [visitId]);

  const field = (name: string) => ({
    value: form[name] ?? '',
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev: Record<string, string>) => ({ ...prev, [name]: e.target.value })),
  });

  // Derived BMI (when weight + height given but BMI not manually entered).
  const computedBmi = useMemo<number | null>(() => {
    const bmiVal = toNumber(form.bmi ?? '');
    if (bmiVal) return bmiVal;
    const w = toNumber(form.weight_kg ?? '');
    const h = toNumber(form.height_cm ?? '');
    return w && h ? Number((w / (h / 100) ** 2).toFixed(1)) : null;
  }, [form.bmi, form.weight_kg, form.height_cm]);

  // Build scoring input from live form state — used for every render.
  const cmoInput = useMemo<CmoScoringInput>(() => ({
    score2:               toNumber(form.score2_value ?? ''),
    framingham:           toNumber(form.framingham_value ?? ''),
    systolicBp:           toNumber(form.systolic_bp ?? ''),
    ldl:                  toNumber(form.ldl_mg_dl ?? ''),
    hba1c:                toNumber(form.hba1c_pct ?? ''),
    bmi:                  computedBmi,
    waistCm:              toNumber(form.waist_cm ?? ''),
    sex:                  toSex(form.sex ?? ''),
    smoker:               form.smoker_status === 'current' ? true : form.smoker_status === 'never' || form.smoker_status === 'former' ? false : null,
    physicalActivityLevel: form.physical_activity_level || null,
    dietScore:            toNumber(form.diet_score ?? ''),
    highRiskMedication:   highRiskMedicationPresent,
    adverseEventsCount:   toNumber(form.adverse_events_count ?? ''),
  }), [form, computedBmi, highRiskMedicationPresent]);

  const cmoResult: CmoScoringResult = useMemo(() => scoreCmo(cmoInput), [cmoInput]);
  const meta = LEVEL_META[cmoResult.level];

  // Payload for DB persistence — cv_risk_level always reflects the live score.
  const assessmentPayload = useMemo<NewClinicalAssessmentInput>(() => ({
    visit_id:                  visitId,
    systolic_bp:               toNumber(form.systolic_bp ?? ''),
    diastolic_bp:              toNumber(form.diastolic_bp ?? ''),
    heart_rate:                toNumber(form.heart_rate ?? ''),
    weight_kg:                 toNumber(form.weight_kg ?? ''),
    height_cm:                 toNumber(form.height_cm ?? ''),
    bmi:                       computedBmi,
    waist_cm:                  toNumber(form.waist_cm ?? ''),
    ldl_mg_dl:                 toNumber(form.ldl_mg_dl ?? ''),
    hdl_mg_dl:                 toNumber(form.hdl_mg_dl ?? ''),
    non_hdl_mg_dl:             toNumber(form.non_hdl_mg_dl ?? ''),
    fasting_glucose_mg_dl:     toNumber(form.fasting_glucose_mg_dl ?? ''),
    hba1c_pct:                 toNumber(form.hba1c_pct ?? ''),
    score2_value:              toNumber(form.score2_value ?? ''),
    framingham_value:          toNumber(form.framingham_value ?? ''),
    cv_risk_level:             String(cmoResult.level),
    smoker_status:             toSmokerStatus(form.smoker_status ?? ''),
    alcohol_use:               form.alcohol_use || null,
    physical_activity_level:   form.physical_activity_level || null,
    diet_score:                toNumber(form.diet_score ?? ''),
    safety_incidents:          form.safety_incidents || null,
    adverse_events_count:      toNumber(form.adverse_events_count ?? ''),
    high_risk_medication_present: highRiskMedicationPresent,
  }), [form, computedBmi, cmoResult.level, highRiskMedicationPresent, visitId]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    // Temporal para verificar payload real enviado a Supabase.
    console.log(assessmentPayload);
    const { errorMessage: assessErr } = await upsertClinicalAssessment(assessmentPayload);
    if (assessErr) {
      setErrorMessage(assessErr);
      setSaving(false);
      return;
    }

    const { errorMessage: scoreErr } = await upsertCmoScore(visitId, cmoResult);
    if (scoreErr) {
      setErrorMessage(scoreErr);
      setSaving(false);
      return;
    }

    setSaveSuccess(true);
    setSaving(false);
  };

  const hasFormData =
    (Object.values(form) as string[]).some((v) => v.trim() !== '') || highRiskMedicationPresent;

  return (
    <div className="page-stack">
      <section className="card">
        <h1>Estratificación basal</h1>

        {/* ── Live score banner ─────────────────────────────────────── */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: '1rem',
            padding: '0.65rem 1rem', borderRadius: '8px', marginBottom: '1rem',
            background: meta.bg, border: `1px solid ${meta.border}`,
          }}
        >
          <span
            style={{
              fontSize: '2rem', fontWeight: 700, lineHeight: 1,
              minWidth: '2.5ch', textAlign: 'center', color: meta.color,
            }}
          >
            {cmoResult.totalScore}
          </span>
          <div>
            <div style={{ fontWeight: 700, color: meta.color }}>{meta.label}</div>
            <div className="help-text" style={{ fontSize: '0.8rem', marginTop: '0.1rem' }}>
              puntos CMO-RCV · actualizado en tiempo real
            </div>
          </div>
        </div>

        <form className="form-grid" onSubmit={handleSave}>
          {/* ── Clinical parameters ──────────────────────────────────── */}
          <div>
            <p className="help-text" style={{ fontSize: '0.8rem', marginBottom: '0.5rem', fontWeight: 600 }}>
              PARÁMETROS CLÍNICOS
            </p>
            <div className="grid-2">
              {NUMERIC_FIELDS.map(([name, label]) => (
                <label key={name}>
                  {label}
                  <input {...field(name)} inputMode="decimal" />
                </label>
              ))}
            </div>
          </div>

          {/* ── Contextual / behavioural factors ────────────────────── */}
          <div>
            <p className="help-text" style={{ fontSize: '0.8rem', marginBottom: '0.5rem', fontWeight: 600 }}>
              FACTORES CONTEXTUALES
            </p>
            <div className="grid-2">
              <label>
                Sexo biológico
                <select {...field('sex')}>
                  <option value="">Sin especificar</option>
                  <option value="male">Varón</option>
                  <option value="female">Mujer</option>
                  <option value="other">Otro</option>
                </select>
              </label>

              <label>
                Tabaquismo
                <select {...field('smoker_status')}>
                  <option value="">Seleccionar</option>
                  {SMOKER_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>

              <label>
                Actividad física
                <select {...field('physical_activity_level')}>
                  <option value="">Sin especificar</option>
                  {PHYSICAL_ACTIVITY_LEVEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>

              <label>
                Alcohol
                <select {...field('alcohol_use')}>
                  <option value="">Sin especificar</option>
                  {ALCOHOL_USE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>

              <label>
                Incidentes de seguridad
                <textarea rows={3} {...field('safety_incidents')} />
              </label>
            </div>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={highRiskMedicationPresent}
              onChange={(e) => setHighRiskMedicationPresent(e.target.checked)}
            />
            Medicación de alto riesgo presente
          </label>

          <button type="submit" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar evaluación'}
          </button>
        </form>

        {saveSuccess ? (
          <div
            style={{
              marginTop: '0.75rem', padding: '0.65rem 1rem', borderRadius: '8px',
              background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d',
              fontWeight: 600, fontSize: '0.9rem',
            }}
          >
            Evaluación y puntuación CMO guardadas correctamente.
          </div>
        ) : null}
        {errorMessage ? (
          <ErrorState title="No se pudo guardar evaluación" message={errorMessage} />
        ) : null}
      </section>

      {/* ── Scoring breakdown ─────────────────────────────────────────── */}
      {hasFormData ? (
        <section className="card">
          <h2 style={{ marginBottom: '0.75rem' }}>Factores contribuyentes</h2>

          {cmoResult.triggeredVariables.length === 0 ? (
            <p className="help-text">Ningún factor activo con los datos introducidos.</p>
          ) : (
            <ul className="simple-list">
              {cmoResult.triggeredVariables.map((v) => (
                <li key={v.code}>
                  <span>{v.rationale}</span>
                  <strong style={{ color: meta.color }}>+{v.points}</strong>
                </li>
              ))}
            </ul>
          )}

          <div className="actions-inline" style={{ marginTop: '1rem' }}>
            <Link className="button-link" to={`/visits/${visitId}/interventions`}>
              Registrar intervenciones
            </Link>
            {visitPatientId ? (
              <Link to={`/patients/${visitPatientId}`}>Volver a paciente</Link>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
