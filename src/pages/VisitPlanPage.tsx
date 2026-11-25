import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { VisitTabs } from '../components/common/VisitTabs';
import { VisitPlanPanel } from '../features/visit-plan/VisitPlanPanel';
import { getVisitById, listVisitsByPatient, type Visit } from '../services/visitService';

export function VisitPlanPage() {
  const { visitId = '' } = useParams();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [patientVisits, setPatientVisits] = useState<Visit[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setVisit(null);
    setErrorMessage(null);
    void (async () => {
      const visitResult = await getVisitById(visitId);
      if (!mounted) return;
      if (visitResult.errorMessage || !visitResult.data) {
        setErrorMessage(visitResult.errorMessage ?? 'No se encontró la visita.');
        return;
      }
      setVisit(visitResult.data);
      const visitsResult = await listVisitsByPatient(visitResult.data.patient_id);
      if (mounted) setPatientVisits(visitsResult.data);
    })();
    return () => {
      mounted = false;
    };
  }, [visitId]);

  if (!visitId) {
    return <ErrorState title="Visita no encontrada" message="No se recibió identificador de visita en la ruta." />;
  }

  return (
    <div className="page-stack">
      <section className="card">
        <h1>Plan de visita</h1>
        <VisitTabs visitId={visitId} active="plan" />
        {errorMessage ? <ErrorState title="No se pudo cargar la visita" message={errorMessage} /> : null}
        {visit ? <VisitPlanPanel visit={visit} patientVisits={patientVisits} /> : null}
      </section>
    </div>
  );
}
