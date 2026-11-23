import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useExtensions } from '../context/ExtensionsContext';
import { useI18n } from '../i18n';
import DropdownMenu, { MENU_SEPARATOR } from './DropdownMenu';
import NavIcon from './NavIcon';
import { accountExtensions, extensionPath, extensionTitle } from './navItems';

/**
 * The signed-in user as a menu button: the plugins' account pages (group `account`, e.g. the users plugin's Account
 * page) and Sign out; the avatar and name at the bottom of the sidebar (`full`), the avatar alone in the top bar of
 * small screens.
 */
export default function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { user, logout } = useAuth();
  const { extensions } = useExtensions();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const pages = accountExtensions(extensions).map(extension => ({
    key: `x-${extension.id}`,
    label: extensionTitle(extension, locale),
    icon: <NavIcon icon={extension.icon ?? '◆'} className="w-4 text-center" />,
    onSelect: () => navigate(extensionPath(extension.id)),
  }));
  const avatar = (
    <span aria-hidden className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs text-on-primary font-medium">
      {user?.username?.[0]?.toUpperCase() ?? 'A'}
    </span>
  );
  return (
    <DropdownMenu
      label={t('nav.accountMenu')}
      align={compact ? 'end' : 'start'}
      header={compact && user?.username ? <span className="block truncate text-text">{user.username}</span> : undefined}
      buttonClassName={`flex items-center gap-2 rounded-lg text-left hover:bg-control transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        compact ? 'w-11 h-11 shrink-0 justify-center' : 'w-full px-2 py-1.5'
      }`}
      items={[...pages, ...(pages.length ? [MENU_SEPARATOR] : []), { key: 'sign-out', label: t('nav.signOut'), icon: <SignOutIcon />, onSelect: logout }]}
    >
      {avatar}
      {!compact && (
        <>
          <span className="flex-1 min-w-0 text-xs text-text truncate">{user?.username}</span>
          <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" className="shrink-0 text-muted">
            <path d="M2 6.5l3-3 3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </>
      )}
    </DropdownMenu>
  );
}

function SignOutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
