import type { PatientMedication } from './types';
import { normalizeMedicationDisplayName } from './displayFormat';

type PatientMedicationSummaryProps = {
  medications: PatientMedication[];
  warning: string | null;
  latestReviewDate: string | null;
};

function formatStartDate(value: string | null): string {
  if (!value) return '';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

export function PatientMedicationSummary({ medications, warning, latestReviewDate }: PatientMedicationSummaryProps) {
  const formattedLatestReviewDate = formatStartDate(latestReviewDate);

  return (
    <section className="card">
      <h2>Medicación activa actual</h2>

      {warning ? (
        <p className="help-text" style={{ marginBottom: '0.8rem', color: '#b45309' }}>
          ⚠️ {warning}
        </p>
      ) : null}

      {medications.length === 0 ? (
        <p className="help-text">Sin medicación activa registrada actualmente.</p>
      ) : (
        <>
          <ul className="simple-list">
            {medications.map((item) => (
              <li key={item.id}>
                <div style={{ width: '100%' }}>
                  <strong>{normalizeMedicationDisplayName(item.medication_catalog?.display_name ?? 'Medicamento sin nombre')}</strong>
                  {item.medication_catalog?.source === 'external_cima' ? (
                    <span className="badge-success" style={{ marginLeft: '0.45rem' }}>
                      CIMA
                    </span>
                  ) : null}
                  {(() => {
                    const startDate = formatStartDate(item.start_date);
                    const details = [
                      item.dose_text ? `Dosis: ${item.dose_text}` : null,
                      item.frequency_text ? `Frecuencia: ${item.frequency_text}` : null,
                      item.route_text ? `Vía: ${item.route_text}` : null,
                      startDate ? `Inicio: ${startDate}` : null,
                    ].filter((detail): detail is string => detail !== null);

                    if (details.length === 0) {
                      return null;
                    }

                    return (
                      <div style={{ marginTop: '0.2rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {details.map((detail) => (
                          <span key={detail} className="help-text">
                            {detail}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="help-text" style={{ marginTop: '0.8rem' }}>
        Tratamientos activos: {medications.length} · Última revisión de medicación: {formattedLatestReviewDate || 'No disponible'}
      </p>
    </section>
  );
}
