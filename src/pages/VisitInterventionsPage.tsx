import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { getCmoScoreByVisit, type CmoScoreRecord } from '../services/cmoScoreService';
import {
  createIntervention,
  listInterventionsByVisit,
  type Intervention,
  type PriorityLevel,
} from '../services/interventionService';
import { getVisitById } from '../services/visitService';

type CmoPillar = 'capacidad' | 'motivacion' | 'oportunidad';
type CmoLevel = 1 | 2 | 3;

type InterventionCatalogItem = {
  code: string;
  label: string;
  domain: string;
  cmo_pillar: CmoPillar;
  min_level: CmoLevel;
};

const OTHER_INTERVENTION_CODE = '__other__';

const INTERVENTION_CATALOG: InterventionCatalogItem[] = [
  { code: 'L1-TEL-01', label: 'Teleasistencia estructurada semanal', domain: 'monitoring', cmo_pillar: 'oportunidad', min_level: 1 },
  { code: 'L1-COO-01', label: 'Coordinación rápida con médico de familia/especialista', domain: 'coordination', cmo_pillar: 'oportunidad', min_level: 1 },
  { code: 'L1-MED-01', label: 'Reconciliación farmacoterapéutica intensiva', domain: 'medication', cmo_pillar: 'capacidad', min_level: 1 },
  { code: 'L1-EDU-01', label: 'Educación terapéutica reforzada y plan de adherencia', domain: 'education', cmo_pillar: 'motivacion', min_level: 1 },
  { code: 'L1-SAF-01', label: 'Seguimiento proactivo por eventos adversos y seguridad', domain: 'safety', cmo_pillar: 'oportunidad', min_level: 1 },
  { code: 'L2-MON-01', label: 'Seguimiento farmacoterapéutico quincenal/mensual', domain: 'monitoring', cmo_pillar: 'oportunidad', min_level: 2 },
  { code: 'L2-EDU-01', label: 'Intervención educativa personalizada', domain: 'education', cmo_pillar: 'capacidad', min_level: 2 },
  { code: 'L2-COO-01', label: 'Coordinación con atención primaria según incidencias', domain: 'coordination', cmo_pillar: 'oportunidad', min_level: 2 },
  { code: 'L2-LIF-01', label: 'Refuerzo de estilo de vida y objetivos clínicos', domain: 'lifestyle', cmo_pillar: 'motivacion', min_level: 2 },
  { code: 'L3-EDU-01', label: 'Educación sanitaria básica en riesgo cardiovascular', domain: 'education', cmo_pillar: 'capacidad', min_level: 3 },
  { code: 'L3-ADH-01', label: 'Refuerzo de adherencia y automonitorización', domain: 'adherence', cmo_pillar: 'motivacion', min_level: 3 },
  { code: 'L3-MON-01', label: 'Seguimiento programado rutinario en farmacia comunitaria', domain: 'monitoring', cmo_pillar: 'oportunidad', min_level: 3 },
];

const LEVEL_META = {
  1: { label: 'Nivel 1 · Prioridad', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
  2: { label: 'Nivel 2 · Intermedio', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  3: { label: 'Nivel 3 · Basal', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
} as const;

const CMO_PILLAR_LABEL: Record<CmoPillar, string> = {
  capacidad: 'Capacidad',
  motivacion: 'Motivación',
  oportunidad: 'Oportunidad',
};

export function VisitInterventionsPage() {
  const { visitId = '' } = useParams();
  const [visitPatientId, setVisitPatientId] = useState('');
  const [cmoScore, setCmoScore] = useState<CmoScoreRecord | null>(null);
  const [items, setItems] = useState<Intervention[]>([]);
  const [form, setForm] = useState({
    intervention_code: '',
    intervention_type: '',
    intervention_domain: '',
    intervention_pillar: '' as CmoPillar | '',
    priority_level: 'low' as PriorityLevel,
    delivered: true,
    linked_to_cmo_level: '3',
    outcome: '',
    notes: '',
  });
  const [otherIntervention, setOtherIntervention] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cmoPriorityToInterventionPriority: Record<CmoLevel, PriorityLevel> = {
    1: 'high',
    2: 'medium',
    3: 'low',
  };

  const interventionPriorityLabel: Record<PriorityLevel, string> = {
    high: '1 · Prioridad',
    medium: '2 · Intermedio',
    low: '3 · Basal',
  };

  useEffect(() => {
    void getCmoScoreByVisit(visitId).then(({ data }) => {
      if (data) {
        setCmoScore(data);
        const level = Number(data.priority) as CmoLevel;
        setForm({
          intervention_code: '',
          intervention_type: '',
          intervention_domain: '',
          intervention_pillar: '',
          priority_level: cmoPriorityToInterventionPriority[level] ?? 'low',
          delivered: true,
          linked_to_cmo_level: String(level),
          outcome: '',
          notes: '',
        });
      }
    });
  }, [visitId]);

  const linkedLevel = Number(form.linked_to_cmo_level) as CmoLevel;

  const visibleCatalog = useMemo(() => {
    const uniqueByCode = INTERVENTION_CATALOG.reduce<Map<string, InterventionCatalogItem>>((acc, item) => {
      if (!acc.has(item.code)) acc.set(item.code, item);
      return acc;
    }, new Map());

    return Array.from(uniqueByCode.values()).filter((item) => item.min_level >= linkedLevel);
  }, [linkedLevel]);

  async function loadInterventions() {
    const [visitRes, listRes] = await Promise.all([getVisitById(visitId), listInterventionsByVisit(visitId)]);
    if (visitRes.data?.patient_id) setVisitPatientId(visitRes.data.patient_id);
    setItems(listRes.data);
    setErrorMessage(listRes.errorMessage);
  }

  useEffect(() => {
    void loadInterventions();
  }, [visitId]);

  const handleInterventionSelection = (selectedCode: string) => {
    if (selectedCode === OTHER_INTERVENTION_CODE) {
      setForm((prev) => ({
        ...prev,
        intervention_code: selectedCode,
        intervention_type: '',
        intervention_domain: '',
        intervention_pillar: '',
      }));
      return;
    }

    const selected = visibleCatalog.find((item) => item.code === selectedCode);
    setForm((prev) => ({
      ...prev,
      intervention_code: selectedCode,
      intervention_type: selected?.label ?? '',
      intervention_domain: selected?.domain ?? '',
      intervention_pillar: selected?.cmo_pillar ?? '',
    }));
    setOtherIntervention('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage(null);

    const isOtherIntervention = form.intervention_code === OTHER_INTERVENTION_CODE;
    const interventionTypeToSave = isOtherIntervention ? otherIntervention.trim() : form.intervention_type;

    if (!interventionTypeToSave) {
      setErrorMessage('Selecciona una intervención del catálogo o escribe "Otra intervención".');
      setSaving(false);
      return;
    }

    const payload = {
      visit_id: visitId,
      intervention_type: interventionTypeToSave,
      intervention_domain: form.intervention_domain || null,
      priority_level: form.priority_level,
      delivered: form.delivered,
      linked_to_cmo_level: Number(form.linked_to_cmo_level),
      outcome: form.outcome || null,
      notes: form.notes || null,
    };

    const result = await createIntervention(payload);

    if (result.errorMessage) {
      setErrorMessage(result.errorMessage);
      setSaving(false);
      return;
    }

    setForm((prev) => ({
      ...prev,
      intervention_code: '',
      intervention_type: '',
      intervention_domain: '',
      intervention_pillar: '',
      outcome: '',
      notes: '',
    }));
    setOtherIntervention('');
    setSaving(false);
    await loadInterventions();
  };

  const cmoMeta = cmoScore ? LEVEL_META[cmoScore.priority as CmoLevel] : null;
  const isOtherIntervention = form.intervention_code === OTHER_INTERVENTION_CODE;

  return (
    <div className="page-stack">
      <section className="card">
        <h1>Registro de intervenciones</h1>

        {cmoScore && cmoMeta ? (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: '1rem',
              padding: '0.55rem 1rem', borderRadius: '8px', marginBottom: '1rem',
              background: cmoMeta.bg, border: `1px solid ${cmoMeta.border}`,
            }}
          >
            <span style={{ fontSize: '1.6rem', fontWeight: 700, color: cmoMeta.color, lineHeight: 1, minWidth: '2.5ch', textAlign: 'center' }}>
              {cmoScore.score}
            </span>
            <div>
              <div style={{ fontWeight: 700, color: cmoMeta.color, fontSize: '0.95rem' }}>{cmoMeta.label}</div>
              <div className="help-text" style={{ fontSize: '0.8rem', marginTop: '0.1rem' }}>
                Puntuación CMO-RCV guardada para esta visita
              </div>
            </div>
          </div>
        ) : (
          <p className="help-text" style={{ marginBottom: '1rem' }}>
            Sin puntuación CMO registrada para esta visita.{' '}
            <Link to={`/visits/${visitId}/stratification`}>Completar estratificación</Link>
          </p>
        )}

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Tipo de intervención
            <select required value={form.intervention_code} onChange={(e) => handleInterventionSelection(e.target.value)}>
              <option value="">Seleccionar intervención</option>
              {visibleCatalog.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
              <option value={OTHER_INTERVENTION_CODE}>Otra intervención (texto libre)</option>
            </select>
          </label>

          {isOtherIntervention ? (
            <label>
              Otra intervención
              <input required value={otherIntervention} onChange={(e) => setOtherIntervention(e.target.value)} />
            </label>
          ) : null}

          <label>
            Pilar CMO principal (solo lectura)
            <input value={form.intervention_pillar ? CMO_PILLAR_LABEL[form.intervention_pillar] : ''} readOnly />
          </label>

          <div className="grid-2">
            <label>
              Prioridad
              <select value={form.priority_level} onChange={(e) => setForm((p) => ({ ...p, priority_level: e.target.value as PriorityLevel }))}>
                <option value="high">1 · Prioridad</option>
                <option value="medium">2 · Intermedio</option>
                <option value="low">3 · Basal</option>
              </select>
            </label>
            <label>
              Nivel CMO vinculado
              <select value={form.linked_to_cmo_level} onChange={(e) => setForm((p) => ({ ...p, linked_to_cmo_level: e.target.value }))}>
                <option value="1">1 · Prioridad</option>
                <option value="2">2 · Intermedio</option>
                <option value="3">3 · Basal</option>
              </select>
            </label>
          </div>

          <label className="checkbox-row">
            <input type="checkbox" checked={form.delivered} onChange={(e) => setForm((p) => ({ ...p, delivered: e.target.checked }))} />
            Intervención entregada
          </label>
          <label>
            Resultado
            <input value={form.outcome} onChange={(e) => setForm((p) => ({ ...p, outcome: e.target.value }))} />
          </label>
          <label>
            Notas
            <textarea rows={3} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          </label>
          <button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar intervención'}</button>
        </form>

        {errorMessage ? <ErrorState title="No se pudo guardar/cargar intervenciones" message={errorMessage} /> : null}
      </section>

      <section className="card">
        <h2>Intervenciones de la visita</h2>
        {items.length === 0 ? (
          <p className="help-text">Sin intervenciones registradas para esta visita.</p>
        ) : (
          <ul className="simple-list">
            {items.map((item) => (
              <li key={item.id}>
                <span>{item.intervention_type}</span>
                <span>{item.priority_level ? interventionPriorityLabel[item.priority_level] : '-'}</span>
                <span>{item.delivered ? 'Entregada' : 'Pendiente'}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="actions-inline" style={{ marginTop: '1rem' }}>
          <Link to={`/visits/${visitId}/stratification`}>Volver a estratificación</Link>
          {visitPatientId ? <Link to={`/patients/${visitPatientId}`}>Volver a paciente</Link> : null}
        </div>
      </section>
    </div>
  );
}
