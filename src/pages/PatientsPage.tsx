import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { deletePatientById, listPatients, type Patient } from '../services/patientService';
import { supabase } from '../lib/supabase';

const LEVEL_META = {
  1: { label: 'N1 · Prioridad',  color: '#dc2626' },
  2: { label: 'N2 · Intermedio', color: '#d97706' },
  3: { label: 'N3 · Basal',      color: '#16a34a' },
} as const;

type PriorityEntry = { score: number; priority: 1 | 2 | 3 };
type PriorityMap = Record<string, PriorityEntry>;

export function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [priorities, setPriorities] = useState<PriorityMap>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deletingPatientId, setDeletingPatientId] = useState<string | null>(null);

  async function loadPatients(searchCode?: string) {
    setLoading(true);
    const result = await listPatients(searchCode);
    setPatients(result.data);
    setErrorMessage(result.errorMessage);

    if (supabase && result.data.length > 0) {
      const ids = result.data.map((p) => p.id);
      const { data } = await supabase
        .from('cmo_scores')
        .select('score,priority,visits!inner(patient_id)')
        .in('visits.patient_id', ids)
        .order('created_at', { ascending: false });

      const map: PriorityMap = {};
      for (const row of (data ?? []) as Array<{ score: number; priority: number; visits: { patient_id: string } | Array<{ patient_id: string }> }>) {
        const patientId = Array.isArray(row.visits) ? row.visits[0]?.patient_id : row.visits?.patient_id;
        const p = Number(row.priority) as 1 | 2 | 3;
        if (patientId && !map[patientId] && (p === 1 || p === 2 || p === 3)) {
          map[patientId] = { score: row.score, priority: p };
        }
      }
      setPriorities(map);
    } else {
      setPriorities({});
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

  const handleDeletePatient = async (patient: Patient) => {
    const confirmed = window.confirm('¿Seguro que deseas eliminar este paciente?');
    if (!confirmed) {
      return;
    }

    setActionMessage(null);
    setDeletingPatientId(patient.id);
    const result = await deletePatientById(patient.id);
    setDeletingPatientId(null);

    if (result.errorMessage || !result.success) {
      setActionMessage({
        type: 'error',
        text: result.errorMessage ?? 'No se pudo eliminar el paciente.',
      });
      return;
    }

    setActionMessage({
      type: 'success',
      text: `Paciente ${patient.study_code} eliminado correctamente.`,
    });
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
      {actionMessage ? (
        <p className={actionMessage.type === 'success' ? 'success-state' : 'error-state'}>{actionMessage.text}</p>
      ) : null}
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
                <td>
                  {priorities[patient.id] ? (
                    <span style={{ color: LEVEL_META[priorities[patient.id].priority].color, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {priorities[patient.id].score} pts · {LEVEL_META[priorities[patient.id].priority].label}
                    </span>
                  ) : '-'}
                </td>
                <td className="actions-inline">
                  <Link to={`/patients/${patient.id}`}>Abrir ficha</Link>
                  <button
                    type="button"
                    className="button-danger"
                    onClick={() => void handleDeletePatient(patient)}
                    disabled={deletingPatientId === patient.id}
                  >
                    {deletingPatientId === patient.id ? 'Eliminando...' : 'Eliminar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
