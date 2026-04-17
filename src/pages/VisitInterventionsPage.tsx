import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { createIntervention, listInterventionsByVisit, type Intervention } from '../services/interventionService';
import { getVisitById } from '../services/visitService';

export function VisitInterventionsPage() {
  const { visitId = '' } = useParams();
  const [visitPatientId, setVisitPatientId] = useState('');
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

  return (
    <section className="card">
      <h1>Registro de intervenciones</h1>
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
              <option value="1">1 (máxima intensidad)</option>
              <option value="2">2 (intermedia)</option>
              <option value="3">3 (basal)</option>
            </select>
          </label>
          <label>
            Nivel CMO vinculado
            <select value={form.linked_to_cmo_level} onChange={(e) => setForm((p) => ({ ...p, linked_to_cmo_level: e.target.value }))}>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
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

      <h2>Intervenciones de la visita</h2>
      <ul className="simple-list">
        {items.map((item) => (
          <li key={item.id}>
            <span>{item.intervention_type}</span>
            <span>P{item.priority_level ?? '-'}</span>
            <span>{item.delivered ? 'Entregada' : 'Pendiente'}</span>
          </li>
        ))}
      </ul>

      <div className="actions-inline">
        <Link to={`/visits/${visitId}/stratification`}>Volver a estratificación</Link>
        {visitPatientId ? <Link to={`/patients/${visitPatientId}`}>Volver a paciente</Link> : null}
      </div>
    </section>
  );
}
