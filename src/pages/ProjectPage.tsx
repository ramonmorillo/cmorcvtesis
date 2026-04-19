import { THESIS_INSTITUTIONAL_REFERENCE } from '../constants/institutional';

export function ProjectPage() {
  return (
    <div className="page-stack">
      <section className="card iris-hero-card">
        <p className="iris-eyebrow">IRIS · Proyecto institucional</p>
        <h1>Marco académico y clínico</h1>
        <p className="help-text">
          Este módulo documenta la base universitaria del proyecto y el marco de investigación que soporta el uso de IRIS en seguimiento farmacoterapéutico.
        </p>
      </section>

      <section className="card institutional-block">
        <h2>Proyecto doctoral vinculado</h2>
        <p>
          <strong>“{THESIS_INSTITUTIONAL_REFERENCE.projectTitle}”</strong>
        </p>
        <div className="grid-2">
          <p>
            <strong>Doctoranda:</strong>
            <br />
            {THESIS_INSTITUTIONAL_REFERENCE.doctoralCandidate}
          </p>
          <p>
            <strong>Dirección de tesis:</strong>
            <br />
            {THESIS_INSTITUTIONAL_REFERENCE.thesisDirectors}
          </p>
          <p>
            <strong>Universidad:</strong>
            <br />
            {THESIS_INSTITUTIONAL_REFERENCE.university}
          </p>
          <p>
            <strong>Código SICEIA:</strong>
            <br />
            {THESIS_INSTITUTIONAL_REFERENCE.siceiaCode}
          </p>
        </div>
      </section>
    </div>
  );
}
