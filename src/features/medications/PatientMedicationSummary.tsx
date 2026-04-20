import type { PatientMedication } from './types';

type PatientMedicationSummaryProps = {
  medications: PatientMedication[];
  warning: string | null;
};

function formatStartDate(value: string | null): string {
  if (!value) return '';
  return value;
}

export function PatientMedicationSummary({ medications, warning }: PatientMedicationSummaryProps) {
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
        <ul className="simple-list">
          {medications.map((item) => (
            <li key={item.id}>
              <div style={{ width: '100%' }}>
                <strong>{item.medication_catalog?.display_name ?? 'Medicamento sin nombre'}</strong>
                <div style={{ marginTop: '0.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {item.dose_text ? <span className="help-text">Dosis: {item.dose_text}</span> : null}
                  {item.frequency_text ? <span className="help-text">Frecuencia: {item.frequency_text}</span> : null}
                  {item.route_text ? <span className="help-text">Vía: {item.route_text}</span> : null}
                  {formatStartDate(item.start_date) ? <span className="help-text">Inicio: {formatStartDate(item.start_date)}</span> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
