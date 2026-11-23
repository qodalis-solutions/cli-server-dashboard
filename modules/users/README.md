# @qodalis/cli-dashboard-module-users

The users pages of the Qodalis CLI server dashboard, a [dashboard extension](../../docs/extensions.md) built with
the kit. The servers' users plugins (Node `@qodalis/cli-server-plugin-users`, .NET and Python alike) embed its build
and register it twice; hosts install nothing else:

- **`users`** (group Access, permission `users:read`, `search: "/?q="`), `/x/users`:
  - **Users**: search (in the URL), create with a first password (temporary by default: chosen again at the first
    sign-in), edit name, email, groups and disabled, set someone's password, delete (not yourself).
  - **Groups**: their permissions (the server's catalog as checkboxes, wildcards and others typed) and members;
    create, edit, delete (built-in groups stay).
  - **Sessions** (`sessions:read`): who is signed in, from which client, since when; sign one out (`sessions:revoke`,
    or your own).
- **`account`** (group `account`: the account menu, every signed-in user), `/x/account`: profile (email editable),
  password change, and the permissions the user holds.

Where the host application signs users in (external auth adapter) or manages users and groups (read-only stores),
the pages show them without forms to change them. Live on the `user:*`, `group:*` and `session:*` server events.
Texts in the dashboard's 11 languages.

```bash
npm run build -w modules/users   # dist/extension.js, dist/extension.css
```

The servers' packages copy `dist/` at build time from the npm package or, in a workspace checkout, from a sibling
`../cli-server-dashboard/modules/users/dist`.
