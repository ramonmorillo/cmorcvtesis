import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import {
  VISIT_STATUS_OPTIONS,
  getVisitStatusLabel,
  getVisitTypeLabel,
  getVisitTypeSortOrder,
  type VisitStatus,
} from '../constants/enums';
import { getLatestCmoScoreByPatient, listCmoScoresByPatient, type CmoScoreHistoryEntry, type CmoScoreRecord } from '../services/cmoScoreService';
import { listInterventionsByPatient, type PriorityLevel } from '../services/interventionService';
import { getPatientById, type Patient } from '../services/patientService';
import { listVisitsByPatient, updateVisit, type Visit } from '../services/visitService';

const LEVEL_META = {
  1: { label: 'Nivel 1 · Prioridad', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
  2: { label: 'Nivel 2 · Intermedio', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  3: { label: 'Nivel 3 · Basal', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
} as const;

const PRIORITY_LEVEL_LABEL: Record<PriorityLevel, string> = {
  high: '1 · Prioridad',
  medium: '2 · Intermedio',
  low: '3 · Basal',
};

function toSortTs(dateLike: string | null): number {
  return dateLike ? new Date(dateLike).getTime() : Number.MAX_SAFE_INTEGER;
}

function compareVisitsTimeline(a: Visit, b: Visit): number {
  const byDate = toSortTs(a.visit_date ?? a.scheduled_date) - toSortTs(b.visit_date ?? b.scheduled_date);
  if (byDate !== 0) return byDate;

  const byVisitNumber = (a.visit_number ?? Number.MAX_SAFE_INTEGER) - (b.visit_number ?? Number.MAX_SAFE_INTEGER);
  if (byVisitNumber !== 0) return byVisitNumber;

  const byVisitType = getVisitTypeSortOrder(a.visit_type) - getVisitTypeSortOrder(b.visit_type);
  if (byVisitType !== 0) return byVisitType;

  return (a.created_at ?? '').localeCompare(b.created_at ?? '');
}

function compareCmoDesc(a: CmoScoreHistoryEntry, b: CmoScoreHistoryEntry): number {
  const byDate = toSortTs(b.visit_date ?? b.scheduled_date) - toSortTs(a.visit_date ?? a.scheduled_date);
  if (byDate !== 0) return byDate;

  const byVisit = (b.visit_number ?? Number.NEGATIVE_INFINITY) - (a.visit_number ?? Number.NEGATIVE_INFINITY);
  if (byVisit !== 0) return byVisit;

  return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
}

export function PatientDetailPage() {
  const { id = '' } = useParams();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [latestCmoScore, setLatestCmoScore] = useState<CmoScoreRecord | null>(null);
  const [cmoHistory, setCmoHistory] = useState<CmoScoreHistoryEntry[]>([]);
  const [interventions, setInterventions] = useState<Array<{ id: string; visit_id: string; intervention_type: string; priority_level: PriorityLevel | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      const [patientResult, visitsResult, cmoResult, cmoHistoryResult, interventionsResult] = await Promise.all([
        getPatientById(id),
        listVisitsByPatient(id),
        getLatestCmoScoreByPatient(id),
        listCmoScoresByPatient(id),
        listInterventionsByPatient(id),
      ]);

      setPatient(patientResult.data);
      setVisits(visitsResult.data);
      setLatestCmoScore(cmoResult.data);
      setCmoHistory(cmoHistoryResult.data);
      setInterventions(
        interventionsResult.data.map((x) => ({
          id: x.id,
          visit_id: x.visit_id,
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

  const handleStatusChange = async (visitId: string, status: VisitStatus) => {
    const updates = status === 'completed'
      ? { visit_status: status, visit_date: new Date().toISOString().slice(0, 10) }
      : { visit_status: status };
    const { data, errorMessage: err } = await updateVisit(visitId, updates);
    if (!err && data) {
      setVisits((prev) => prev.map((v) => (v.id === visitId ? { ...v, ...data } : v)).sort(compareVisitsTimeline));
    }
  };

  const visitsTimeline = useMemo(() => [...visits].sort(compareVisitsTimeline), [visits]);
  const latestVisitId = useMemo(() => visitsTimeline[visitsTimeline.length - 1]?.id, [visitsTimeline]);

  const cmoMeta = latestCmoScore ? LEVEL_META[latestCmoScore.priority as 1 | 2 | 3] : null;
  const cmoHistoryDesc = useMemo(() => [...cmoHistory].sort(compareCmoDesc), [cmoHistory]);

  const scoreByVisitId = useMemo(() => {
    const map = new Map<string, CmoScoreHistoryEntry>();
    cmoHistoryDesc.forEach((entry) => {
      if (!map.has(entry.visit_id)) {
        map.set(entry.visit_id, entry);
      }
    });
    return map;
  }, [cmoHistoryDesc]);

  const interventionsByVisitId = useMemo(() => {
    const map = new Map<string, number>();
    interventions.forEach((item) => {
      map.set(item.visit_id, (map.get(item.visit_id) ?? 0) + 1);
    });
    return map;
  }, [interventions]);

  const latestHistory = cmoHistoryDesc[0] ?? null;
  const previousHistory = cmoHistoryDesc[1] ?? null;
  const cmoDelta = latestHistory && previousHistory ? latestHistory.score - previousHistory.score : null;

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
        <h2>Longitudinalidad de visitas</h2>
        {visitsTimeline.length === 0 ? (
          <EmptyState
            title="Sin visitas registradas"
            description="Añade la primera visita para iniciar seguimiento."
            action={<Link to={`/patients/${patient.id}/visits/new`}>Nueva visita</Link>}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th style={{ textAlign: 'right' }}>Score CMO</th>
                  <th>Nivel CMO</th>
                  <th style={{ textAlign: 'right' }}>Intervenciones</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visitsTimeline.map((visit) => {
                  const scoreEntry = scoreByVisitId.get(visit.id) ?? null;
                  const levelMeta = scoreEntry ? LEVEL_META[scoreEntry.priority as 1 | 2 | 3] : null;
                  const interventionsCount = interventionsByVisitId.get(visit.id) ?? 0;

                  return (
                    <tr key={visit.id}>
                      <td>{getVisitTypeLabel(visit.visit_type)}</td>
                      <td>{visit.visit_date ?? visit.scheduled_date ?? '-'}</td>
                      <td>
                        <div className="actions-inline" style={{ alignItems: 'center' }}>
                          <select
                            value={visit.visit_status ?? ''}
                            onChange={(e) => void handleStatusChange(visit.id, e.target.value as VisitStatus)}
                            style={{ fontSize: '0.85rem' }}
                          >
                            <option value="" disabled>Estado</option>
                            {VISIT_STATUS_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                          <span>{getVisitStatusLabel(visit.visit_status)}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{scoreEntry ? scoreEntry.score : '-'}</td>
                      <td style={{ color: levelMeta?.color ?? 'inherit', fontWeight: levelMeta ? 600 : 400 }}>
                        {levelMeta ? levelMeta.label : '-'}
                      </td>
                      <td style={{ textAlign: 'right' }}>{interventionsCount}</td>
                      <td>
                        <div className="actions-inline">
                          <Link to={`/visits/${visit.id}/stratification`}>Evaluación clínica</Link>
                          <Link to={`/visits/${visit.id}/interventions`}>Intervenciones</Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Resumen de evolución CMO-RCV</h2>
        {latestHistory ? (
          <ul className="simple-list">
            <li>
              <span>Última puntuación</span>
              <strong>{latestHistory.score}</strong>
            </li>
            <li>
              <span>Nivel actual</span>
              <strong style={{ color: LEVEL_META[latestHistory.priority as 1 | 2 | 3].color }}>
                {LEVEL_META[latestHistory.priority as 1 | 2 | 3].label}
              </strong>
            </li>
            <li>
              <span>Visitas previas con score</span>
              <strong>{Math.max(cmoHistoryDesc.length - 1, 0)}</strong>
            </li>
            <li>
              <span>Cambio respecto a visita anterior</span>
              <strong>
                {cmoDelta === null
                  ? 'N/A'
                  : cmoDelta > 0
                    ? `+${cmoDelta}`
                    : `${cmoDelta}`}
              </strong>
            </li>
          </ul>
        ) : (
          <p className="help-text">Sin puntuación CMO registrada. Completa la estratificación basal.</p>
        )}
      </section>

      {cmoHistoryDesc.length > 1 ? (
        <section className="card">
          <h2>Evolución histórica CMO-RCV</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Visita</th>
                  <th>Fecha</th>
                  <th style={{ textAlign: 'right' }}>Puntuación</th>
                  <th>Nivel</th>
                </tr>
              </thead>
              <tbody>
                {cmoHistoryDesc.map((entry, i) => {
                  const m = LEVEL_META[entry.priority as 1 | 2 | 3];
                  const prev = cmoHistoryDesc[i + 1];
                  const delta = prev ? entry.score - prev.score : null;
                  return (
                    <tr key={entry.id}>
                      <td>{entry.visit_number != null ? `V${entry.visit_number}` : 'Extraordinaria'}</td>
                      <td>{entry.visit_date ?? entry.scheduled_date ?? entry.updated_at?.slice(0, 10) ?? '-'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: m.color }}>
                        {entry.score}
                        {delta !== null ? (
                          <span style={{ fontSize: '0.75rem', fontWeight: 400, color: delta > 0 ? '#dc2626' : delta < 0 ? '#16a34a' : '#6b7280', marginLeft: '0.35rem' }}>
                            {delta > 0 ? `+${delta}` : delta}
                          </span>
                        ) : null}
                      </td>
                      <td style={{ color: m.color, fontWeight: 600, fontSize: '0.85rem' }}>{m.label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="card">
        <h2>Resumen de intervenciones</h2>
        {interventions.length === 0 ? (
          <p className="help-text">No hay intervenciones registradas.</p>
        ) : (
          <ul className="simple-list">
            {interventions.slice(0, 10).map((item) => (
              <li key={item.id}>
                <span>{item.intervention_type}</span>
                <span>{item.priority_level ? PRIORITY_LEVEL_LABEL[item.priority_level] : '-'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
