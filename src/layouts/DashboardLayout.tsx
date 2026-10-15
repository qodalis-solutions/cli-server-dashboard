import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import ErrorBoundary from '../components/ErrorBoundary';

export default function DashboardLayout() {
  const location = useLocation();
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto">
        {/* A page that fails keeps the sidebar usable; navigating resets it */}
        <ErrorBoundary key={location.pathname} variant="page">
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
