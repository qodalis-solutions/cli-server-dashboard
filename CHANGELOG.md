# Change Log

Notable changes to `@qodalis/cli-server-dashboard`, the admin dashboard of the Qodalis CLI servers.

## 1.0.0-beta.16

- **Jobs: delete runs.** Each finished run in a job's history has a Delete button, and "Delete finished runs" (or
  "Delete runs: failed" when the history is filtered by a result) clears them after a confirmation. Running runs are
  kept. Needs servers 1.0.0-beta.21 (`DELETE /jobs/{id}/history[/{execId}]`); shown when the job offers `delete-runs`
  (or every action).
- **Logs: older entries load when scrolling to the top** of the log viewer (or with the button there), and the entries
  in view stay where they were. Older pages are asked with the first page's time bounds, so entries written meanwhile
  (in Seq, by other services too) no longer shift the pages and repeat or skip entries.
- **Dropdowns**: a small arrow in the text color with room on the right, instead of the native arrow against the border.

## 1.0.0-beta.15

Pages are no longer static: charts, filters kept in the URL, sortable tables and a command palette. The charts use the
servers' new statistics endpoints (1.0.0-beta.19); older servers keep working, with the numbers counted from what the
page loads or the chart left out.

### Everywhere

- **Command palette** (Ctrl+K / ⌘K, or "Search…" in the sidebar): go to a page, a job or a command, or search the
  jobs, logs or audit log for what was typed.
- **Filters in the URL** on Jobs, Logs, Audit, Commands, Events and Filesystem (the folder): a filtered view can be
  reloaded, shared and gone back to.
- **Sortable columns**: click a header of the jobs, runs, history, audit and clients tables.
- Charts read on hover and keyboard focus, keep their frame while reloading and follow the theme colors.
- API errors carry the HTTP status (`ApiError`); answers that are not what an endpoint returns count as "not available".

### Overview

- **Server resources** over the last hour, 6 or 24 hours: memory, CPU and WebSocket clients, from the admin plugin's
  history (`GET /status/history`); older servers are sampled by the page while it is open.
- **Needs attention**: jobs that failed in the last 24 hours (with their success rate) and the latest errors in the
  log, or "All clear".
- **Runs over time** for the last 24 hours with the success rate; a column opens the Jobs page at that hour.

### Jobs

- Filters in one row: search (name, id, description, group), the job's status (all, active, running, paused, stopped,
  failing, each with its count), the group and a time range (last hour, 24 hours or 7 days).
- Run statistics for the range (runs, success rate, failed runs with the last failure, average, p95 and longest
  duration) and a **Runs over time** chart stacked by result; clicking a column lists its runs. The numbers come from
  `GET /jobs/stats`, counted by the server over every run; before 1.0.0-beta.19 they are counted from up to 1,000
  loaded runs (`GET /jobs/executions`, 1.0.0-beta.15), and the chart says so when there are more.
- Each job shows its last runs as a strip of results with its success rate; **Recent runs** lists runs across jobs
  (job, result, start, duration, error), filtered by result, 20 at a time.
- **Edit a job** (when it offers `update`): description, group, interval or cron schedule, max retries, timeout and
  overlap policy, checked before sending. **Cancel run** stops a run in progress (when the job offers `cancel`).
- Statistics and lists refresh shortly after a job starts or ends (server events).

### Job detail

- Statistics of the last 50 runs and a chart of their durations colored by result; clicking a column opens its logs.
- The history can be filtered by result and sorted; the page refreshes when a run of the job starts or ends.

### Logs

- **Log volume** chart: entries per level over the range, from `GET /logs/histogram` (every server since
  1.0.0-beta.19, Seq included); clicking a column shows that span's entries.
- The time range is offered for the in-memory history too.
- `?q=`, `level`, `service` and the range are read from and kept in the URL.

### Audit

- **Activity** chart by kind (failures, removals, sign-ins and creations, other) with a time range (24 hours, 7 or 30
  days, all time; the server filters by time since 1.0.0-beta.19); clicking a column lists its entries.
- **Most frequent events** and **most active users**; clicking one, or an event, user or actor in the table, filters by
  it.
- A text search over every field, filters applied as you type, and **Export CSV** of the shown entries.

### Commands

- **Most used commands** since the server started, with their failures (`GET /commands/stats`, 1.0.0-beta.19);
  runs and failures columns, sorting by name, use or failures, and `?q=` search.

### Events

- **Pause** the stream (new events wait and join on resume) and filter events by text; the type filter is kept in the
  URL.

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
