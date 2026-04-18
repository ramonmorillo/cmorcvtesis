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

  const pct = (value: number) => `${value.toFixed(1)}%`;

  return (
    <div className="page-stack">
      <section className="card">
        <div className="section-header">
          <div>
            <h1>Dashboard</h1>
            <p className="help-text">Vista operacional actual + bloque estratégico Dashboard PRO.</p>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="section-header">
          <h2>Dashboard PRO · Cohorte</h2>
        </div>
        <div className="kpi-grid kpi-grid-pro">
          <article className="kpi-card kpi-card-pro">
            <p>Total pacientes</p>
            <strong>{data.pro.cohort.totalPatients}</strong>
          </article>
          <article className="kpi-card kpi-card-pro">
            <p>Edad media</p>
            <strong>{data.pro.cohort.averageAge.toFixed(1)}</strong>
          </article>
          <article className="kpi-card kpi-card-pro">
            <p>% mujeres</p>
            <strong>{pct(data.pro.cohort.womenPercentage)}</strong>
          </article>
          <article className="kpi-card kpi-card-pro">
            <p>% Nivel 1 / 2 / 3</p>
            <strong>
              {pct(data.pro.cohort.levelPercentage[1])} / {pct(data.pro.cohort.levelPercentage[2])} / {pct(data.pro.cohort.levelPercentage[3])}
            </strong>
          </article>
        </div>
      </section>

      <section className="card">
        <h2>Dashboard PRO · Seguimiento</h2>
        <div className="kpi-grid kpi-grid-pro">
          <article className="kpi-card kpi-card-pro"><p>Nº visitas basal</p><strong>{data.pro.followup.baselineVisits}</strong></article>
          <article className="kpi-card kpi-card-pro"><p>Nº visitas 3m</p><strong>{data.pro.followup.month3Visits}</strong></article>
          <article className="kpi-card kpi-card-pro"><p>Nº visitas 6m</p><strong>{data.pro.followup.month6Visits}</strong></article>
          <article className="kpi-card kpi-card-pro"><p>Nº extraordinarias</p><strong>{data.pro.followup.extraordinaryVisits}</strong></article>
          <article className="kpi-card kpi-card-pro kpi-card-warning"><p>Pacientes sin seguimiento {'>'}90 días</p><strong>{data.pro.followup.patientsWithoutFollowup90d}</strong></article>
        </div>
      </section>

      <section className="card">
        <h2>Dashboard PRO · Evolución clínica</h2>
        <div className="kpi-grid kpi-grid-pro">
          <article className="kpi-card kpi-card-pro kpi-card-positive"><p>Pacientes mejoran nivel</p><strong>{data.pro.clinicalEvolution.improved}</strong></article>
          <article className="kpi-card kpi-card-pro kpi-card-warning"><p>Pacientes empeoran</p><strong>{data.pro.clinicalEvolution.worsened}</strong></article>
          <article className="kpi-card kpi-card-pro"><p>Score medio basal</p><strong>{data.pro.clinicalEvolution.averageBaselineScore.toFixed(2)}</strong></article>
          <article className="kpi-card kpi-card-pro"><p>Score medio última visita</p><strong>{data.pro.clinicalEvolution.averageLatestScore.toFixed(2)}</strong></article>
        </div>
      </section>

      <section className="card">
        <h2>Dashboard PRO · Actividad farmacéutica</h2>
        <div className="kpi-grid kpi-grid-pro">
          <article className="kpi-card kpi-card-pro">
            <p>Intervenciones totales</p>
            <strong>{data.pro.pharmaceuticalActivity.totalInterventions}</strong>
          </article>
          <article className="kpi-card kpi-card-pro">
            <p>Media por paciente</p>
            <strong>{data.pro.pharmaceuticalActivity.avgInterventionsPerPatient}</strong>
          </article>
          <article className="kpi-card kpi-card-pro">
            <p>Por pilar CMO</p>
            <strong>
              C {data.pro.pharmaceuticalActivity.interventionsByPillar.capacidad} · M {data.pro.pharmaceuticalActivity.interventionsByPillar.motivacion} · O {data.pro.pharmaceuticalActivity.interventionsByPillar.oportunidad}
            </strong>
          </article>
          <article className="kpi-card kpi-card-pro">
            <p>Por nivel</p>
            <strong>
              N1 {data.pro.pharmaceuticalActivity.interventionsByLevel[1]} · N2 {data.pro.pharmaceuticalActivity.interventionsByLevel[2]} · N3 {data.pro.pharmaceuticalActivity.interventionsByLevel[3]}
            </strong>
          </article>
        </div>
      </section>

      <section className="card">
        <h2>Dashboard operacional (actual)</h2>
        <div className="kpi-grid">
          <article className="kpi-card">
            <p>Total pacientes</p>
            <strong>{data.totalPatients}</strong>
          </article>
          <article className="kpi-card">
            <p>Pacientes nivel 1</p>
            <strong>{data.patientsByPriority[1]}</strong>
          </article>
          <article className="kpi-card">
            <p>Pacientes nivel 2</p>
            <strong>{data.patientsByPriority[2]}</strong>
          </article>
          <article className="kpi-card">
            <p>Pacientes nivel 3</p>
            <strong>{data.patientsByPriority[3]}</strong>
          </article>
          <article className="kpi-card">
            <p>Intervenciones totales</p>
            <strong>{data.totalInterventions}</strong>
          </article>
          <article className="kpi-card">
            <p>Media intervenciones / paciente</p>
            <strong>{data.avgInterventionsPerPatient}</strong>
          </article>
          <article className="kpi-card">
            <p>Pacientes sin seguimiento {'>'} 90 días</p>
            <strong>{data.patientsWithoutFollowup90d}</strong>
          </article>
        </div>
      </section>

      <section className="card">
        <h2>Evolución de nivel respecto basal</h2>
        <div className="kpi-grid">
          <article className="kpi-card kpi-card-positive">
            <p>Pacientes con mejora</p>
            <strong>{data.patientEvolutionVsBaseline.improved}</strong>
          </article>
          <article className="kpi-card kpi-card-warning">
            <p>Pacientes con empeoramiento</p>
            <strong>{data.patientEvolutionVsBaseline.worsened}</strong>
          </article>
          <article className="kpi-card">
            <p>Pacientes estables</p>
            <strong>{data.patientEvolutionVsBaseline.stable}</strong>
          </article>
        </div>
      </section>

      <section className="card">
        <h2>Intervenciones por pilar CMO</h2>
        <div className="kpi-grid">
          <article className="kpi-card">
            <p>Capacidad</p>
            <strong>{data.interventionsByPillar.capacidad}</strong>
          </article>
          <article className="kpi-card">
            <p>Motivación</p>
            <strong>{data.interventionsByPillar.motivacion}</strong>
          </article>
          <article className="kpi-card">
            <p>Oportunidad</p>
            <strong>{data.interventionsByPillar.oportunidad}</strong>
          </article>
        </div>
      </section>

      <section className="card">
        <h2>Intervenciones por nivel</h2>
        <div className="kpi-grid">
          <article className="kpi-card">
            <p>Nivel 1</p>
            <strong>{data.interventionsByLevel[1]}</strong>
          </article>
          <article className="kpi-card">
            <p>Nivel 2</p>
            <strong>{data.interventionsByLevel[2]}</strong>
          </article>
          <article className="kpi-card">
            <p>Nivel 3</p>
            <strong>{data.interventionsByLevel[3]}</strong>
          </article>
        </div>
      </section>

      <section className="card">
        <h2>Score medio por tipo de visita</h2>
        {data.averageScoreByVisitType.length === 0 ? (
          <EmptyState title="Sin scores registrados" description="Registra una visita con score CMO para visualizar este análisis." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tipo de visita</th>
                  <th>Score medio</th>
                  <th>Visitas con score</th>
                </tr>
              </thead>
              <tbody>
                {data.averageScoreByVisitType.map((item) => (
                  <tr key={item.visitType ?? 'unknown'}>
                    <td>{getVisitTypeLabel(item.visitType)}</td>
                    <td>{item.averageScore.toFixed(2)}</td>
                    <td>{item.visitsWithScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Calidad de datos</h2>
        <div className="kpi-grid">
          <article className="kpi-card">
            <p>Pacientes sin estratificación basal</p>
            <strong>{data.dataQuality.patientsWithoutBaselineStratification}</strong>
          </article>
          <article className="kpi-card">
            <p>Visitas sin score</p>
            <strong>{data.dataQuality.visitsWithoutScore}</strong>
          </article>
          <article className="kpi-card">
            <p>Visitas sin intervenciones</p>
            <strong>{data.dataQuality.visitsWithoutInterventions}</strong>
          </article>
          <article className="kpi-card kpi-card-warning">
            <p>Pacientes nivel 1 sin intervención</p>
            <strong>{data.dataQuality.level1PatientsWithoutIntervention}</strong>
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
        {data.recentVisits.length === 0 ? (
          <EmptyState title="Sin visitas recientes" description="Aún no se han registrado visitas con fecha de realización." />
        ) : (
          <ul className="simple-list">
            {data.recentVisits.map((visit) => (
              <li key={visit.id}>
                <span>{visit.visit_date ?? '-'}</span>
                <span>{getVisitTypeLabel(visit.visit_type)}</span>
                <Link to={`/patients/${visit.patient_id}`}>{visit.study_code ?? 'Paciente'}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Intervenciones recientes</h2>
        {data.recentInterventions.length === 0 ? (
          <EmptyState title="Sin intervenciones recientes" description="Registra intervenciones desde la ficha de visita." />
        ) : (
          <ul className="simple-list">
            {data.recentInterventions.map((item) => (
              <li key={item.id}>
                <span>{item.created_at?.slice(0, 10) ?? '-'}</span>
                <span>{item.intervention_type}</span>
                <Link to={`/patients/${item.patient_id}`}>Paciente</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
