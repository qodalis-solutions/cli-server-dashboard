import './styles.css';
import { defineExtension, useDashboard } from '@qodalis/cli-server-dashboard-kit';
import UsersPage from './UsersPage';
import AccountPage from './AccountPage';
import { SERVER_PLUGIN } from './serverPlugin';

/**
 * One build, two pages: the users plugin registers it as `users` (`/x/users`: users, groups and sessions, for
 * `users:read`) and as `account` (`/x/account`, in the account menu: every signed-in user's own page).
 */
function Page() {
  const { extension } = useDashboard();
  return extension.id === 'account' ? <AccountPage /> : <UsersPage />;
}

export default defineExtension(Page, { serverPlugin: SERVER_PLUGIN });
