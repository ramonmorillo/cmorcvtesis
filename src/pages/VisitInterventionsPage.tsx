import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { getCmoScoreByVisit, type CmoScoreRecord } from '../services/cmoScoreService';
import { createIntervention, listInterventionsByVisit, type Intervention } from '../services/interventionService';
import { getVisitById } from '../services/visitService';

const LEVEL_META = {
  1: { label: 'Nivel 1 · Prioridad',  color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
  2: { label: 'Nivel 2 · Intermedio', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  3: { label: 'Nivel 3 · Basal',      color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
} as const;

export function VisitInterventionsPage() {
  const { visitId = '' } = useParams();
  const [visitPatientId, setVisitPatientId] = useState('');
  const [cmoScore, setCmoScore] = useState<CmoScoreRecord | null>(null);
  const [items, setItems] = useState<Intervention[]>([]);
  const [form, setForm] = useState({
    intervention_type: '',
    intervention_domain: '',
    priority_level: '3',
    delivered: true,
    linked_to_cmo_level: '3',
    outcome: '',
    notes: '',
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load the saved CMO score once on mount and seed the form level fields.
  useEffect(() => {
    void getCmoScoreByVisit(visitId).then(({ data }) => {
      if (data) {
        setCmoScore(data);
        const level = String(data.priority as number);
        setForm({
          intervention_type: '',
          intervention_domain: '',
          priority_level: level,
          delivered: true,
          linked_to_cmo_level: level,
          outcome: '',
          notes: '',
        });
      }
    });
  }, [visitId]);

  async function loadInterventions() {
    const [visitRes, listRes] = await Promise.all([getVisitById(visitId), listInterventionsByVisit(visitId)]);
    if (visitRes.data?.patient_id) setVisitPatientId(visitRes.data.patient_id);
    setItems(listRes.data);
    setErrorMessage(listRes.errorMessage);
  }

  useEffect(() => {
    void loadInterventions();
  }, [visitId]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage(null);

    const result = await createIntervention({
      visit_id: visitId,
      intervention_type: form.intervention_type,
      intervention_domain: form.intervention_domain || null,
      priority_level: Number(form.priority_level),
      delivered: form.delivered,
      linked_to_cmo_level: Number(form.linked_to_cmo_level),
      outcome: form.outcome || null,
      notes: form.notes || null,
    });

    if (result.errorMessage) {
      setErrorMessage(result.errorMessage);
      setSaving(false);
      return;
    }

    setForm({ ...form, intervention_type: '', intervention_domain: '', outcome: '', notes: '' });
    setSaving(false);
    await loadInterventions();
  };

  const cmoMeta = cmoScore ? LEVEL_META[cmoScore.priority as 1 | 2 | 3] : null;

  return (
    <div className="page-stack">
      <section className="card">
        <h1>Registro de intervenciones</h1>

        {/* ── CMO context banner ───────────────────────────────────── */}
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
            <input required value={form.intervention_type} onChange={(e) => setForm((p) => ({ ...p, intervention_type: e.target.value }))} />
          </label>
          <label>
            Dominio
            <input value={form.intervention_domain} onChange={(e) => setForm((p) => ({ ...p, intervention_domain: e.target.value }))} />
          </label>
          <div className="grid-2">
            <label>
              Prioridad
              <select value={form.priority_level} onChange={(e) => setForm((p) => ({ ...p, priority_level: e.target.value }))}>
                <option value="1">1 · Prioridad</option>
                <option value="2">2 · Intermedio</option>
                <option value="3">3 · Basal</option>
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
            Outcome
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

      {/* ── Intervention list ────────────────────────────────────────── */}
      <section className="card">
        <h2>Intervenciones de la visita</h2>
        {items.length === 0 ? (
          <p className="help-text">Sin intervenciones registradas para esta visita.</p>
        ) : (
          <ul className="simple-list">
            {items.map((item) => (
              <li key={item.id}>
                <span>{item.intervention_type}</span>
                <span>P{item.priority_level ?? '-'}</span>
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
