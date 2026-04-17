import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { type Patient, listPatients } from '../services/patientService';

export function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadPatients() {
      const result = await listPatients();
      setPatients(result.data);
      setErrorMessage(result.errorMessage);
      setLoading(false);
    }

    void loadPatients();
  }, []);

  if (loading) {
    return <p>Cargando pacientes...</p>;
  }

  if (errorMessage) {
    return <ErrorState title="No se pudo cargar el listado" message={errorMessage} />;
  }

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
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Sexo</th>
              <th>Año nacimiento</th>
              <th>Inclusión</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {patients.map((patient) => (
              <tr key={patient.id}>
                <td>{patient.patient_code}</td>
                <td>{patient.sex || '-'}</td>
                <td>{patient.birth_year ?? '-'}</td>
                <td>{patient.inclusion_date || '-'}</td>
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
