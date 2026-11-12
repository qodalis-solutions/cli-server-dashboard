# Change Log

Notable changes to `@qodalis/cli-server-dashboard`, the admin dashboard of the Qodalis CLI servers.

## Unreleased

- **Tokens: New token.** A "New token" button opens a dialog that creates an API token for the signed-in user
  (`POST /api/v1/qcli/tokens`): a name, an expiry of 1–365 days (90 by default) and, optionally, the permissions to
  grant (empty: all of the user's). The token is shown once, with a copy button and a warning that it won't be shown
  again; the dialog closes only with Done, and the list refreshes. The server's refusals show in the dialog: 501
  (sign-in managed by the host application, no API tokens), 403 (signed in with an API token, or a permission the user
  lacks), 409 (name taken), 400.
- **Data explorer: SQL editor.** SQL sources get a CodeMirror 6 editor instead of the text area: syntax highlighting
  in the source's dialect (PostgreSQL, MySQL, SQLite, SQL Server, or standard SQL; servers only send `language: sql`,
  so the dialect comes from a `dialect`/`type`/`provider` field when present, else the source's name, description or
  templates), completion of keywords, tables and columns from the source's schema (loaded when the source opens;
  mixed-case, reserved and non-plain names inserted quoted the source's way: `"Users"` in PostgreSQL and SQLite,
  `` `Users` `` in MySQL, `[Users]` in SQL Server), line numbers, Ctrl+Enter / ⌘+Enter runs, colors from the dashboard theme (light and dark), line wrapping and
  16px text on phones. The editor is loaded on demand, in its own chunk, so the main bundle does not grow; MongoDB,
  Redis and other sources keep the text area. "Query this table" quotes the name and uses `TOP 100` on SQL Server.
- **Data explorer: the query as run.** When the server ran a query differently from how it was sent (it quoted a
  mixed-case name: `select * from "Users"` for `select * from Users`), its `executedQuery` shows above the result
  ("Ran as: …", also for failed and refused queries) with a button that puts it in the editor.
- **External sign-in: return to the dashboard.** The host's sign-in link gets the current dashboard URL: `{returnTo}`
  in the server's `signInUrl` is replaced with it (URL-encoded), or `returnTo=<encoded URL>` is added to the query.
  The host signs the user in and returns with `#token=<session token>`, which the dashboard (also the link approval
  page) stores as its sign-in token and removes from the address bar, now also when only the fragment changes on an
  open page. The link label shows the sign-in URL without its query.

## 1.0.0-beta.22

- **Built with Qodalis CLI 2.5.1**: on a phone, a finger drag over the terminal page scrolls the terminal (it scrolled the page before), and the wheel over the panel chrome no longer scrolls the page.

## 1.0.0-beta.21

- **Built with Qodalis CLI 2.5.0** (was 2.0.1): the terminal page gets the CLI's server linking (`server add`), server command help with examples and allowed values, job tags in `server jobs` and the data explorer's read-only sources.

## 1.0.0-beta.20

- **Jobs: tags.** Each job's tags show as chips under its name and in the job detail; a row of tag chips above the
  list filters the jobs (a job must have every selected tag, ignoring case; the runs, chart and stats follow), kept in
  the URL as `?tag=`. The search matches tags too, and the job editor edits them (comma-separated). Servers without
  job tags show none of this (servers 1.0.0-beta.25).
- **Commands: aliases, examples, documentation.** Each command shows its icon and aliases as chips, and its module
  (read from `metadata.module` on older servers); the search also matches aliases and the module. Expanding a row (a
  button, so it works from the keyboard) shows the documentation, the examples and the parameters with their default,
  allowed values and example values. Servers without command metadata show the list as before (servers 1.0.0-beta.25).
- **Link a terminal.** `/qcli/admin/link?code=…` approves or denies a terminal's link request (`server add` in the
  web CLI): any user of the server signs in there (not only dashboard admins; the session stays in memory), compares
  the code, sees the device, page, address and permissions asked, then approves (an API token for their account) or
  denies. Codes typed by hand are accepted; phone layout; translated into the 10 languages.
- **API tokens.** A new page lists the signed-in user's API tokens (name, created, last used, expiry with Expired and
  Expires soon badges, permissions) and revokes them after a confirmation. Tokens created by linking a terminal
  (`link <client>`) show as linked terminals, revoked as "Unlink". With `tokens:read`, "All users" lists everyone's
  tokens with their owner. Shown when the server answers `GET /api/v1/qcli/tokens` (the users plugin).
- **Data explorer.** A new page lists the server's data sources with their language and Read-only / Writes allowed /
  Export allowed badges, and runs queries per source (templates, Ctrl/⌘+Enter, a schema panel whose "Query this
  table" fills in a query). Results show as a table with the row count, a Truncated badge and the time taken; refused
  queries (`forbidden`, `rate_limited`, `read_only`, `object_not_allowed`, `masked_column`) explain why. Shown when
  the server answers `GET /api/qcli/data-explorer/sources`.
- **Audit: data queries and links.** `data_query` entries show the source, result (rows or Failed), time, query and
  error, and a failed query counts as a failure in the chart; `link_approved` / `link_denied` show the terminal, page
  and token. The search also matches an entry's details.

## 1.0.0-beta.19

- **Logs: live tail.** The Python and .NET servers did not publish `log:entry` at all (their admin plugins only stored
  the entries), so with them new lines appeared only after a refresh; both servers now publish it, as the Node server
  did. The page's tail is covered by tests: a `log:entry` is appended below the history, filtered like it and held
  while the tail is paused.
- **Phone layout.** Below 768 px the sidebar is a drawer opened from a top bar (closed by a link, the backdrop or
  Escape); the stat cards wrap, the events panels stack, config labels sit above their controls, the search boxes take
  the row, the Commands tables scroll inside their container and the pages keep a 16 px gutter. Wider windows are
  unchanged.

## 1.0.0-beta.18

Pages update live from the server events (servers 1.0.0-beta.23, see the [server events
design](https://github.com/qodalis-solutions/web-cli/blob/main/docs/superpowers/specs/2026-11-06-server-events-design.md)).
A burst of events causes one quiet reload about 1.5 s later; the rows shown stay until the new ones arrive.

- **Jobs:** any `job:*` event reloads the job list, the run statistics and chart and the recent runs, so a run that
  starts or ends, a job triggered, changed or paused elsewhere and deleted runs show up without Refresh. Pause, resume
  and stop change the job's status at once (their events now carry it).
- **Job detail:** reloads on every event of its job, `job:updated` and `job:runs-deleted` included; while the edit
  dialog is open it waits until it closes.
- **Filesystem:** `fs:changed` in the open folder (an upload, a new folder, a delete, a move or copy into it) lists it
  again.
- **Audit:** new entries matching the event, actor and user filters appear on the first page; on later pages the reload
  waits until you return to the first page, so rows don't shift while you read.
- **Overview:** the live events panel shows one translated line per event ("Job cleanup completed in 1.5s", "User ana
  created · by admin", "Uploaded /data/a.csv") instead of raw JSON, and leaves out log entries.
- **Jobs: a run's full error.** The recent runs table and a job's history have a Details button per run (clicking a
  shortened error opens it too): status, start, end, duration, attempt and trigger, the whole error (with its stack
  trace) and a Copy button, and the run's logs. The run is fetched (`GET /jobs/{id}/history/{execId}`), since lists may
  carry a shortened error; if that fails, what the list has is shown.
- **Events:** a summary next to each event's JSON, colors by outcome (failed, deleted or revoked, created), and the
  connected clients reload on `session:*`.
- **Jobs: max concurrent runs.** The edit dialog sets how many runs of a job may go at the same time (servers
  1.0.0-beta.23; 1 by default, a whole number of at least 1). The job page shows it next to the overlap policy, and
  the job list and job page show "2 of 3 running" while several runs go and "1 queued" when a run waits. Job status
  reloads 250 ms after a job event (not 1.5 s), so even a short run shows as running.
- **Fix:** the jobs statistics showed "NaN%" as the success rate (and could show NaN durations) when no run had finished
  and the server leaves null values out of its JSON, as .NET hosts that ignore nulls do. Missing values show "—".
- **Security:** when the WebSocket ticket could not be fetched (the server down, restarting or failing), the dashboard
  connected with the bearer token in the URL (`?token=`), where proxies and access logs keep it. It now waits and
  retries; only a server without a ticket endpoint (no users plugin) gets the token form.
- **Fix:** Events listed no connected clients ("0 connected") on .NET servers, which send `{ clients, total }` instead of
  the list Node and Python send. Both forms are read.

## 1.0.0-beta.17

- **Logs:**
  - "Jump to newest" appears while you're scrolled up.
  - Pause holds new live entries while you read; Resume shows how many are waiting and adds them.
  - Each entry has a Copy button on hover.
  - Exceptions longer than three lines start collapsed ("Show N more lines").
- **Jobs:**
  - "Run again" on failed runs, on the Jobs page and on a job's history.
  - The Jobs page's recent runs table can delete runs of any job: per row, or "Delete listed runs" when a result or a chart column is picked.

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
