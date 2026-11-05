# Change Log

Notable changes to `@qodalis/cli-server-dashboard`, the admin dashboard of the Qodalis CLI servers.

## 1.0.0-beta.13

### Terminal

- The Terminal page is shown on every server again. It is the web CLI over the server's commands, but was only shown
  when the server enabled its OS shell (`capabilities.shell`), so hosts without one (most) lost it in 1.0.0-beta.9.

## 1.0.0-beta.12

### Audit

- New **Audit** page: the users plugin's audit log (`GET /api/v1/qcli/audit`), newest first, with who did it, who or
  what it is about (`target`, e.g. `group:admins`), the details and the host's own values (`properties`), and the
  client address. Filter by event, actor and user; pages of 50. Shown when the server reports the `audit` feature
  (servers with the users plugin).

### Plugins

- The Plugins page lists the server plugins the host installed (users, admin, jobs, storage providers, ...) with their
  package id, version and description (`GET /api/v1/qcli/plugins/installed`), above the command modules. Older
  servers keep the command modules only. A host with no command modules says so instead of "No plugins installed".

### Jobs

- A job's execution history shows the job's own values for each run (`properties`, e.g. `items=32`).
- Fixed: the jobs list, a job's page and the overview showed "—" for the last run, the next run and the last
  duration, as they read field names the servers never sent (`lastRun` instead of `lastRunAt`, ...). An interval or
  timeout sent in milliseconds (.NET) is shown as a duration (`30m`) like the duration strings of Node and Python.

## 1.0.0-beta.11

### Your own name and icon

- The dashboard shows the Qodalis Solutions logo by default (browser tab, sidebar, sign-in page), instead of a "Q"
  letter.
- Servers set the dashboard's name and icon, and its terminal's name, with the admin plugin's branding
  (`Branding` in .NET, `setBranding()` in Node, `set_branding()` in Python). It reaches the dashboard as `branding`
  in `theme.json`; malformed values are dropped, and the Qodalis logo is shown when a custom icon fails to load.
  See [Name and icon](README.md#name-and-icon).

### Terminal

- The terminal's user is the dashboard's signed-in user (prompt, `whoami`, `id`, `perms`) when the server has the
  users plugin: it loads `@qodalis/cli-users` in embedded mode with the dashboard's token, and `logout` signs out of
  the dashboard. Servers signed in with the static admin password keep the terminal as before.

### Jobs

- The jobs list and detail show only the actions a job offers (`actions`, for servers whose jobs run elsewhere, such
  as a .NET `ICliJobManager`); job ids are encoded in the API paths (ids such as `fetch-rates:bnr`).
