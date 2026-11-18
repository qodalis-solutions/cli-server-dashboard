import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import DropdownMenu from './DropdownMenu';

/**
 * The signed-in user as a menu button with Sign out: the avatar and name at the bottom of the sidebar (`full`), the
 * avatar alone in the top bar of small screens.
 */
export default function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
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
      items={[{ key: 'sign-out', label: t('nav.signOut'), icon: <span>⎋</span>, onSelect: logout }]}
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
