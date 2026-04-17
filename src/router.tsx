import { createBrowserRouter, Navigate } from 'react-router-dom';

import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { NewPatientPage } from './pages/NewPatientPage';
import { NewVisitPage } from './pages/NewVisitPage';
import { PatientDetailPage } from './pages/PatientDetailPage';
import { PatientsPage } from './pages/PatientsPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/patients" replace /> },
      { path: '/patients', element: <PatientsPage /> },
      { path: '/patients/new', element: <NewPatientPage /> },
      { path: '/patients/:id', element: <PatientDetailPage /> },
      { path: '/patients/:id/visits/new', element: <NewVisitPage /> },
    ],
  },
]);
