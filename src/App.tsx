import ErrorBoundary from './components/ErrorBoundary';
import { Routes, Route, Navigate, useLocation } from 'react-router';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ExtensionsProvider } from './context/ExtensionsContext';
import { WebSocketProvider } from './context/WebSocketContext';
import LoginPage from './pages/login/LoginPage';
import LinkPage from './pages/link/LinkPage';
import DashboardLayout from './layouts/DashboardLayout';
import OverviewPage from './pages/overview/OverviewPage';
import ExtensionPage from './pages/extension/ExtensionPage';
import PageSkeleton, { AppSkeleton } from './components/PageSkeleton';
import { lazy, Suspense, type ReactNode } from 'react';

// Overview (the landing page) and plugins' pages are in the main bundle; the other pages load on
// first visit, the terminal with the CLI and its language packs.
const CommandsPage = lazy(() => import('./pages/commands/CommandsPage'));
const PluginsPage = lazy(() => import('./pages/plugins/PluginsPage'));
const PluginDetailsPage = lazy(() => import('./pages/plugins/PluginDetailsPage'));
const EventsPage = lazy(() => import('./pages/events/EventsPage'));
const ConfigPage = lazy(() => import('./pages/config/ConfigPage'));
const LogsPage = lazy(() => import('./pages/logs/LogsPage'));
const TerminalPage = lazy(() => import('./pages/terminal/TerminalPage'));

/** A lazily loaded page, with a page skeleton while its code loads. */
function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AppSkeleton />;
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
          <Route path="commands" element={<Lazy><CommandsPage /></Lazy>} />
          <Route path="plugins" element={<Lazy><PluginsPage /></Lazy>} />
          <Route path="plugins/:id" element={<Lazy><PluginDetailsPage /></Lazy>} />
          {MOVED_PAGES.map(id => <Route key={id} path={`${id}/*`} element={<MovedPage id={id} />} />)}
          <Route path="events" element={<Lazy><EventsPage /></Lazy>} />
          <Route path="config" element={<Lazy><ConfigPage /></Lazy>} />
          <Route path="logs" element={<Lazy><LogsPage /></Lazy>} />
          <Route path="terminal" element={<Lazy><TerminalPage /></Lazy>} />
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
