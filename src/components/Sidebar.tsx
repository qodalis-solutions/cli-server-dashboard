import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFeatures } from '../context/FeaturesContext';
import ConnectionStatus from './ConnectionStatus';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  feature?: string; // Only show if this feature is enabled
}

const navItems: NavItem[] = [
  { path: '/', label: 'Overview', icon: '▣' },
  { path: '/commands', label: 'Commands', icon: '⌘' },
  { path: '/jobs', label: 'Jobs', icon: '⏱', feature: 'jobs' },
  { path: '/plugins', label: 'Plugins', icon: '⚙' },
  { path: '/filesystem', label: 'Filesystem', icon: '📁', feature: 'filesystem' },
  { path: '/events', label: 'Events', icon: '⚡' },
  { path: '/config', label: 'Config', icon: '⚙' },
  { path: '/logs', label: 'Logs', icon: '📜' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { hasFeature, loading: featuresLoading } = useFeatures();

  const visibleItems = featuresLoading
    ? navItems.filter(item => !item.feature) // While loading, show only always-visible items
    : navItems.filter(item => !item.feature || hasFeature(item.feature));

  return (
    <aside className="w-[220px] flex-shrink-0 bg-black/30 border-r border-white/[0.06] flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-light to-primary flex items-center justify-center text-white font-bold text-sm">
            Q
          </div>
          <span className="font-bold text-white">Qodalis Admin</span>
        </div>
        <ConnectionStatus />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        {visibleItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors ${
                isActive
                  ? 'bg-primary/15 text-primary-light'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
              }`
            }
          >
            <span className="w-5 text-center">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="px-4 py-3 border-t border-white/[0.06] flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-xs text-white font-medium">
          {user?.username?.[0]?.toUpperCase() ?? 'A'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-slate-200 truncate">{user?.username}</div>
          <button onClick={logout} className="text-[10px] text-slate-500 hover:text-slate-300">
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
