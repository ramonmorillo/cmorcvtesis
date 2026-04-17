import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { signInWithPassword } from '../services/authService';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

    navigate('/patients');
  };

  return (
    <div className="auth-page">
      <section className="card auth-card">
        <h1>Acceso profesional</h1>
        <p>Introduce tus credenciales de Supabase Auth para continuar.</p>
        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
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
      </section>
      {errorMessage ? <ErrorState title="No se pudo iniciar sesión" message={errorMessage} /> : null}
    </div>
  );
}
