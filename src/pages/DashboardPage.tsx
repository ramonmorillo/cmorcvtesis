import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { getVisitTypeLabel } from '../constants/enums';
import { loadDashboardData, type DashboardData } from '../services/dashboardService';

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const result = await loadDashboardData();
      setData(result.data);
      setErrorMessage(result.errorMessage);
      setLoading(false);
    }

    void loadData();
  }, []);

  if (loading) return <p>Cargando dashboard...</p>;
  if (errorMessage || !data) return <ErrorState title="No se pudo cargar el dashboard" message={errorMessage ?? 'Sin datos'} />;

  return (
    <div className="page-stack">
      <section className="card">
        <h1>Dashboard</h1>
        <div className="kpi-grid">
          <article className="kpi-card">
            <p>Total pacientes</p>
            <strong>{data.totalPatients}</strong>
          </article>
          <article className="kpi-card">
            <p>Prioridad 1</p>
            <strong>{data.patientsByPriority[1]}</strong>
          </article>
          <article className="kpi-card">
            <p>Prioridad 2</p>
            <strong>{data.patientsByPriority[2]}</strong>
          </article>
          <article className="kpi-card">
            <p>Prioridad 3</p>
            <strong>{data.patientsByPriority[3]}</strong>
          </article>
        </div>
      </section>

      <section className="card">
        <h2>Próximas visitas programadas</h2>
        {data.upcomingVisits.length === 0 ? (
          <EmptyState title="Sin visitas programadas" description="No hay visitas futuras registradas." />
        ) : (
          <ul className="simple-list">
            {data.upcomingVisits.map((visit) => (
              <li key={visit.id}>
                <span>{visit.scheduled_date ?? '-'}</span>
                <span>{getVisitTypeLabel(visit.visit_type)}</span>
                <Link to={`/patients/${visit.patient_id}`}>Paciente</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Últimas visitas registradas</h2>
        <ul className="simple-list">
          {data.recentVisits.map((visit) => (
            <li key={visit.id}>
              <span>{visit.visit_date ?? '-'}</span>
              <span>{getVisitTypeLabel(visit.visit_type)}</span>
              <Link to={`/patients/${visit.patient_id}`}>Paciente</Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Intervenciones recientes</h2>
        <ul className="simple-list">
          {data.recentInterventions.map((item) => (
            <li key={item.id}>
              <span>{item.created_at?.slice(0, 10) ?? '-'}</span>
              <span>{item.intervention_type}</span>
              <span>Visita {item.visit_id.slice(0, 8)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
