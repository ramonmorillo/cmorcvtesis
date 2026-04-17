import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { SMOKER_STATUS_OPTIONS } from '../constants/enums';
import type { SmokerStatus } from '../constants/enums';
import { ErrorState } from '../components/common/ErrorState';
import { getClinicalAssessmentByVisit, upsertClinicalAssessment, type NewClinicalAssessmentInput } from '../services/assessmentService';
import { calculateStratification, getActiveCmoConfig, type StratificationResult } from '../services/stratificationService';
import { getVisitById } from '../services/visitService';

function toNumber(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toSmokerStatus(value: string): SmokerStatus | null {
  return value === 'si' || value === 'no' ? value : null;
}

export function BaselineStratificationPage() {
  const { visitId = '' } = useParams();
  const [visitPatientId, setVisitPatientId] = useState<string>('');
  const [form, setForm] = useState<Record<string, string>>({});
  const [highRiskMedicationPresent, setHighRiskMedicationPresent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<StratificationResult | null>(null);
  const [configSource, setConfigSource] = useState('');

  useEffect(() => {
    async function loadCurrent() {
      const [visitRes, assessmentRes, configRes] = await Promise.all([
        getVisitById(visitId),
        getClinicalAssessmentByVisit(visitId),
        getActiveCmoConfig(),
      ]);

      if (visitRes.data?.patient_id) setVisitPatientId(visitRes.data.patient_id);

      if (assessmentRes.errorMessage) {
        setErrorMessage(assessmentRes.errorMessage);
      }

      if (assessmentRes.data) {
        const values = assessmentRes.data;
        setForm({
          systolic_bp: String(values.systolic_bp ?? ''),
          diastolic_bp: String(values.diastolic_bp ?? ''),
          heart_rate: String(values.heart_rate ?? ''),
          weight_kg: String(values.weight_kg ?? ''),
          height_cm: String(values.height_cm ?? ''),
          bmi: String(values.bmi ?? ''),
          waist_cm: String(values.waist_cm ?? ''),
          ldl_mg_dl: String(values.ldl_mg_dl ?? ''),
          hdl_mg_dl: String(values.hdl_mg_dl ?? ''),
          non_hdl_mg_dl: String(values.non_hdl_mg_dl ?? ''),
          fasting_glucose_mg_dl: String(values.fasting_glucose_mg_dl ?? ''),
          hba1c_pct: String(values.hba1c_pct ?? ''),
          score2_value: String(values.score2_value ?? ''),
          framingham_value: String(values.framingham_value ?? ''),
          smoker_status: values.smoker_status ?? '',
          alcohol_use: values.alcohol_use ?? '',
          physical_activity_level: values.physical_activity_level ?? '',
          diet_score: String(values.diet_score ?? ''),
          safety_incidents: values.safety_incidents ?? '',
          adverse_events_count: String(values.adverse_events_count ?? ''),
        });
        setHighRiskMedicationPresent(Boolean(values.high_risk_medication_present));
      }

      setConfigSource(configRes.source);
      if (assessmentRes.data) {
        setResult(calculateStratification(assessmentRes.data, configRes.data));
      }
    }

    void loadCurrent();
  }, [visitId]);

  const assessmentPayload = useMemo<NewClinicalAssessmentInput>(() => {
    const weight = toNumber(form.weight_kg ?? '');
    const heightCm = toNumber(form.height_cm ?? '');
    const bmiValue = toNumber(form.bmi ?? '');
    const computedBmi = !bmiValue && weight && heightCm ? Number((weight / (heightCm / 100) ** 2).toFixed(1)) : bmiValue;

    return {
      visit_id: visitId,
      systolic_bp: toNumber(form.systolic_bp ?? ''),
      diastolic_bp: toNumber(form.diastolic_bp ?? ''),
      heart_rate: toNumber(form.heart_rate ?? ''),
      weight_kg: weight,
      height_cm: heightCm,
      bmi: computedBmi,
      waist_cm: toNumber(form.waist_cm ?? ''),
      ldl_mg_dl: toNumber(form.ldl_mg_dl ?? ''),
      hdl_mg_dl: toNumber(form.hdl_mg_dl ?? ''),
      non_hdl_mg_dl: toNumber(form.non_hdl_mg_dl ?? ''),
      fasting_glucose_mg_dl: toNumber(form.fasting_glucose_mg_dl ?? ''),
      hba1c_pct: toNumber(form.hba1c_pct ?? ''),
      score2_value: toNumber(form.score2_value ?? ''),
      framingham_value: toNumber(form.framingham_value ?? ''),
      cv_risk_level: result ? String(result.priorityLevel) : null,
      smoker_status: toSmokerStatus(form.smoker_status ?? ''),
      alcohol_use: form.alcohol_use || null,
      physical_activity_level: form.physical_activity_level || null,
      diet_score: toNumber(form.diet_score ?? ''),
      safety_incidents: form.safety_incidents || null,
      adverse_events_count: toNumber(form.adverse_events_count ?? ''),
      high_risk_medication_present: highRiskMedicationPresent,
    };
  }, [form, highRiskMedicationPresent, result, visitId]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage(null);

    const configResult = await getActiveCmoConfig();
    const calculated = calculateStratification(assessmentPayload, configResult.data);
    const finalPayload = { ...assessmentPayload, cv_risk_level: String(calculated.priorityLevel) };

    const saveResult = await upsertClinicalAssessment(finalPayload);
    if (saveResult.errorMessage) {
      setErrorMessage(saveResult.errorMessage);
      setSaving(false);
      return;
    }

    setResult(calculated);
    setSaving(false);
  };

  return (
    <div className="page-stack">
      <section className="card">
        <h1>Estratificación basal</h1>
        <p className="help-text">Config fuente: {configSource || 'cargando...'} · cálculo transparente basado en cmo_config.config_json.</p>
        <form className="form-grid" onSubmit={handleSave}>
          <div className="grid-2">
            {[
              ['systolic_bp', 'TA sistólica'],
              ['diastolic_bp', 'TA diastólica'],
              ['heart_rate', 'FC'],
              ['weight_kg', 'Peso (kg)'],
              ['height_cm', 'Talla (cm)'],
              ['bmi', 'IMC'],
              ['waist_cm', 'Cintura (cm)'],
              ['ldl_mg_dl', 'LDL'],
              ['hdl_mg_dl', 'HDL'],
              ['non_hdl_mg_dl', 'No-HDL'],
              ['fasting_glucose_mg_dl', 'Glucosa'],
              ['hba1c_pct', 'HbA1c'],
              ['score2_value', 'SCORE2'],
              ['framingham_value', 'Framingham'],
              ['diet_score', 'Diet score'],
              ['adverse_events_count', 'Eventos adversos'],
            ].map(([name, label]) => (
              <label key={name}>
                {label}
                <input
                  value={form[name] ?? ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, [name]: event.target.value }))}
                  inputMode="decimal"
                />
              </label>
            ))}
          </div>

          <div className="grid-2">
            <label>
              Tabaquismo
              <select value={form.smoker_status ?? ''} onChange={(e) => setForm((p) => ({ ...p, smoker_status: e.target.value }))}>
                <option value="">Seleccionar</option>
                {SMOKER_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Alcohol
              <input value={form.alcohol_use ?? ''} onChange={(e) => setForm((p) => ({ ...p, alcohol_use: e.target.value }))} />
            </label>
            <label>
              Actividad física
              <input
                value={form.physical_activity_level ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, physical_activity_level: e.target.value }))}
                placeholder="alta/media/baja"
              />
            </label>
            <label>
              Incidentes de seguridad
              <textarea
                rows={3}
                value={form.safety_incidents ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, safety_incidents: e.target.value }))}
              />
            </label>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={highRiskMedicationPresent}
              onChange={(e) => setHighRiskMedicationPresent(e.target.checked)}
            />
            Medicación de alto riesgo presente
          </label>

          <button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar evaluación y recalcular prioridad'}</button>
        </form>
        {errorMessage ? <ErrorState title="No se pudo guardar evaluación" message={errorMessage} /> : null}
      </section>

      {result ? (
        <section className="card">
          <h2>Resultado de estratificación</h2>
          <p>
            <strong>Puntuación total:</strong> {result.totalScore} · <strong>Prioridad:</strong> {result.priorityLevel}
          </p>
          <ul className="simple-list">
            {result.contributions.map((item) => (
              <li key={item.key}>
                <span>{item.reason}</span>
                <strong>+{item.value}</strong>
              </li>
            ))}
          </ul>
          <h3>Intervenciones recomendadas (prioridad {result.priorityLevel})</h3>
          <ul>
            {result.recommendedInterventions.map((it) => (
              <li key={it}>{it}</li>
            ))}
          </ul>
          <div className="actions-inline">
            <Link className="button-link" to={`/visits/${visitId}/interventions`}>
              Registrar intervenciones
            </Link>
            {visitPatientId ? <Link to={`/patients/${visitPatientId}`}>Volver a paciente</Link> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
