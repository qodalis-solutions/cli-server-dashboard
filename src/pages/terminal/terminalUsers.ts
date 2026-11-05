import type { ICliModule } from '@qodalis/cli-core';
import { usersModule } from '@qodalis/cli-users';
import { getToken } from '../../api/client';

/**
 * Whether the server has the users plugin and accepts the dashboard's token there
 * (`GET /api/v1/qcli/sessions/current`): with the plugin, the dashboard signs in through
 * it (or the host application's sign-in), so its token is the user's session. Servers
 * signed in with the static admin password have no session endpoint.
 */
export async function hasUsersSession(token: string | null = getToken()): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch('/api/v1/qcli/sessions/current', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * The users plugin in embedded mode: the terminal's user is the dashboard's signed-in
 * user (prompt, `whoami`, `id`, `perms`), signed in with the dashboard's token rather
 * than a sign-in of its own; `logout` signs out of the dashboard.
 */
export function embeddedUsersModule(server: string, logout: () => void, loginHint: string): ICliModule {
  return usersModule.configure({
    server,
    hostAuth: { getToken: () => getToken() ?? undefined, loginHint, logout },
  });
}
