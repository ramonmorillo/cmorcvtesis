import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge, type StatusTone } from '../components/ui/StatusBadge';
import { getVisitStatusLabel, getVisitTypeLabel } from '../constants/enums';
import { listPatients, type Patient } from '../services/patientService';
import { listVisitsInDateRange, type AgendaVisit } from '../services/visitService';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Fecha que ubica la visita en la agenda: realizada si existe; si no, programada (mismo criterio que la ficha).
function agendaDate(visit: AgendaVisit): string | null {
  return visit.visit_date ?? visit.scheduled_date ?? null;
}

function statusTone(status: string | null): StatusTone {
  if (status === 'completed') return 'positive';
  if (status === 'cancelled') return 'neutral';
  return 'info';
}

// Rejilla de 6 semanas empezando en lunes.
function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

export function AgendaPage() {
  const navigate = useNavigate();
  const todayIso = toIsoDate(new Date());
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [visits, setVisits] = useState<AgendaVisit[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [newAppointmentPatientId, setNewAppointmentPatientId] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);
  const rangeFrom = toIsoDate(grid[0]);
  const rangeTo = toIsoDate(grid[grid.length - 1]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    void listVisitsInDateRange(rangeFrom, rangeTo).then((result) => {
      if (!mounted) return;
      setVisits(result.data);
      setErrorMessage(result.errorMessage);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [rangeFrom, rangeTo]);

  useEffect(() => {
    void listPatients().then((result) => {
      setPatients([...result.data].sort((a, b) => a.study_code.localeCompare(b.study_code, 'es', { numeric: true })));
    });
  }, []);

  const visitsByDate = useMemo(() => {
    const map = new Map<string, AgendaVisit[]>();
    visits.forEach((visit) => {
      const date = agendaDate(visit);
      if (!date) return;
      map.set(date, [...(map.get(date) ?? []), visit]);
    });
    return map;
  }, [visits]);

  const selectedVisits = useMemo(
    () => [...(visitsByDate.get(selectedDate) ?? [])].sort((a, b) => (a.study_code ?? '').localeCompare(b.study_code ?? '', 'es', { numeric: true })),
    [visitsByDate, selectedDate],
  );

  const moveMonth = (delta: number) => {
    setCursor((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const goToday = () => {
    const now = new Date();
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedDate(todayIso);
  };

  const selectDate = (iso: string) => {
    setSelectedDate(iso);
    const [year, month] = iso.split('-').map(Number);
    if (year !== cursor.year || month - 1 !== cursor.month) setCursor({ year, month: month - 1 });
  };

  const shiftSelectedDay = (delta: number) => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    selectDate(toIsoDate(new Date(year, month - 1, day + delta)));
  };

  const selectedLabel = new Date(`${selectedDate}T12:00:00`).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const handleCreateAppointment = () => {
    if (!newAppointmentPatientId) return;
    navigate(`/patients/${newAppointmentPatientId}/visits/new?date=${selectedDate}`);
  };

  return (
    <div className="page-stack">
      <PageHeader eyebrow="IRIS · Agenda" title="Agenda" description="Visitas programadas y realizadas por día. Las citas se crean como visitas programadas del paciente." />

      {errorMessage ? <ErrorState title="No se pudo cargar la agenda" message={errorMessage} /> : null}

      <div className="agenda-layout">
        <section className="card agenda-calendar" aria-label="Calendario">
          <div className="agenda-calendar-header">
            <button type="button" className="button-ghost button-sm" onClick={() => moveMonth(-1)} aria-label="Mes anterior">‹</button>
            <strong>{MONTHS[cursor.month]} {cursor.year}</strong>
            <button type="button" className="button-ghost button-sm" onClick={() => moveMonth(1)} aria-label="Mes siguiente">›</button>
          </div>
          <div className="agenda-grid" role="grid">
            {WEEKDAYS.map((day) => (
              <span key={day} className="agenda-weekday" role="columnheader">{day}</span>
            ))}
            {grid.map((date) => {
              const iso = toIsoDate(date);
              const count = visitsByDate.get(iso)?.length ?? 0;
              const classes = [
                'agenda-day',
                date.getMonth() !== cursor.month ? 'agenda-day-outside' : '',
                iso === todayIso ? 'agenda-day-today' : '',
                iso === selectedDate ? 'agenda-day-selected' : '',
              ].filter(Boolean).join(' ');
              return (
                <button
                  key={iso}
                  type="button"
                  className={classes}
                  onClick={() => selectDate(iso)}
                  aria-pressed={iso === selectedDate}
                  aria-label={`${date.getDate()} de ${MONTHS[date.getMonth()]}${count ? `, ${count} visita(s)` : ''}`}
                >
                  {date.getDate()}
                  {count > 0 ? <span className="agenda-day-count" aria-hidden="true">{count}</span> : null}
                </button>
              );
            })}
          </div>
          {loading ? <p className="help-text">Cargando visitas...</p> : null}
        </section>

        <section className="card agenda-day-panel" aria-labelledby="agenda-day-title">
          <div className="agenda-day-header">
            <button type="button" className="button-ghost button-sm" onClick={() => shiftSelectedDay(-1)} aria-label="Día anterior">‹</button>
            <button type="button" className="button-secondary button-sm" onClick={goToday}>Hoy</button>
            <button type="button" className="button-ghost button-sm" onClick={() => shiftSelectedDay(1)} aria-label="Día siguiente">›</button>
            <h2 id="agenda-day-title" className="agenda-day-title">{selectedLabel}</h2>
          </div>

          {selectedVisits.length === 0 ? (
            <p className="empty-inline">No hay citas para este día.</p>
          ) : (
            <ul className="activity-list">
              {selectedVisits.map((visit) => (
                <li key={visit.id}>
                  <span className="activity-main">
                    <Link to={`/patients/${visit.patient_id}`}>{visit.study_code ?? 'Paciente'}</Link> · {getVisitTypeLabel(visit.visit_type)}
                  </span>
                  <StatusBadge tone={statusTone(visit.visit_status)}>{getVisitStatusLabel(visit.visit_status)}</StatusBadge>
                  <Link to={`/patients/${visit.patient_id}/visits/${visit.id}`}>Abrir</Link>
                </li>
              ))}
            </ul>
          )}

          <div className="agenda-create">
            <label>
              Crear cita para este día
              <select value={newAppointmentPatientId} onChange={(e) => setNewAppointmentPatientId(e.target.value)}>
                <option value="">Seleccionar paciente</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>{patient.study_code}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={handleCreateAppointment} disabled={!newAppointmentPatientId}>
              Crear cita
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
