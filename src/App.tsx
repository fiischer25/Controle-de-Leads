import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider, useData } from './context/DataContext';
import { ToastProvider } from './context/ToastContext';
import { AppLayout } from './components/layout/AppLayout';
import { Logo } from './components/layout/Logo';
import { Spinner } from './components/ui';
import { LoginPage, SetupPage } from './pages/LoginPage';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const LeadsPage = lazy(() => import('./pages/LeadsPage'));
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const ClientDetailPage = lazy(() => import('./pages/ClientDetailPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const AgendaPage = lazy(() => import('./pages/AgendaPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const TeamPage = lazy(() => import('./pages/TeamPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Logo light className="h-12 w-12" />
      <Spinner />
    </div>
  );
}

function AdminOnly({ children }: { children: JSX.Element }) {
  const { isAdmin } = useData();
  return isAdmin ? children : <Navigate to="/" replace />;
}

function AuthenticatedApp() {
  const { loading } = useData();
  if (loading) return <FullScreenLoader />;
  return (
    <Suspense fallback={<div className="flex justify-center py-24"><Spinner /></div>}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="oportunidades" element={<LeadsPage />} />
          <Route path="clientes" element={<ClientsPage />} />
          <Route path="clientes/:id" element={<ClientDetailPage />} />
          <Route path="projetos" element={<ProjectsPage />} />
          <Route path="projetos/:id" element={<ProjectDetailPage />} />
          <Route path="tarefas" element={<TasksPage />} />
          <Route path="agenda" element={<AgendaPage />} />
          <Route path="relatorios" element={<ReportsPage />} />
          <Route path="equipe" element={<TeamPage />} />
          <Route path="configuracoes" element={<AdminOnly><SettingsPage /></AdminOnly>} />
          <Route path="perfil" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

function Gate() {
  const { status, userId } = useAuth();
  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'setup') return <SetupPage />;
  if (status === 'signed_out' || !userId) return <LoginPage />;
  return (
    <DataProvider key={userId} userId={userId}>
      <AuthenticatedApp />
    </DataProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
