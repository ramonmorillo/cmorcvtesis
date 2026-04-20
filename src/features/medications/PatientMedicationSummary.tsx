import type { PatientMedication } from './types';

type PatientMedicationSummaryProps = {
  medications: PatientMedication[];
  warning: string | null;
};

function formatStartDate(value: string | null): string {
  if (!value) return '-';
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
              <div>
                <strong>{item.medication_catalog?.display_name ?? 'Medicamento sin nombre'}</strong>
                <p className="help-text" style={{ marginTop: '0.25rem' }}>
                  Dosis: {item.dose_text || '-'} · Frecuencia: {item.frequency_text || '-'} · Vía: {item.route_text || '-'} · Inicio: {formatStartDate(item.start_date)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
