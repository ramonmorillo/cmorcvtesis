import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { getLatestCmoScoreByPatient, type CmoScoreRecord } from '../services/cmoScoreService';
import { listInterventionsByPatient } from '../services/interventionService';
import { getPatientById, type Patient } from '../services/patientService';
import { listVisitsByPatient, type Visit } from '../services/visitService';

const LEVEL_META = {
  1: { label: 'Nivel 1 · Prioridad',  color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
  2: { label: 'Nivel 2 · Intermedio', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  3: { label: 'Nivel 3 · Basal',      color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
} as const;

export function PatientDetailPage() {
  const { id = '' } = useParams();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [latestCmoScore, setLatestCmoScore] = useState<CmoScoreRecord | null>(null);
  const [interventions, setInterventions] = useState<Array<{ id: string; intervention_type: string; priority_level: number | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      const [patientResult, visitsResult, cmoResult, interventionsResult] = await Promise.all([
        getPatientById(id),
        listVisitsByPatient(id),
        getLatestCmoScoreByPatient(id),
        listInterventionsByPatient(id),
      ]);

      setPatient(patientResult.data);
      setVisits(visitsResult.data);
      setLatestCmoScore(cmoResult.data);
      setInterventions(
        interventionsResult.data.map((x) => ({
          id: x.id,
          intervention_type: x.intervention_type,
          priority_level: x.priority_level,
        })),
      );

      setErrorMessage(
        patientResult.errorMessage ?? visitsResult.errorMessage ?? interventionsResult.errorMessage,
      );
      setLoading(false);
    }

    void loadData();
  }, [id]);

  const latestVisitId = useMemo(() => visits[0]?.id, [visits]);
  const cmoMeta = latestCmoScore ? LEVEL_META[latestCmoScore.priority as 1 | 2 | 3] : null;

  if (loading) return <p>Cargando ficha...</p>;
  if (errorMessage) return <ErrorState title="No se pudo cargar la ficha" message={errorMessage} />;
  if (!patient) return <EmptyState title="Paciente no encontrado" description="Verifica el identificador o vuelve al listado." />;

  return (
    <div className="page-stack">
      <section className="card">
        <div className="section-header">
          <h1>Ficha de paciente</h1>
          <div className="actions-inline">
            <Link className="button-link" to={`/patients/${patient.id}/visits/new`}>
              Nueva visita
            </Link>
            {latestVisitId ? <Link to={`/visits/${latestVisitId}/stratification`}>Estratificación basal</Link> : null}
          </div>
        </div>
        <dl className="patient-summary">
          <div><dt>Study code</dt><dd>{patient.study_code}</dd></div>
          <div><dt>Sexo</dt><dd>{patient.sex || '-'}</dd></div>
          <div><dt>Edad inclusión</dt><dd>{patient.age_at_inclusion ?? '-'}</dd></div>
          <div><dt>Farmacia</dt><dd>{patient.pharmacy_site || '-'}</dd></div>
          <div><dt>Investigador/a</dt><dd>{patient.investigator_name || '-'}</dd></div>
          <div><dt>Consentimiento</dt><dd>{patient.consent_signed ? 'Sí' : 'No'}</dd></div>
          <div>
            <dt>Nivel CMO</dt>
            <dd>
              {cmoMeta ? (
                <span style={{ color: cmoMeta.color, fontWeight: 700 }}>
                  {cmoMeta.label}
                </span>
              ) : '-'}
            </dd>
          </div>
        </dl>
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
                  <strong>{visit.visit_date ?? visit.scheduled_date ?? '-'}</strong>
                  <span>{visit.visit_type || 'Sin tipo'}</span>
                </div>
                <p>Estado: {visit.visit_status || '-'}</p>
                <div className="actions-inline">
                  <Link to={`/visits/${visit.id}/stratification`}>Evaluación clínica</Link>
                  <Link to={`/visits/${visit.id}/interventions`}>Intervenciones</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Última puntuación CMO-RCV</h2>
        {latestCmoScore && cmoMeta ? (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: '1rem',
              padding: '0.65rem 1rem', borderRadius: '8px',
              background: cmoMeta.bg, border: `1px solid ${cmoMeta.border}`,
            }}
          >
            <span style={{ fontSize: '2rem', fontWeight: 700, color: cmoMeta.color, lineHeight: 1, minWidth: '2.5ch', textAlign: 'center' }}>
              {latestCmoScore.score}
            </span>
            <div>
              <div style={{ fontWeight: 700, color: cmoMeta.color }}>{cmoMeta.label}</div>
              <div className="help-text" style={{ fontSize: '0.8rem', marginTop: '0.1rem' }}>
                Guardado: {latestCmoScore.updated_at?.slice(0, 10) ?? '-'}
              </div>
            </div>
          </div>
        ) : (
          <p className="help-text">Sin puntuación CMO registrada. Completa la estratificación basal.</p>
        )}
      </section>

      <section className="card">
        <h2>Resumen de intervenciones</h2>
        {interventions.length === 0 ? (
          <p className="help-text">No hay intervenciones registradas.</p>
        ) : (
          <ul className="simple-list">
            {interventions.slice(0, 10).map((item) => (
              <li key={item.id}>
                <span>{item.intervention_type}</span>
                <span>P{item.priority_level ?? '-'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
