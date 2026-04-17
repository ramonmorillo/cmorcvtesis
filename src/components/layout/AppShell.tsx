import { Link, NavLink, Outlet } from 'react-router-dom';

export function AppShell() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/patients">
          CMO-RCV Tesis
        </Link>
        <nav>
          <NavLink to="/patients" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Pacientes
          </NavLink>
          <NavLink to="/patients/new" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Nuevo paciente
          </NavLink>
        </nav>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
