import ErrorBoundary from './components/ErrorBoundary';
import { Routes, Route, Navigate } from 'react-router';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FeaturesProvider } from './context/FeaturesContext';
import { WebSocketProvider } from './context/WebSocketContext';
import LoginPage from './pages/login/LoginPage';
import DashboardLayout from './layouts/DashboardLayout';
import OverviewPage from './pages/overview/OverviewPage';
import CommandsPage from './pages/commands/CommandsPage';
import JobsPage from './pages/jobs/JobsPage';
import JobDetail from './pages/jobs/JobDetail';
import PluginsPage from './pages/plugins/PluginsPage';
import FilesystemPage from './pages/filesystem/FilesystemPage';
import AuditPage from './pages/audit/AuditPage';
import EventsPage from './pages/events/EventsPage';
import ConfigPage from './pages/config/ConfigPage';
import LogsPage from './pages/logs/LogsPage';
import TerminalPage from './pages/terminal/TerminalPage';
import FeatureGate from './components/FeatureGate';
import type { ReactNode } from 'react';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    // One events socket for the whole app, above the routes: route changes never re-create it.
    <WebSocketProvider enabled={user !== null}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <FeaturesProvider>
                <DashboardLayout />
              </FeaturesProvider>
            </RequireAuth>
          }
        >
          <Route index element={<OverviewPage />} />
          <Route path="commands" element={<CommandsPage />} />
          <Route path="jobs" element={<FeatureGate feature="jobs" title="nav.jobs"><JobsPage /></FeatureGate>} />
          <Route path="jobs/:id" element={<FeatureGate feature="jobs" title="nav.jobs"><JobDetail /></FeatureGate>} />
          <Route path="plugins" element={<PluginsPage />} />
          <Route
            path="filesystem"
            element={<FeatureGate feature="filesystem" title="nav.filesystem"><FilesystemPage /></FeatureGate>}
          />
          <Route path="audit" element={<FeatureGate feature="audit" title="nav.audit"><AuditPage /></FeatureGate>} />
          <Route path="events" element={<EventsPage />} />
          <Route path="config" element={<ConfigPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="terminal" element={<TerminalPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </WebSocketProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary variant="page">
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ErrorBoundary>
  );
}
