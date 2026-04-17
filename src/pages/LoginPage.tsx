import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
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
    <div className="auth-page">
      <section className="card auth-card">
        <h1>Acceso profesional</h1>
        <p>Introduce tus credenciales de Supabase Auth para continuar.</p>
        {checkingSession ? (
          <p>Comprobando sesión activa...</p>
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
            <button type="submit" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        )}
      </section>
      {errorMessage ? <ErrorState title="No se pudo iniciar sesión" message={errorMessage} /> : null}
    </div>
  );
}
