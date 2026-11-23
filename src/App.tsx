import ErrorBoundary from './components/ErrorBoundary';
import { Routes, Route, Navigate, useLocation } from 'react-router';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ExtensionsProvider } from './context/ExtensionsContext';
import { WebSocketProvider } from './context/WebSocketContext';
import LoginPage from './pages/login/LoginPage';
import LinkPage from './pages/link/LinkPage';
import DashboardLayout from './layouts/DashboardLayout';
import OverviewPage from './pages/overview/OverviewPage';
import CommandsPage from './pages/commands/CommandsPage';
import PluginsPage from './pages/plugins/PluginsPage';
import EventsPage from './pages/events/EventsPage';
import ConfigPage from './pages/config/ConfigPage';
import LogsPage from './pages/logs/LogsPage';
import TerminalPage from './pages/terminal/TerminalPage';
import ExtensionPage from './pages/extension/ExtensionPage';
import type { ReactNode } from 'react';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** The dashboard's old routes of pages that plugins' modules now serve (docs/extensions.md). */
const MOVED_PAGES = ['jobs', 'audit', 'filesystem', 'data-explorer', 'tokens'] as const;

/** Sends an old route (`/jobs/<id>?q=…`) to the module's page (`/x/jobs/<id>?q=…`). */
function MovedPage({ id }: { id: (typeof MOVED_PAGES)[number] }) {
  const { pathname, search, hash } = useLocation();
  const rest = pathname.replace(new RegExp(`^/${id}`), '');
  return <Navigate to={`/x/${id}${rest}${search}${hash}`} replace />;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    // One events socket for the whole app, above the routes: route changes never re-create it.
    <WebSocketProvider enabled={user !== null}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* Any user of the server approves a terminal's link here, not only dashboard admins */}
        <Route path="/link" element={<LinkPage />} />
        <Route
          element={
            <RequireAuth>
              <ExtensionsProvider>
                <DashboardLayout />
              </ExtensionsProvider>
            </RequireAuth>
          }
        >
          <Route index element={<OverviewPage />} />
          <Route path="commands" element={<CommandsPage />} />
          <Route path="plugins" element={<PluginsPage />} />
          {MOVED_PAGES.map(id => <Route key={id} path={`${id}/*`} element={<MovedPage id={id} />} />)}
          <Route path="events" element={<EventsPage />} />
          <Route path="config" element={<ConfigPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="terminal" element={<TerminalPage />} />
          {/* Pages plugins add (docs/extensions.md) */}
          <Route path="x/:id/*" element={<ExtensionPage />} />
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
