import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';

import { getCurrentSession, signOut, subscribeToAuthChanges } from '../../services/authService';

export function AppShell() {
  const navigate = useNavigate();
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function validateSession() {
      const { session, error } = await getCurrentSession();
      if (!mounted) return;

      if (error) {
        setSessionError(error.message);
        setCheckingSession(false);
        return;
      }

      if (!session) {
        navigate('/login', { replace: true });
        return;
      }

      setSessionError(null);
      setCheckingSession(false);
    }

    const subscription = subscribeToAuthChanges((event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT' || !session) {
        navigate('/login', { replace: true });
        return;
      }
      if (event === 'SIGNED_IN') setSessionError(null);
    });

    void validateSession();

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [navigate]);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setSessionError(null);
    const { error } = await signOut();
    if (error) {
      setSessionError(error.message);
      setIsSigningOut(false);
      return;
    }
    navigate('/login', { replace: true });
  };

  if (checkingSession) {
    return (
      <div className="app-shell">
        <main className="main-content">
          <p>Comprobando sesión...</p>
        </main>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="app-shell">
        <main className="main-content">
          <section className="card error-state" role="alert">
            <h2>Error de autenticación</h2>
            <p>{sessionError}</p>
            <Link to="/login" className="button-link" style={{ display: 'inline-block', marginTop: '1rem' }}>
              Ir al inicio de sesión
            </Link>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/dashboard">
          CMO-RCV Tesis
        </Link>
        <nav>
          <span className="session-pill">Conectado</span>
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Dashboard
          </NavLink>
          <NavLink to="/patients" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Pacientes
          </NavLink>
          <NavLink to="/patients/new" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Alta paciente
          </NavLink>
          <button type="button" className="nav-link nav-link-button" onClick={handleSignOut} disabled={isSigningOut}>
            {isSigningOut ? 'Saliendo...' : 'Cerrar sesión'}
          </button>
        </nav>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
