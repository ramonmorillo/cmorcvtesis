import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { VisitTabs } from '../components/common/VisitTabs';
import {
  generateClinicianVisitReportHtml,
  generatePatientVisitReportHtml,
  loadVisitReportData,
  openPrintableHtmlDocument,
  type ClinicianVisitReportData,
  type PatientVisitReportData,
} from '../services/reportService';
import { getVisitById } from '../services/visitService';

export function VisitReportsPage() {
  const { visitId = '' } = useParams();

  const [patientReport, setPatientReport] = useState<PatientVisitReportData | null>(null);
  const [clinicianReport, setClinicianReport] = useState<ClinicianVisitReportData | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [visitPatientId, setVisitPatientId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setErrorMessage(null);

      const [reportResult, visitResult] = await Promise.all([loadVisitReportData(visitId), getVisitById(visitId)]);
      setPatientReport(reportResult.patientReportData);
      setClinicianReport(reportResult.clinicianReportData);
      setMissingFields(reportResult.missingFields);
      setErrorMessage(reportResult.errorMessage);
      setVisitPatientId(visitResult.data?.patient_id ?? '');
      setLoading(false);
    }

    void loadData();
  }, [visitId]);

  const missingText = useMemo(() => {
    if (missingFields.length === 0) return null;
    return `Campos no disponibles para el informe (MVP): ${missingFields.join(', ')}.`;
  }, [missingFields]);

  if (loading) {
    return (
      <div className="page-stack">
        <section className="card">
          <h1>Informes de visita</h1>
          <p>Cargando...</p>
        </section>
      </div>
    );
  }

  if (!patientReport || !clinicianReport) {
    return <ErrorState title="No se pudieron preparar los informes" message={errorMessage ?? 'No disponible'} />;
  }

  return (
    <div className="page-stack">
      <section className="card">
        <h1>Informes de visita</h1>
        <VisitTabs visitId={visitId} active="reports" />

        {errorMessage ? <p className="help-text">Aviso: {errorMessage}</p> : null}
        {missingText ? <p className="help-text">{missingText}</p> : null}

        <div className="actions-inline" style={{ marginBottom: '1rem' }}>
          <button type="button" onClick={() => openPrintableHtmlDocument(generatePatientVisitReportHtml(patientReport))}>
            Abrir informe paciente (imprimible)
          </button>
          <button type="button" onClick={() => openPrintableHtmlDocument(generateClinicianVisitReportHtml(clinicianReport))}>
            Abrir informe médico (imprimible)
          </button>
          {visitPatientId ? (
            <Link className="button-link" to={`/patients/${visitPatientId}`}>
              Volver a ficha paciente
            </Link>
          ) : null}
        </div>

        <p className="help-text">
          Estos informes HTML están preparados para impresión y futura exportación PDF sin mezclar la lógica de datos con la UI.
        </p>
      </section>
    </div>
  );
}
