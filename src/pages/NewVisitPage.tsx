import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { VISIT_STATUS_OPTIONS, VISIT_TYPE_OPTIONS } from '../constants/enums';
import type { VisitStatus, VisitType } from '../constants/enums';
import { getVisitNumberByType, normalizeVisitTypeValue } from '../constants/enums';
import { ErrorState } from '../components/common/ErrorState';
import { createVisit } from '../services/visitService';

export function NewVisitPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<{
    visit_type: VisitType;
    scheduled_date: string;
    visit_date: string;
    visit_status: VisitStatus;
    extraordinary_reason: string;
    notes: string;
  }>({
    visit_type: 'baseline',
    scheduled_date: '',
    visit_date: '',
    visit_status: 'scheduled',
    extraordinary_reason: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage(null);

    const result = await createVisit({
      patient_id: id,
      visit_type: form.visit_type,
      visit_number: getVisitNumberByType(form.visit_type),
      scheduled_date: form.scheduled_date || null,
      visit_date: form.visit_date || null,
      visit_status: form.visit_status || null,
      extraordinary_reason: normalizeVisitTypeValue(form.visit_type) === 'extra' ? form.extraordinary_reason || null : null,
      notes: form.notes || null,
    });

    if (result.errorMessage || !result.data) {
      setErrorMessage(result.errorMessage ?? 'No se recibió la visita creada.');
      setSaving(false);
      return;
    }

    navigate(`/visits/${result.data.id}/stratification`);
  };

  return (
    <section className="card">
      <h1>Nueva visita</h1>
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="grid-2">
          <label>
            Tipo de visita
            <select value={form.visit_type} onChange={(e) => setForm((p) => ({ ...p, visit_type: e.target.value as VisitType }))}>
              {VISIT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Número de visita
            <input type="text" value={getVisitNumberByType(form.visit_type) ?? 'Auto'} disabled />
          </label>
          <label>
            Fecha programada
            <input
              type="date"
              value={form.scheduled_date}
              onChange={(e) => setForm((p) => ({ ...p, scheduled_date: e.target.value }))}
            />
          </label>
          <label>
            Fecha de visita
            <input type="date" value={form.visit_date} onChange={(e) => setForm((p) => ({ ...p, visit_date: e.target.value }))} />
          </label>
          <label>
            Estado visita
            <select
              value={form.visit_status}
              onChange={(e) => setForm((p) => ({ ...p, visit_status: e.target.value as VisitStatus }))}
            >
              {VISIT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {normalizeVisitTypeValue(form.visit_type) === 'extra' ? (
            <label>
              Motivo visita extra
              <input
                value={form.extraordinary_reason}
                onChange={(e) => setForm((p) => ({ ...p, extraordinary_reason: e.target.value }))}
              />
            </label>
          ) : null}
        </div>
        <label>
          Notas
          <textarea rows={4} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        </label>
        <div className="actions-inline">
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar visita y continuar'}
          </button>
          <Link to={`/patients/${id}`}>Cancelar</Link>
        </div>
      </form>
      {errorMessage ? <ErrorState title="No se pudo guardar la visita" message={errorMessage} /> : null}
    </section>
  );
}
