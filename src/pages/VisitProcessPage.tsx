import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { VisitTabs } from '../components/common/VisitTabs';
import { listInterventionsByVisit } from '../services/interventionService';
import { supabase } from '../lib/supabase';
import { getVisitById, type Visit } from '../services/visitService';
import {
  getVisitProcessByVisit,
  type RecommendationStatus,
  upsertVisitProcess,
  type VisitProcessRecord,
} from '../services/visitProcessService';

type YesNo = 'yes' | 'no' | '';

type ProcessForm = {
  total_session_minutes: string;
  stratification_performed: YesNo;
  stratification_level: string;
  stratification_completed_correctly: YesNo;
  intervention_registered: YesNo;
  intervention_count: string;
  recommendation_to_professional: YesNo;
  recommendation_status: RecommendationStatus | '';
  patient_continues_program: YesNo;
  dropout_reason: string;
  operational_incidents: string;
  additional_admin_minutes: string;
};

const INITIAL_FORM: ProcessForm = {
  total_session_minutes: '',
  stratification_performed: '',
  stratification_level: '',
  stratification_completed_correctly: '',
  intervention_registered: '',
  intervention_count: '',
  recommendation_to_professional: '',
  recommendation_status: '',
  patient_continues_program: '',
  dropout_reason: '',
  operational_incidents: '',
  additional_admin_minutes: '',
};

function toNullableNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableBoolean(value: YesNo): boolean | null {
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return null;
}

function fromNullableBoolean(value: boolean | null): YesNo {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return '';
}

function mapRecordToForm(record: VisitProcessRecord): ProcessForm {
  return {
    total_session_minutes: String(record.total_session_minutes ?? ''),
    stratification_performed: fromNullableBoolean(record.stratification_performed),
    stratification_level: record.stratification_level ?? '',
    stratification_completed_correctly: fromNullableBoolean(record.stratification_completed_correctly),
    intervention_registered: fromNullableBoolean(record.intervention_registered),
    intervention_count: String(record.intervention_count ?? ''),
    recommendation_to_professional: fromNullableBoolean(record.recommendation_to_professional),
    recommendation_status: record.recommendation_status ?? '',
    patient_continues_program: fromNullableBoolean(record.patient_continues_program),
    dropout_reason: record.dropout_reason ?? '',
    operational_incidents: record.operational_incidents ?? '',
    additional_admin_minutes: String(record.additional_admin_minutes ?? ''),
  };
}

export function VisitProcessPage() {
  const { visitId = '' } = useParams();

  const [visit, setVisit] = useState<Visit | null>(null);
  const [form, setForm] = useState<ProcessForm>(INITIAL_FORM);
  const [professionalLabel, setProfessionalLabel] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    async function loadData() {
      const [visitRes, processRes, interventionsRes, userRes] = await Promise.all([
        getVisitById(visitId),
        getVisitProcessByVisit(visitId),
        listInterventionsByVisit(visitId),
        supabase?.auth.getUser() ?? Promise.resolve({ data: { user: null }, error: null }),
      ]);

      if (visitRes.errorMessage) setErrorMessage(visitRes.errorMessage);
      if (processRes.errorMessage) setErrorMessage(processRes.errorMessage);
      if (interventionsRes.errorMessage) setErrorMessage(interventionsRes.errorMessage);

      if (visitRes.data) setVisit(visitRes.data);

      const user = userRes.data?.user ?? null;
      setProfessionalLabel(user?.email ?? user?.id ?? 'No disponible');

      if (processRes.data) {
        setForm(mapRecordToForm(processRes.data));
        return;
      }

      const hasInterventions = interventionsRes.data.length > 0;
      setForm((prev) => ({
        ...prev,
        intervention_registered: hasInterventions ? 'yes' : prev.intervention_registered,
        intervention_count: hasInterventions ? String(interventionsRes.data.length) : prev.intervention_count,
      }));
    }

    void loadData();
  }, [visitId]);

  const field = (name: keyof ProcessForm) => ({
    value: form[name],
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setForm((prev) => ({ ...prev, [name]: value }));
    },
  });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    setErrorMessage(null);

    const userRes = await (supabase?.auth.getUser() ?? Promise.resolve({ data: { user: null }, error: null }));

    if (userRes.error || !userRes.data.user) {
      setSaving(false);
      setErrorMessage('Usuario no autenticado. Inicia sesión e inténtalo de nuevo.');
      return;
    }

    if (!visit?.patient_id) {
      setSaving(false);
      setErrorMessage('No se pudo resolver el paciente asociado a la visita.');
      return;
    }

    const payload = {
      patient_id: visit.patient_id,
      visit_id: visitId,
      total_session_minutes: toNullableNumber(form.total_session_minutes),
      stratification_performed: toNullableBoolean(form.stratification_performed),
      stratification_level: form.stratification_level.trim() || null,
      stratification_completed_correctly: toNullableBoolean(form.stratification_completed_correctly),
      intervention_registered: toNullableBoolean(form.intervention_registered),
      intervention_count: toNullableNumber(form.intervention_count),
      recommendation_to_professional: toNullableBoolean(form.recommendation_to_professional),
      recommendation_status: form.recommendation_status || null,
      patient_continues_program: toNullableBoolean(form.patient_continues_program),
      dropout_reason: form.dropout_reason.trim() || null,
      operational_incidents: form.operational_incidents.trim() || null,
      additional_admin_minutes: toNullableNumber(form.additional_admin_minutes),
    };

    const saveResult = await upsertVisitProcess(payload);
    if (saveResult.errorMessage) {
      setErrorMessage(saveResult.errorMessage);
      setSaving(false);
      return;
    }

    if (saveResult.data) {
      setForm(mapRecordToForm(saveResult.data));
    }

    setSaveSuccess(true);
    setSaving(false);
  };

  if (!visitId) {
    return <ErrorState title="Visita no encontrada" message="No se recibió identificador de visita en la ruta." />;
  }

  return (
    <div className="page-stack">
      <section className="card">
        <h1>Proceso y factibilidad por visita</h1>
        <VisitTabs visitId={visitId} active="process" />

        <div className="help-text" style={{ marginBottom: '1rem' }}>
          <div><strong>Fecha visita:</strong> {visit?.visit_date ?? visit?.scheduled_date ?? 'No registrada'}</div>
          <div><strong>Profesional usuario:</strong> {professionalLabel}</div>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <h2 style={{ margin: '0.25rem 0 0.25rem' }}>Bloque A · Proceso</h2>

          <label>
            Tiempo total sesión (min)
            <input type="number" min={0} step="1" {...field('total_session_minutes')} />
          </label>

          <label>
            ¿Se realizó estratificación en esta visita?
            <select {...field('stratification_performed')}>
              <option value="">No registrado</option>
              <option value="yes">Sí</option>
              <option value="no">No</option>
            </select>
          </label>

          <label>
            Nivel de estratificación resultante
            <input placeholder="Ej. Nivel 1" {...field('stratification_level')} />
          </label>

          <label>
            ¿Estratificación completada correctamente?
            <select {...field('stratification_completed_correctly')}>
              <option value="">No registrado</option>
              <option value="yes">Sí</option>
              <option value="no">No</option>
            </select>
          </label>

          <label>
            ¿Hubo intervención farmacéutica registrada?
            <select {...field('intervention_registered')}>
              <option value="">No registrado</option>
              <option value="yes">Sí</option>
              <option value="no">No</option>
            </select>
          </label>

          <label>
            Número de intervenciones realizadas
            <input type="number" min={0} step="1" {...field('intervention_count')} />
          </label>

          <label>
            ¿Hubo recomendación a otro profesional?
            <select {...field('recommendation_to_professional')}>
              <option value="">No registrado</option>
              <option value="yes">Sí</option>
              <option value="no">No</option>
            </select>
          </label>

          <label>
            Estado recomendación
            <select {...field('recommendation_status')}>
              <option value="">No aplica</option>
              <option value="accepted">Aceptada</option>
              <option value="not_accepted">No aceptada</option>
              <option value="pending">Pendiente</option>
              <option value="not_applicable">No aplica</option>
            </select>
          </label>

          <h2 style={{ margin: '0.5rem 0 0.25rem' }}>Bloque B · Factibilidad operativa</h2>

          <label>
            Paciente continúa en programa
            <select {...field('patient_continues_program')}>
              <option value="">No registrado</option>
              <option value="yes">Sí</option>
              <option value="no">No</option>
            </select>
          </label>

          <label>
            Motivo baja/abandono
            <input {...field('dropout_reason')} />
          </label>

          <label>
            Incidencias operativas
            <textarea rows={3} {...field('operational_incidents')} />
          </label>

          <label>
            Tiempo adicional administrativo (min)
            <input type="number" min={0} step="1" {...field('additional_admin_minutes')} />
          </label>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar proceso'}</button>
            <Link to={`/visits/${visitId}/reports`}>Ir a informes</Link>
            {saveSuccess ? <span className="help-text">Guardado correctamente.</span> : null}
          </div>
        </form>

        {errorMessage ? (
          <p className="error-text" role="alert" style={{ marginTop: '0.75rem' }}>{errorMessage}</p>
        ) : null}
      </section>
    </div>
  );
}
