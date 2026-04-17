import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { createPatient } from '../services/patientService';

export function NewPatientPage() {
  const navigate = useNavigate();
  const [patientCode, setPatientCode] = useState('');
  const [sex, setSex] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [inclusionDate, setInclusionDate] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage(null);

    const result = await createPatient({
      patient_code: patientCode,
      sex: sex || null,
      birth_year: birthYear ? Number(birthYear) : null,
      inclusion_date: inclusionDate || null,
      notes: notes || null,
    });

    if (result.errorMessage) {
      setErrorMessage(result.errorMessage);
      setSaving(false);
      return;
    }

    navigate(result.data ? `/patients/${result.data.id}` : '/patients');
  };

  return (
    <section className="card">
      <h1>Nuevo paciente</h1>
      <p className="help-text">Completa un registro mínimo del estudio. Ajusta columnas en el servicio si tu esquema difiere.</p>
      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          Código paciente
          <input value={patientCode} onChange={(event) => setPatientCode(event.target.value)} required />
        </label>
        <label>
          Sexo
          <input value={sex} onChange={(event) => setSex(event.target.value)} placeholder="M/F/u otro" />
        </label>
        <label>
          Año nacimiento
          <input
            type="number"
            value={birthYear}
            onChange={(event) => setBirthYear(event.target.value)}
            min={1900}
            max={new Date().getFullYear()}
          />
        </label>
        <label>
          Fecha inclusión
          <input type="date" value={inclusionDate} onChange={(event) => setInclusionDate(event.target.value)} />
        </label>
        <label>
          Notas
          <textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar paciente'}
        </button>
      </form>
      {errorMessage ? <ErrorState title="No se pudo guardar" message={errorMessage} /> : null}
    </section>
  );
}
