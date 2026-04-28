import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { SMOKER_STATUS_OPTIONS } from '../constants/enums';
import { ErrorState } from '../components/common/ErrorState';
import { VisitTabs } from '../components/common/VisitTabs';
import {
  type ClinicalAssessment,
  getClinicalAssessmentByVisit,
  getLatestPreviousClinicalAssessmentByPatient,
  upsertClinicalAssessment,
  type NewClinicalAssessmentInput,
} from '../services/assessmentService';
import { getPatientById } from '../services/patientService';
import {
  scoreCmo,
  type BiologicalSex,
  type CmoLevel,
  type CmoScoringInput,
  type CmoScoringResult,
  type EducationLevel,
  type PhysicalActivityPattern,
  type RaceEthnicityRisk,
  type SmokingStatus,
} from '../services/cmoScoringEngine';
import { upsertCmoScore } from '../services/cmoScoreService';
import { getVisitById } from '../services/visitService';

type YesNoUnknown = 'yes' | 'no' | 'unknown';

function toNumber(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNullableBoolean(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'yes' || normalized === 'sí' || normalized === 'si' || normalized === 'true') return true;
  if (normalized === 'no' || normalized === 'false') return false;
  if (normalized === 'unknown' || normalized === 'not_recorded' || normalized === '') return null;
  return null;
}

function toTriStatePayloadValue(value: unknown): 'yes' | 'no' | null {
  if (value === 'yes' || value === 'sí' || value === 'si' || value === true) return 'yes';
  if (value === 'no' || value === false) return 'no';
  if (value === 'unknown' || value === 'not_recorded' || value === '' || value === undefined || value === null) return null;
  return null;
}

function fromNullableBoolean(value: boolean | null | undefined): string {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return '';
}

function fromTriState(value: string | null | undefined): string {
  if (value === 'yes' || value === 'no' || value === 'unknown') return value;
  return '';
}

function yesNoUnknown(value: string): YesNoUnknown {
  if (value === 'yes' || value === 'no' || value === 'unknown') return value;
  return 'unknown';
}

function toEducationLevel(value: string): EducationLevel {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'unknown' ? value : 'unknown';
}

function toBiologicalSex(value: string): BiologicalSex {
  return value === 'female' || value === 'male' || value === 'other' || value === 'unknown' ? value : 'unknown';
}

function toRaceEthnicityRisk(value: string): RaceEthnicityRisk {
  return value === 'asian_non_chinese'
    || value === 'afro_caribbean'
    || value === 'afro_descendant_or_chinese'
    || value === 'other'
    || value === 'unknown'
    ? value
    : 'unknown';
}

function toSmokingStatus(value: string): SmokingStatus {
  return value === 'current' || value === 'former_recent' || value === 'never' || value === 'unknown' ? value : 'unknown';
}

function toPhysicalActivityPattern(value: string): PhysicalActivityPattern {
  return value === 'sedentary' || value === 'intense' || value === 'normal' || value === 'unknown' ? value : 'unknown';
}

const LEVEL_META: Record<CmoLevel, { label: string; color: string; bg: string; border: string }> = {
  1: { label: 'Nivel 1 · Prioridad', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
  2: { label: 'Nivel 2 · Intermedio', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  3: { label: 'Nivel 3 · Basal', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
};

const NUMERIC_FIELDS: [string, string][] = [
  ['non_hdl_mg_dl', 'No-HDL (mg/dL)'],
  ['systolic_bp', 'TA sistólica (mmHg)'],
  ['diastolic_bp', 'TA diastólica (mmHg)'],
  ['heart_rate', 'FC (lpm)'],
  ['weight_kg', 'Peso (kg)'],
  ['height_cm', 'Talla (cm)'],
  ['bmi', 'IMC (kg/m²)'],
  ['waist_cm', 'Cintura (cm)'],
  ['ldl_mg_dl', 'LDL (mg/dL)'],
  ['hdl_mg_dl', 'HDL (mg/dL)'],
  ['fasting_glucose_mg_dl', 'Glucosa (mg/dL)'],
  ['hba1c_pct', 'HbA1c (%)'],
  ['score2_value', 'SCORE2 (%)'],
  ['framingham_value', 'Framingham (%)'],
  ['diet_score', 'Dieta (0–10)'],
  ['adverse_events_count', 'Eventos adversos'],
];

const YES_NO_UNKNOWN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'yes', label: 'Sí' },
  { value: 'no', label: 'No' },
  { value: '', label: 'No registrado' },
];

function ageFromBirthAndInclusionDate(birthDate: string | null, inclusionDate: string | null): number | null {
  if (!birthDate || !inclusionDate) return null;
  const birth = new Date(birthDate);
  const inclusion = new Date(inclusionDate);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(inclusion.getTime())) return null;

  let age = inclusion.getFullYear() - birth.getFullYear();
  const monthDiff = inclusion.getMonth() - birth.getMonth();
  const hasNotHadBirthday = monthDiff < 0 || (monthDiff === 0 && inclusion.getDate() < birth.getDate());
  if (hasNotHadBirthday) age -= 1;
  return age >= 0 ? age : null;
}

export function BaselineStratificationPage() {
  const { visitId = '' } = useParams();
  const [visitPatientId, setVisitPatientId] = useState<string>('');
  const [resolvedAge, setResolvedAge] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>({
    smoker_status: '',
    education_level: '',
    pregnancy_postpartum: '',
    biological_sex: '',
    race_ethnicity_risk: '',
    hypertension_present: '',
    cv_pathology_present: '',
    comorbidities_present: '',
    recent_cvd_12m: '',
    hospital_er_use_12m: '',
    physical_activity_pattern: '',
    social_support_absent: '',
    psychosocial_stress: '',
    high_risk_medication_present_status: '',
    recent_regimen_change: '',
    regimen_complexity_present: '',
    adherence_problem: '',
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const applyAssessmentToForm = (assessment: ClinicalAssessment) => {
    setForm((prev) => ({
      ...prev,
      education_level: assessment.education_level ?? '',
      pregnancy_postpartum: fromTriState(assessment.pregnancy_postpartum),
      biological_sex: assessment.biological_sex ?? '',
      race_ethnicity_risk: assessment.race_ethnicity_risk ?? '',
      hypertension_present: fromTriState(assessment.hypertension_present),
      non_hdl_mg_dl: String(assessment.non_hdl_mg_dl ?? ''),
      cv_pathology_present: fromTriState(assessment.cv_pathology_present),
      comorbidities_present: fromTriState(assessment.comorbidities_present),
      recent_cvd_12m: fromTriState(assessment.recent_cvd_12m),
      hospital_er_use_12m: fromTriState(assessment.hospital_er_use_12m),
      smoker_status: assessment.smoker_status ?? '',
      physical_activity_pattern: assessment.physical_activity_pattern ?? '',
      social_support_absent: fromTriState(assessment.social_support_absent),
      psychosocial_stress: fromTriState(assessment.psychosocial_stress),
      chronic_med_count: String(assessment.chronic_med_count ?? ''),
      high_risk_medication_present_status: fromNullableBoolean(assessment.high_risk_medication_present),
      recent_regimen_change: fromTriState(assessment.recent_regimen_change),
      regimen_complexity_present: fromTriState(assessment.regimen_complexity_present),
      adherence_problem: fromTriState(assessment.adherence_problem),
      systolic_bp: String(assessment.systolic_bp ?? ''),
      diastolic_bp: String(assessment.diastolic_bp ?? ''),
      heart_rate: String(assessment.heart_rate ?? ''),
      weight_kg: String(assessment.weight_kg ?? ''),
      height_cm: String(assessment.height_cm ?? ''),
      bmi: String(assessment.bmi ?? ''),
      waist_cm: String(assessment.waist_cm ?? ''),
      ldl_mg_dl: String(assessment.ldl_mg_dl ?? ''),
      hdl_mg_dl: String(assessment.hdl_mg_dl ?? ''),
      fasting_glucose_mg_dl: String(assessment.fasting_glucose_mg_dl ?? ''),
      hba1c_pct: String(assessment.hba1c_pct ?? ''),
      score2_value: String(assessment.score2_value ?? ''),
      framingham_value: String(assessment.framingham_value ?? ''),
      diet_score: String(assessment.diet_score ?? ''),
      safety_incidents: assessment.safety_incidents ?? '',
      adverse_events_count: String(assessment.adverse_events_count ?? ''),
    }));
  };

  useEffect(() => {
    async function loadCurrent() {
      const [visitRes, assessmentRes] = await Promise.all([
        getVisitById(visitId),
        getClinicalAssessmentByVisit(visitId),
      ]);

      const patientId = visitRes.data?.patient_id ?? '';
      if (patientId) setVisitPatientId(patientId);
      if (assessmentRes.errorMessage) setErrorMessage(assessmentRes.errorMessage);

      if (patientId) {
        const patientRes = await getPatientById(patientId);
        if (patientRes.errorMessage) {
          setErrorMessage(patientRes.errorMessage);
        } else {
          const patient = patientRes.data;
          const derivedAge = patient?.age_at_inclusion ?? ageFromBirthAndInclusionDate(patient?.birth_date ?? null, patient?.inclusion_date ?? null);
          setResolvedAge(derivedAge);
        }
      } else {
        setResolvedAge(null);
      }

      if (assessmentRes.data) {
        applyAssessmentToForm(assessmentRes.data);
        return;
      }

      if (patientId) {
        const previousAssessmentRes = await getLatestPreviousClinicalAssessmentByPatient(patientId, visitId);
        if (previousAssessmentRes.errorMessage) {
          setErrorMessage(previousAssessmentRes.errorMessage);
          return;
        }

        if (previousAssessmentRes.data) {
          applyAssessmentToForm(previousAssessmentRes.data);
        }
      }
    }
    void loadCurrent();
  }, [visitId]);

  const field = (name: string) => ({
    value: form[name] ?? '',
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [name]: e.target.value })),
  });

  const computedBmi = useMemo<number | null>(() => {
    const bmiVal = toNumber(form.bmi ?? '');
    if (bmiVal) return bmiVal;
    const w = toNumber(form.weight_kg ?? '');
    const h = toNumber(form.height_cm ?? '');
    return w && h ? Number((w / (h / 100) ** 2).toFixed(1)) : null;
  }, [form.bmi, form.weight_kg, form.height_cm]);

  const cmoInput = useMemo<CmoScoringInput>(() => ({
    educationLevel: toEducationLevel(form.education_level ?? ''),
    age: resolvedAge,
    pregnancyPostpartum: yesNoUnknown(form.pregnancy_postpartum ?? ''),
    biologicalSex: toBiologicalSex(form.biological_sex ?? ''),
    raceEthnicityRisk: toRaceEthnicityRisk(form.race_ethnicity_risk ?? ''),
    hypertensionPresent: yesNoUnknown(form.hypertension_present ?? ''),
    nonHdlMgDl: toNumber(form.non_hdl_mg_dl ?? ''),
    cvPathologyPresent: yesNoUnknown(form.cv_pathology_present ?? ''),
    comorbiditiesPresent: yesNoUnknown(form.comorbidities_present ?? ''),
    recentCvd12m: yesNoUnknown(form.recent_cvd_12m ?? ''),
    hospitalErUse12m: yesNoUnknown(form.hospital_er_use_12m ?? ''),
    smokingStatus: toSmokingStatus(form.smoker_status ?? ''),
    physicalActivityPattern: toPhysicalActivityPattern(form.physical_activity_pattern ?? ''),
    socialSupportAbsent: yesNoUnknown(form.social_support_absent ?? ''),
    psychosocialStress: yesNoUnknown(form.psychosocial_stress ?? ''),
    chronicMedCount: toNumber(form.chronic_med_count ?? ''),
    highRiskMedicationPresent: yesNoUnknown(form.high_risk_medication_present_status ?? ''),
    recentRegimenChange: yesNoUnknown(form.recent_regimen_change ?? ''),
    regimenComplexityPresent: yesNoUnknown(form.regimen_complexity_present ?? ''),
    adherenceProblem: yesNoUnknown(form.adherence_problem ?? ''),
  }), [form, resolvedAge]);

  const cmoResult: CmoScoringResult = useMemo(() => scoreCmo(cmoInput), [cmoInput]);
  const meta = LEVEL_META[cmoResult.level];

  const assessmentPayload = useMemo<NewClinicalAssessmentInput>(() => ({
    visit_id: visitId,
    education_level: toEducationLevel(form.education_level ?? ''),
    pregnancy_postpartum: toTriStatePayloadValue(form.pregnancy_postpartum),
    biological_sex: toBiologicalSex(form.biological_sex ?? ''),
    race_ethnicity_risk: toRaceEthnicityRisk(form.race_ethnicity_risk ?? ''),
    hypertension_present: toTriStatePayloadValue(form.hypertension_present),
    cv_pathology_present: toTriStatePayloadValue(form.cv_pathology_present),
    comorbidities_present: toTriStatePayloadValue(form.comorbidities_present),
    recent_cvd_12m: toTriStatePayloadValue(form.recent_cvd_12m),
    hospital_er_use_12m: toTriStatePayloadValue(form.hospital_er_use_12m),
    physical_activity_pattern: toPhysicalActivityPattern(form.physical_activity_pattern ?? ''),
    social_support_absent: toTriStatePayloadValue(form.social_support_absent),
    psychosocial_stress: toTriStatePayloadValue(form.psychosocial_stress),
    chronic_med_count: toNumber(form.chronic_med_count ?? ''),
    recent_regimen_change: toTriStatePayloadValue(form.recent_regimen_change),
    regimen_complexity_present: toTriStatePayloadValue(form.regimen_complexity_present),
    adherence_problem: toTriStatePayloadValue(form.adherence_problem),
    systolic_bp: toNumber(form.systolic_bp ?? ''),
    diastolic_bp: toNumber(form.diastolic_bp ?? ''),
    heart_rate: toNumber(form.heart_rate ?? ''),
    weight_kg: toNumber(form.weight_kg ?? ''),
    height_cm: toNumber(form.height_cm ?? ''),
    bmi: computedBmi,
    waist_cm: toNumber(form.waist_cm ?? ''),
    ldl_mg_dl: toNumber(form.ldl_mg_dl ?? ''),
    hdl_mg_dl: toNumber(form.hdl_mg_dl ?? ''),
    non_hdl_mg_dl: toNumber(form.non_hdl_mg_dl ?? ''),
    fasting_glucose_mg_dl: toNumber(form.fasting_glucose_mg_dl ?? ''),
    hba1c_pct: toNumber(form.hba1c_pct ?? ''),
    score2_value: toNumber(form.score2_value ?? ''),
    framingham_value: toNumber(form.framingham_value ?? ''),
    cv_risk_level: String(cmoResult.level),
    smoker_status: toSmokingStatus(form.smoker_status ?? ''),
    diet_score: toNumber(form.diet_score ?? ''),
    safety_incidents: form.safety_incidents || null,
    adverse_events_count: toNumber(form.adverse_events_count ?? ''),
    high_risk_medication_present: toNullableBoolean(form.high_risk_medication_present_status),
  }), [form, computedBmi, cmoResult.level, visitId]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

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

    const latestSaved = await getClinicalAssessmentByVisit(visitId);
    if (latestSaved.errorMessage || !latestSaved.data) {
      setErrorMessage(latestSaved.errorMessage ?? 'Se guardó, pero no se pudo verificar la persistencia de la evaluación clínica.');
      setSaving(false);
      return;
    }

    applyAssessmentToForm(latestSaved.data);
    setSaveSuccess(true);
    setSaving(false);
  };

  const hasFormData = (Object.values(form) as string[]).some((v) => v.trim() !== '');

  return (
    <div className="page-stack">
      <section className="card">
        <h1>Estratificación basal</h1>
        <VisitTabs visitId={visitId} active="clinical" />

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
          <div>
            <p className="help-text" style={{ fontSize: '0.8rem', marginBottom: '0.5rem', fontWeight: 600 }}>
              DEMOGRÁFICAS
            </p>
            <div className="grid-2">
              <label>
                Edad (años)
                <input value={resolvedAge ?? ''} readOnly disabled />
              </label>
              <label>
                Nivel educativo
                <select {...field('education_level')}>
                  <option value="low">Bajo</option>
                  <option value="medium">Medio</option>
                  <option value="high">Alto</option>
                  <option value="">No registrado</option>
                </select>
              </label>
              <label>
                Embarazo / posparto
                <select {...field('pregnancy_postpartum')}>
                  {YES_NO_UNKNOWN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label>
                Sexo biológico
                <select {...field('biological_sex')}>
                  <option value="female">Mujer</option>
                  <option value="male">Varón</option>
                  <option value="other">Otro</option>
                  <option value="">No registrado</option>
                </select>
              </label>
              <label>
                Raza/etnia de riesgo
                <select {...field('race_ethnicity_risk')}>
                  <option value="asian_non_chinese">Asiático no chino</option>
                  <option value="afro_caribbean">Afrocaribeño</option>
                  <option value="afro_descendant_or_chinese">Afrodescendiente o chino</option>
                  <option value="other">Otra</option>
                  <option value="">No registrado</option>
                </select>
              </label>
            </div>
          </div>

          <div>
            <p className="help-text" style={{ fontSize: '0.8rem', marginBottom: '0.5rem', fontWeight: 600 }}>
              CLÍNICAS
            </p>
            <div className="grid-2">
              <label>
                HTA documentada
                <select {...field('hypertension_present')}>
                  {YES_NO_UNKNOWN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label>
                Patología cardiovascular
                <select {...field('cv_pathology_present')}>
                  {YES_NO_UNKNOWN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label>
                Comorbilidades
                <select {...field('comorbidities_present')}>
                  {YES_NO_UNKNOWN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label>
                ECV reciente (12 meses)
                <select {...field('recent_cvd_12m')}>
                  {YES_NO_UNKNOWN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label>
                Uso hospital/urgencias (12 meses)
                <select {...field('hospital_er_use_12m')}>
                  {YES_NO_UNKNOWN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              {NUMERIC_FIELDS.map(([name, label]) => (
                <label key={name}>
                  {label}
                  <input {...field(name)} inputMode="decimal" />
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="help-text" style={{ fontSize: '0.8rem', marginBottom: '0.5rem', fontWeight: 600 }}>
              SOCIALES Y SANITARIAS
            </p>
            <div className="grid-2">
              <label>
                Tabaquismo
                <select {...field('smoker_status')}>
                  {SMOKER_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label>
                Patrón de actividad física
                <select {...field('physical_activity_pattern')}>
                  <option value="sedentary">Sedentario</option>
                  <option value="intense">Intenso</option>
                  <option value="normal">Normal</option>
                  <option value="">No registrado</option>
                </select>
              </label>
              <label>
                Ausencia de apoyo social
                <select {...field('social_support_absent')}>
                  {YES_NO_UNKNOWN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label>
                Estrés psicosocial
                <select {...field('psychosocial_stress')}>
                  {YES_NO_UNKNOWN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div>
            <p className="help-text" style={{ fontSize: '0.8rem', marginBottom: '0.5rem', fontWeight: 600 }}>
              FARMACOTERAPÉUTICAS
            </p>
            <div className="grid-2">
              <label>
                Nº medicamentos crónicos
                <input {...field('chronic_med_count')} inputMode="decimal" />
              </label>
              <label>
                Med. de alto riesgo
                <select {...field('high_risk_medication_present_status')}>
                  {YES_NO_UNKNOWN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label>
                Cambio reciente de pauta
                <select {...field('recent_regimen_change')}>
                  {YES_NO_UNKNOWN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label>
                Complejidad de pauta
                <select {...field('regimen_complexity_present')}>
                  {YES_NO_UNKNOWN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label>
                Problema de adherencia
                <select {...field('adherence_problem')}>
                  {YES_NO_UNKNOWN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>
          </div>

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
