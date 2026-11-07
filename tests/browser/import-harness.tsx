import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MedicationDocumentImport } from '../../src/features/medications/documentImport/MedicationDocumentImport';
import { MedicationPanel } from '../../src/features/medications/MedicationPanel';
import '../../src/styles/main.css';
const patientId = '22222222-2222-4222-8222-222222222222',
  visitId = '33333333-3333-4333-8333-333333333333';
function Harness() {
  const [imported, setImported] = useState(false);
  const [mounted, setMounted] = useState(true);
  return (
    <>
      <h1>Documento sintético</h1>
      <button onClick={() => setMounted(false)}>Cambiar paciente</button>
      {new URLSearchParams(location.search).has('manual') ? (
        <MedicationPanel patientId={patientId} visitId={visitId} />
      ) : (
        mounted && (
          <MedicationDocumentImport
            patientId={patientId}
            visitId={visitId}
            disabled={false}
            existing={
              new URLSearchParams(location.search).has('duplicate')
                ? [
                    {
                      medication_catalog_id: '44444444-4444-4444-8444-444444444444',
                      display_name: 'Atorvastatina 40 mg',
                    },
                  ]
                : []
            }
            onImported={async () => setImported(true)}
          />
        )
      )}
      <output>{imported ? 'Lote guardado' : ''}</output>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
