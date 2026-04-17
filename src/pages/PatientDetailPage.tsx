import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { getPatientById, type Patient } from '../services/patientService';
import { listVisitsByPatient, type Visit } from '../services/visitService';

export function PatientDetailPage() {
  const { id = '' } = useParams();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      const [patientResult, visitsResult] = await Promise.all([getPatientById(id), listVisitsByPatient(id)]);

      setPatient(patientResult.data);

      if (patientResult.errorMessage) {
        setErrorMessage(patientResult.errorMessage);
      } else if (visitsResult.errorMessage) {
        setErrorMessage(visitsResult.errorMessage);
      } else {
        setErrorMessage(null);
      }

      setVisits(visitsResult.data);
      setLoading(false);
    }

    void loadData();
  }, [id]);

  if (loading) {
    return <p>Cargando ficha...</p>;
  }

  if (errorMessage) {
    return <ErrorState title="No se pudo cargar la ficha" message={errorMessage} />;
  }

  if (!patient) {
    return <EmptyState title="Paciente no encontrado" description="Verifica el identificador o vuelve al listado." />;
  }

  return (
    <div className="page-stack">
      <section className="card">
        <div className="section-header">
          <h1>Ficha de paciente</h1>
          <Link className="button-link" to={`/patients/${patient.id}/visits/new`}>
            Nueva visita
          </Link>
        </div>
        <dl className="patient-summary">
          <div>
            <dt>Código</dt>
            <dd>{patient.patient_code}</dd>
          </div>
          <div>
            <dt>Sexo</dt>
            <dd>{patient.sex || '-'}</dd>
          </div>
          <div>
            <dt>Año nacimiento</dt>
            <dd>{patient.birth_year ?? '-'}</dd>
          </div>
          <div>
            <dt>Inclusión</dt>
            <dd>{patient.inclusion_date || '-'}</dd>
          </div>
        </dl>
        {patient.notes ? (
          <p>
            <strong>Notas:</strong> {patient.notes}
          </p>
        ) : null}
      </section>

      <section className="card">
        <h2>Visitas</h2>
        {visits.length === 0 ? (
          <EmptyState
            title="Sin visitas registradas"
            description="Añade la primera visita para iniciar seguimiento."
            action={<Link to={`/patients/${patient.id}/visits/new`}>Nueva visita</Link>}
          />
        ) : (
          <ul className="visit-list">
            {visits.map((visit) => (
              <li key={visit.id}>
                <div>
                  <strong>{visit.visit_date}</strong>
                  <span>{visit.visit_type || 'Sin tipo'}</span>
                </div>
                {visit.notes ? <p>{visit.notes}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
