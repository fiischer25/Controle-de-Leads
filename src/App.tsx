import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider, useData } from './context/DataContext';
import { ToastProvider } from './context/ToastContext';
import { AppLayout } from './components/layout/AppLayout';
import { BrandMark } from './components/layout/Logo';
import { BrandingProvider } from './context/BrandingContext';
import { Spinner } from './components/ui';
import { LoginPage, SetupPage } from './pages/LoginPage';
import type { ModuleKey } from './lib/types';

const HomePage = lazy(() => import('./pages/HomePage'));
const OfficeDashboardPage = lazy(() => import('./pages/OfficeDashboardPage'));
const LeadsPage = lazy(() => import('./pages/LeadsPage'));
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const ClientDetailPage = lazy(() => import('./pages/ClientDetailPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const TeamPage = lazy(() => import('./pages/TeamPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6">
      <BrandMark size="lg" />
      <Spinner className="h-4 w-4" />
    </div>
  );
}

/** Telas de um módulo: quem não tem o acesso volta para o Painel. */
function RequireModule({ module, children }: { module: ModuleKey; children: JSX.Element }) {
  const { can } = useData();
  return can(module) ? children : <Navigate to="/" replace />;
}

/** Tela inicial: o administrador abre o dashboard do escritório; os demais, o próprio painel. */
function Home() {
  const { isAdmin } = useData();
  return isAdmin ? <OfficeDashboardPage /> : <HomePage />;
}

/** A agenda fica na tela inicial; links antigos continuam funcionando. */
function AgendaRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set('aba', 'agenda');
  return <Navigate to={`/?${params.toString()}`} replace />;
}

function AuthenticatedApp() {
  const { loading } = useData();
  if (loading) return <FullScreenLoader />;
  return (
    <Suspense fallback={<div className="flex justify-center py-24"><Spinner /></div>}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Home />} />
          <Route path="meu-painel" element={<HomePage />} />
          <Route path="projetos" element={<RequireModule module="projetos"><ProjectsPage /></RequireModule>} />
          <Route path="projetos/:id" element={<RequireModule module="projetos"><ProjectDetailPage /></RequireModule>} />
          <Route path="tarefas" element={<TasksPage />} />
          <Route path="agenda" element={<AgendaRedirect />} />
          <Route path="oportunidades" element={<RequireModule module="comercial"><LeadsPage /></RequireModule>} />
          <Route path="clientes" element={<RequireModule module="comercial"><ClientsPage /></RequireModule>} />
          <Route path="clientes/:id" element={<RequireModule module="comercial"><ClientDetailPage /></RequireModule>} />
          <Route path="relatorios" element={<RequireModule module="relatorios"><ReportsPage /></RequireModule>} />
          <Route path="equipe" element={<RequireModule module="equipe"><TeamPage /></RequireModule>} />
          <Route path="configuracoes" element={<RequireModule module="configuracoes"><SettingsPage /></RequireModule>} />
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
        <BrandingProvider>
          <AuthProvider>
            <Gate />
          </AuthProvider>
        </BrandingProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
