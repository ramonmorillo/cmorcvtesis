import { Link } from 'react-router-dom';

import { getVisitTypeLabel } from '../../constants/enums';

type DrilldownItem =
  | { kind: 'patient'; id: string; study_code: string | null }
  | { kind: 'visit'; id: string; patient_id: string; study_code: string | null; visit_type: string | null; date: string | null };

type DrilldownListProps = {
  items: DrilldownItem[];
  /** Ruta de destino para cada visita (p. ej. estratificación o intervenciones). */
  visitHref?: (visitId: string) => string;
  label?: string;
};

// Desglose nominal plegable de un contador del dashboard. No recalcula nada: muestra los registros que suman al KPI.
export function DrilldownList({ items, visitHref, label = 'Ver listado' }: DrilldownListProps) {
  if (items.length === 0) return null;

  return (
    <details className="drilldown">
      <summary>{label} ({items.length})</summary>
      <ul className="drilldown-list">
        {items.map((item) =>
          item.kind === 'patient' ? (
            <li key={item.id}>
              <Link to={`/patients/${item.id}`}>{item.study_code ?? 'Paciente'}</Link>
            </li>
          ) : (
            <li key={item.id}>
              <Link to={visitHref ? visitHref(item.id) : `/patients/${item.patient_id}/visits/${item.id}`}>
                {item.study_code ?? 'Paciente'} · {getVisitTypeLabel(item.visit_type)}
              </Link>
              <span className="drilldown-meta">{item.date ?? 'sin fecha'}</span>
            </li>
          ),
        )}
      </ul>
    </details>
  );
}
