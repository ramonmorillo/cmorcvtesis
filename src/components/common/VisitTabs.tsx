import { Link } from 'react-router-dom';

type VisitTab = 'clinical' | 'interventions' | 'questionnaires' | 'documents' | 'reports';

type VisitTabsProps = {
  visitId: string;
  active: VisitTab;
};

export function VisitTabs({ visitId, active }: VisitTabsProps) {
  return (
    <nav className="visit-tabs" aria-label="Navegación de visita">
      <Link className={active === 'clinical' ? 'visit-tab active' : 'visit-tab'} to={`/visits/${visitId}/stratification`}>
        Datos clínicos
      </Link>
      <Link className={active === 'interventions' ? 'visit-tab active' : 'visit-tab'} to={`/visits/${visitId}/interventions`}>
        Intervenciones
      </Link>
      <Link className={active === 'questionnaires' ? 'visit-tab active' : 'visit-tab'} to={`/visits/${visitId}/questionnaires`}>
        Cuestionarios
      </Link>
      <Link className={active === 'documents' ? 'visit-tab active' : 'visit-tab'} to={`/visits/${visitId}/documents`}>
        Documentos
      </Link>
      <Link className={active === 'reports' ? 'visit-tab active' : 'visit-tab'} to={`/visits/${visitId}/reports`}>
        Informes
      </Link>
    </nav>
  );
}
