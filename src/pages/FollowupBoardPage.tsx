import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { CmoLevelBadge } from '../components/ui/CmoLevelBadge';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge, type StatusTone } from '../components/ui/StatusBadge';
import { getVisitTypeLabel } from '../constants/enums';
import { buildFollowupBoard, filterBoard, type BoardFilter, type BoardRow, type BoardState } from '../features/visit-plan/followupBoard';
import { describeElapsedDays } from '../features/visit-plan/planModel';
import { PLAN_MODULE_UNAVAILABLE_MESSAGE, loadBoardData, type BoardData } from '../features/visit-plan/visitPlanService';

const STATE_META: Record<BoardState, { label: string; tone: StatusTone }> = {
  overdue_no_appointment: { label: 'Vencido · sin cita', tone: 'danger' },
  no_appointment: { label: 'Sin cita', tone: 'warning' },
  overdue_scheduled: { label: 'Vencido · con cita', tone: 'warning' },
  scheduled: { label: 'Programado', tone: 'positive' },
};

const FILTERS: Array<{ key: BoardFilter; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'no_appointment', label: 'Sin cita' },
  { key: 'overdue', label: 'Vencidos' },
  { key: 'with_pending', label: 'Con pendientes' },
];

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function describeNext(row: BoardRow): string {
  if (!row.nextScheduledDate || row.daysToNext === null) return 'Sin cita';
  if (row.daysToNext === 0) return 'Hoy';
  return row.daysToNext === 1 ? 'Mañana' : `En ${row.daysToNext} días`;
}

function PendingCell({ row }: { row: BoardRow }) {
  if (row.pendingCount === 0) return <span className="cell-muted">—</span>;
  const labels = [...row.openItems.map((i) => i.label), ...row.derivedPending.map((d) => d.label)];
  const shown = labels.slice(0, 2);
  const carried = Math.max(0, ...row.openItems.map((i) => i.carriedOverVisits));
  return (
    <div className="followup-pending">
      <strong>{row.pendingCount}</strong>
      <ul>
        {shown.map((text) => (
          <li key={text}>{text}</li>
        ))}
        {labels.length > shown.length ? <li className="cell-muted">+{labels.length - shown.length} más</li> : null}
      </ul>
      {carried > 0 ? <StatusBadge tone="warning">Arrastrado {carried} {carried === 1 ? 'visita' : 'visitas'}</StatusBadge> : null}
    </div>
  );
}

export function FollowupBoardPage() {
  const [data, setData] = useState<BoardData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<BoardFilter>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let mounted = true;
    void loadBoardData().then((result) => {
      if (!mounted) return;
      setData(result.data);
      setErrorMessage(result.errorMessage);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const rows = useMemo(
    () => (data ? buildFollowupBoard({ ...data, today: todayIso() }) : []),
    [data],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return filterBoard(rows, filter).filter((r) => !q || r.studyCode.toLowerCase().includes(q));
  }, [rows, filter, query]);

  const counts = useMemo(
    () => ({
      total: rows.length,
      noAppointment: filterBoard(rows, 'no_appointment').length,
      overdue: filterBoard(rows, 'overdue').length,
      withPending: filterBoard(rows, 'with_pending').length,
    }),
    [rows],
  );

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="IRIS · Seguimiento"
        title="Seguimiento de pacientes"
        description="Una fila por paciente: cuándo fue la última visita, si hay próxima cita y qué objetivos o pendientes siguen abiertos. Ordenado por urgencia."
      />

      {loading ? <LoadingState label="Cargando seguimiento..." /> : null}
      {errorMessage ? <ErrorState title="No se pudo cargar el seguimiento" message={errorMessage} /> : null}
      {data?.planUnavailable ? <Notice tone="warning">{PLAN_MODULE_UNAVAILABLE_MESSAGE}</Notice> : null}
      {data?.warnings.map((warning) => (
        <Notice key={warning} tone="warning">{warning}</Notice>
      ))}

      {data ? (
        <section className="card">
          <dl className="inline-facts">
            <div><dt>Pacientes</dt><dd className="inline-facts-text">{counts.total}</dd></div>
            <div><dt>Sin cita</dt><dd className="inline-facts-text">{counts.noAppointment}</dd></div>
            <div><dt>Vencidos (&gt;90 días)</dt><dd className="inline-facts-text">{counts.overdue}</dd></div>
            <div><dt>Con pendientes</dt><dd className="inline-facts-text">{counts.withPending}</dd></div>
          </dl>

          <div className="followup-toolbar">
            <div role="group" aria-label="Filtro" className="followup-filters">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={filter === f.key ? 'button-sm' : 'button-secondary button-sm'}
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <input
              type="search"
              aria-label="Buscar código de estudio"
              placeholder="Buscar código"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Nivel CMO</th>
                  <th>Última visita</th>
                  <th>Próxima cita</th>
                  <th>Estado</th>
                  <th>Pendientes</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr><td colSpan={7} className="empty-inline">No hay pacientes con este filtro.</td></tr>
                ) : (
                  visible.map((row) => {
                    const meta = STATE_META[row.state];
                    return (
                      <tr key={row.patientId}>
                        <td className="strong"><Link to={`/patients/${row.patientId}`}>{row.studyCode}</Link></td>
                        <td>{row.cmoLevel ? <CmoLevelBadge level={row.cmoLevel} score={row.cmoScore} variant="short" /> : <span className="cell-muted">Sin estratificar</span>}</td>
                        <td>
                          <div>{describeElapsedDays(row.daysSinceLast)}</div>
                          <div className="cell-muted">
                            {row.lastAttendedDate ? `${formatDate(row.lastAttendedDate)}${row.lastVisitType ? ` · ${getVisitTypeLabel(row.lastVisitType)}` : ''}` : ''}
                          </div>
                        </td>
                        <td>
                          <div>{row.nextScheduledDate ? formatDate(row.nextScheduledDate) : 'Sin cita'}</div>
                          <div className="cell-muted">
                            {row.nextScheduledDate ? `${describeNext(row)}${row.nextVisitType ? ` · ${getVisitTypeLabel(row.nextVisitType)}` : ''}` : ''}
                          </div>
                          {row.unrecordedAppointmentDate ? (
                            <div><StatusBadge tone="warning">Cita del {formatDate(row.unrecordedAppointmentDate)} sin registrar</StatusBadge></div>
                          ) : null}
                        </td>
                        <td><StatusBadge tone={meta.tone} dot>{meta.label}</StatusBadge></td>
                        <td><PendingCell row={row} /></td>
                        <td className="table-actions">
                          {row.lastVisitId ? <Link to={`/visits/${row.lastVisitId}/plan`}>Planificar</Link> : null}
                          <Link to={`/patients/${row.patientId}/visits/new`}>Nueva visita</Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <p className="help-text">
            «Vencido» = última visita realizada hace más de 90 días (misma regla que el dashboard). Los pendientes incluyen los objetivos del plan de visita y, marcados aparte,
            las recomendaciones a otros profesionales sin respuesta y las intervenciones sin entregar.
          </p>
        </section>
      ) : null}
    </div>
  );
}
