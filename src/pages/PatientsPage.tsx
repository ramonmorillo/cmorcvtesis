import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { listPatients, type Patient } from '../services/patientService';
import { supabase } from '../lib/supabase';

type PriorityMap = Record<string, string>;

export function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [priorities, setPriorities] = useState<PriorityMap>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadPatients(searchCode?: string) {
    setLoading(true);
    const result = await listPatients(searchCode);
    setPatients(result.data);
    setErrorMessage(result.errorMessage);

    if (supabase && result.data.length > 0) {
      const ids = result.data.map((p) => p.id);
      const { data } = await supabase
        .from('clinical_assessments')
        .select('cv_risk_level,visits!inner(patient_id,visit_date)')
        .in('visits.patient_id', ids)
        .order('created_at', { ascending: false });

      const map: PriorityMap = {};
      for (const row of (data ?? []) as any[]) {
        const patientId = Array.isArray(row.visits) ? row.visits[0]?.patient_id : row.visits?.patient_id;
        if (patientId && !map[patientId]) {
          map[patientId] = row.cv_risk_level ?? '-';
        }
      }
      setPriorities(map);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadPatients();
  }, []);

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    await loadPatients(search);
  };

  if (loading) return <p>Cargando pacientes...</p>;
  if (errorMessage) return <ErrorState title="No se pudo cargar el listado" message={errorMessage} />;

  if (patients.length === 0) {
    return (
      <EmptyState
        title="Sin pacientes registrados"
        description="Empieza creando el primer paciente del estudio."
        action={<Link to="/patients/new">Nuevo paciente</Link>}
      />
    );
  }

  return (
    <section className="card">
      <div className="section-header">
        <h1>Pacientes</h1>
        <Link className="button-link" to="/patients/new">
          Nuevo paciente
        </Link>
      </div>
      <form className="search-row" onSubmit={handleSearch}>
        <input
          placeholder="Buscar por study_code"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="submit">Buscar</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Study code</th>
              <th>Sexo</th>
              <th>Edad inclusión</th>
              <th>Inclusión</th>
              <th>Prioridad actual</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {patients.map((patient) => (
              <tr key={patient.id}>
                <td>{patient.study_code}</td>
                <td>{patient.sex || '-'}</td>
                <td>{patient.age_at_inclusion ?? '-'}</td>
                <td>{patient.inclusion_date || '-'}</td>
                <td>{priorities[patient.id] || '-'}</td>
                <td>
                  <Link to={`/patients/${patient.id}`}>Abrir ficha</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
