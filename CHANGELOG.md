# Change Log

Notable changes to `@qodalis/cli-server-dashboard`, the admin dashboard of the Qodalis CLI servers.

## 1.0.0-beta.15

### Jobs

- Filters in one row above the page, kept in the URL (so a filtered view can be reloaded, shared and gone back to):
  search (name, id, description, group), the job's status (all, active, running, paused, stopped, failing, each with
  its count), the group and a time range (last hour, 24 hours or 7 days).
- Run statistics for the range: runs, success rate, failed runs with the last failure, average, p95 and longest
  duration.
- A "Runs over time" chart: runs per column (5 minutes, an hour or 6 hours), stacked by result, with a readout on hover
  or keyboard focus. Clicking a column lists its runs.
- Each job shows its last runs as a strip of results with its success rate; "Recent runs" lists the runs across jobs
  (job, result, start, duration, error), filtered by result, 20 at a time.
- Filters scope everything: the statistics, the chart and the run list follow the jobs shown.
- Statistics and lists refresh shortly after a job starts or ends (server events).
- Uses `GET /api/v1/qcli/jobs/executions` (servers since 1.0.0-beta.15), reading up to 1,000 runs of the range; a busier
  range says how many it is based on. Older servers keep the jobs list and say runs across jobs are not available.

### Job detail

- Statistics of the last 50 runs (success rate, failures, durations) and a chart of their durations, colored by result;
  clicking a column opens its logs.
- The history can be filtered by result (completed, failed, cancelled, running).
- The page refreshes when a run of the job starts or ends.

### Overview

- A "Runs over time" chart of the last 24 hours with the success rate; a column opens the Jobs page at that hour.

### Other

- API errors carry the HTTP status (`ApiError`).

## 1.0.0-beta.14

### Logs

- With a server that filters its logs (the .NET server since 1.0.0-beta.18), the Logs page asks it for the levels,
  text and service shown, so the history is searched as a whole rather than only the loaded page.
- A persistent history, such as Seq (`Qodalis.Cli.Plugin.Logs.Seq`), adds a service filter and a time range (live,
  the last 15 minutes, hour, 24 hours or 7 days, or from/to), tags each line with the service that wrote it when there
  are several, and shows exceptions under their message. Older entries load while the store has more, even when it
  cannot count them.
- The subtitle says where the history comes from (in memory or the store's name); live entries are added only when
  they match the filters.
- Entries are shown oldest first, so older pages load on top and live entries arrive at the bottom (the first page was
  shown newest first).
- Older servers work as before: the page filters what it loaded.

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
