import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { IrisMark } from '../components/ui/IrisMark';
import { LoadingState } from '../components/ui/LoadingState';
import { getCurrentSession, signInWithPassword, subscribeToAuthChanges } from '../services/authService';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function ensureAnonymousState() {
      const { session, error } = await getCurrentSession();

      if (!mounted) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
        setCheckingSession(false);
        return;
      }

      if (session) {
        navigate('/dashboard', { replace: true });
        return;
      }

      setCheckingSession(false);
    }

    const subscription = subscribeToAuthChanges((event, session) => {
      if (!mounted) {
        return;
      }

      if (event === 'SIGNED_IN' && session) {
        navigate('/dashboard', { replace: true });
      }
    });

    void ensureAnonymousState();

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    const { error } = await signInWithPassword(email, password);

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="auth-layout">
      <aside className="auth-brand-panel">
        <div className="auth-brand-top">
          <IrisMark size={40} className="iris-mark-inverse" />
          <div>
            <p className="auth-brand-name">IRIS</p>
            <p className="auth-brand-tagline">Intelligent Risk &amp; Intervention Suite</p>
          </div>
        </div>

        <div className="auth-brand-body">
          <p className="auth-brand-lead">Plataforma de Atención Farmacéutica CMO a pacientes con Riesgo Cardiovascular</p>
          <svg className="auth-brand-graphic" viewBox="0 0 360 120" aria-hidden="true" focusable="false">
            <line x1="24" y1="96" x2="336" y2="96" className="graphic-axis" />
            <polyline points="24,44 128,60 232,52 336,66" className="graphic-trend" />
            {[
              [24, 44, 'Basal'],
              [128, 60, '3 m'],
              [232, 52, '6 m'],
              [336, 66, '12 m'],
            ].map(([x, y, label]) => (
              <g key={label as string}>
                <line x1={x} y1={y} x2={x} y2={96} className="graphic-drop" />
                <circle cx={x} cy={y} r="5" className="graphic-node" />
                <text x={x} y={114} textAnchor="middle" className="graphic-label">
                  {label}
                </text>
              </g>
            ))}
          </svg>
          <ul className="auth-brand-pillars">
            <li>Estratificación CMO</li>
            <li>Seguimiento longitudinal</li>
            <li>Intervención farmacéutica</li>
          </ul>
        </div>

        <p className="auth-brand-footer">Proyecto de investigación clínica · Metodología CMO</p>
      </aside>

      <main className="auth-form-panel">
        <section className="auth-card" aria-labelledby="auth-title">
          <header className="auth-card-header">
            <p className="iris-eyebrow">Bienvenido a IRIS</p>
            <h1 id="auth-title">Acceso profesional</h1>
            <p className="auth-supporting-copy">Introduce tus credenciales para continuar.</p>
          </header>

          {checkingSession ? (
            <LoadingState label="Comprobando sesión activa..." />
          ) : (
            <form onSubmit={handleSubmit} className="form-grid">
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoComplete="email"
                  placeholder="clinico@centro.com"
                />
              </label>
              <label>
                Contraseña
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  autoComplete="current-password"
                />
              </label>
              <button type="submit" className="button-block" disabled={loading}>
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
            </form>
          )}

          {errorMessage ? <ErrorState title="No se pudo iniciar sesión" message={errorMessage} /> : null}

          <p className="auth-note">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
              <path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
            </svg>
            Acceso exclusivo para personal autorizado
          </p>
        </section>
      </main>
    </div>
  );
}
