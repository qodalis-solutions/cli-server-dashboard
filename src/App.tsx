import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WebSocketProvider } from './context/WebSocketContext';
import LoginPage from './pages/login/LoginPage';
import DashboardLayout from './layouts/DashboardLayout';
import type { ReactNode } from 'react';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="text-slate-400 mt-1 text-sm">Coming soon</p>
    </div>
  );
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
        <Route index element={<Placeholder title="Overview" />} />
        <Route path="commands" element={<Placeholder title="Commands" />} />
        <Route path="jobs" element={<Placeholder title="Jobs" />} />
        <Route path="plugins" element={<Placeholder title="Plugins" />} />
        <Route path="filesystem" element={<Placeholder title="Filesystem" />} />
        <Route path="events" element={<Placeholder title="Events" />} />
        <Route path="config" element={<Placeholder title="Config" />} />
        <Route path="logs" element={<Placeholder title="Logs" />} />
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
