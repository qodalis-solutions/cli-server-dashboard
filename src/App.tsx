import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WebSocketProvider } from './context/WebSocketContext';
import LoginPage from './pages/login/LoginPage';
import DashboardLayout from './layouts/DashboardLayout';
import OverviewPage from './pages/overview/OverviewPage';
import CommandsPage from './pages/commands/CommandsPage';
import JobsPage from './pages/jobs/JobsPage';
import JobDetail from './pages/jobs/JobDetail';
import PluginsPage from './pages/plugins/PluginsPage';
import FilesystemPage from './pages/filesystem/FilesystemPage';
import EventsPage from './pages/events/EventsPage';
import ConfigPage from './pages/config/ConfigPage';
import LogsPage from './pages/logs/LogsPage';
import type { ReactNode } from 'react';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <WebSocketProvider>
              <DashboardLayout />
            </WebSocketProvider>
          </RequireAuth>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="commands" element={<CommandsPage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="plugins" element={<PluginsPage />} />
        <Route path="filesystem" element={<FilesystemPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="config" element={<ConfigPage />} />
        <Route path="logs" element={<LogsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
