import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { createVisit } from '../services/visitService';

export function NewVisitPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [visitDate, setVisitDate] = useState('');
  const [visitType, setVisitType] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage(null);

    const result = await createVisit({
      patient_id: id,
      visit_date: visitDate,
      visit_type: visitType || null,
      notes: notes || null,
    });

    if (result.errorMessage) {
      setErrorMessage(result.errorMessage);
      setSaving(false);
      return;
    }

    navigate(`/patients/${id}`);
  };

  return (
    <section className="card">
      <h1>Nueva visita</h1>
      <p className="help-text">
        Registro mínimo de seguimiento. Si tu esquema usa otros campos obligatorios, adáptalo en{' '}
        <code>src/services/visitService.ts</code>.
      </p>
      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          Fecha visita
          <input type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} required />
        </label>
        <label>
          Tipo de visita
          <input value={visitType} onChange={(event) => setVisitType(event.target.value)} placeholder="Inicial / Control" />
        </label>
        <label>
          Notas
          <textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <div className="actions-inline">
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar visita'}
          </button>
          <Link to={`/patients/${id}`}>Cancelar</Link>
        </div>
      </form>
      {errorMessage ? <ErrorState title="No se pudo guardar la visita" message={errorMessage} /> : null}
    </section>
  );
}
