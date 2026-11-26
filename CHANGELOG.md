# Change Log

Notable changes to `@qodalis/cli-server-dashboard`, the admin dashboard of the Qodalis CLI servers.

## Unreleased

- **Plugin readmes are rendered.** The details dialogs (dashboard and server plugins in the Marketplace tab) showed the first 1,200 characters of a readme as raw markdown text. They now render it (`components/Readme`: react-markdown with GFM tables and task lists) in full, in a scrolling box: raw HTML is skipped, links open in a new tab (http(s) only; relative ones become text), and images become links with their alt text, since the dashboard's CSP loads no images from other hosts. A platform's readme in another format (`readmeFormat` other than `markdown`), and a description standing in for a missing readme, stay plain text.
- **Notifications.** A bell in the header (the sidebar next to Search, the top bar on phones) with the unread count (99+ above 99); its dropdown lists the latest notifications (opening one marks it read and follows its link), Mark all read and View all notifications. The **Notifications** page (`/notifications`) lists them all with Unread and severity filters (kept in the URL), Open, Mark read, Dismiss and, with `notifications:manage`, Clear for everyone. Live over the events socket (`notification:changed`, its `unreadCount` applied at once). Hidden on servers without notifications. Needs the servers' `/api/v1/qcli/notifications` (Node first; contract in cli-server-node's `docs/notifications-spec.md`).
- **Plugins → Updates**, with the number of updates on the tab: dashboard and server plugins installed from the marketplace with a newer version (Update, and Update all with one confirmation and the restart notice), plugins added in code with what to change and the install command per platform (Copy), the server's running and newest version, Check now and Last checked. "Everything is up to date" when nothing is newer. Reads `GET /api/v1/qcli/updates` (`updates:read` or `plugins:install`).
- The Plugins tabs scroll sideways on narrow screens; Left and Right arrows move both ways.
- All in 11 languages, light and dark.

## 1.0.0-beta.31

- **A failed install, update or remove shows the server's message.** Installing a plugin into a server whose plugins folder could not be written showed nothing: the install dialog closed and the failure appeared above the list, out of view when the plugin's card was further down. A failed install or update now keeps its dialog open with the server's message (Install or Update again, or Cancel); a failed remove (and every server plugin failure, whose confirmation closes first) is shown on the page and brought into view. Both Marketplace tabs and the Installed tab. An answer without a readable message (no body, a proxy's HTML page, JSON without a message) says "The server answered 500" with the status text, also over HTTP/2, which sends none (`ApiError.body`, `ApiError.statusText`).
- **"No settings." instead of nothing** on an installed marketplace plugin without settings (the data explorer), and on a plugin's details page when none of the settings are its own. A marketplace plugin whose installed version declares settings shows **Configure** (it was "Settings") from the server's `hasConfig`, also before its section is listed; a plugin added in code that has settings (`settings` of `/plugins/installed`) shows Configure on its card, and its details page links its settings provider.

- **Error texts never show an HTML page.** A dashboard plugin whose API route did not exist showed Express's raw 404 page ("Could not load the data <!DOCTYPE html>…"). The kit's `errorText` (and so `ErrorState`), `createApi`, the dashboard's API client and the modules' own clients read a JSON `{ error }` as its message and an HTML error page as its `<pre>`, `<h1>` or `<title>` text, else `HTTP 404 Not Found` (`responseErrorText`, `htmlErrorText`, `httpStatusText`, `isHtml`).
- **A page whose server plugin is missing says so.** `defineExtension(App, { serverPlugin: { id, title, packages, api, codeOnly? } })`: when the page's route is answered 404 without a JSON `{ error }`, the page is replaced by "This page needs the server plugin …, which is not installed on this server" with **Open it in the marketplace** (Plugins → Marketplace → Server plugins searching it, `&q=`) and the packages to add in code. Every official module (audit, data explorer, databases, filesystem, jobs, tokens, users) declares its server plugin, and the same packages in its package.json (`qodalis.serverPackages`, read by the marketplace).
- **Installing a dashboard plugin whose server plugin is missing**: the dialog says so (the marketplace item's `requires`) and, when this server installs server plugins from the marketplace and you may, offers **Also install the server plugin** (checked; it runs after a restart). Otherwise it lists the packages to add in the server's code. The page alone can still be installed.

## 1.0.0-beta.30

- **The dashboard's version on the Overview**: Server information shows it next to the server's version.

## 1.0.0-beta.29

- The marketplace's search box and filter chips sit in one toolbar row with a gap, wrapping on narrow screens.
- **Plugins added in code show as installed on the Marketplace tab** (they showed Install). Dashboard and server plugin
  cards, and their details dialogs, read the servers' `installed: { version, source: 'code' | 'marketplace' }`: a
  plugin the host adds in code gets an "Added in code · v1.2.0" badge, no Install, Update or Remove, and "Newer version
  v1.3.0 in the marketplace; update it in code" when there is one (no "Needs setup in code" note either). Marketplace
  installs keep Update and Remove; a server sending `{ version }` alone is read as a marketplace install. The module
  builds start with `/*! <package> <version> */`, which the servers read to show an embedded module's version.
- **Marketplace cards' spacing**: the version chip and the verified badge no longer touch the title and the publisher;
  title, publisher and badge rows keep a gap and wrap on narrow cards (Installed tab too), platform badges aligned.
- **Marketplace filters.** Server plugins: platform chips "This server (Node)" (the default: plugins with a package for
  this server), "All platforms", Node, Python and .NET, kept in the URL (`&platform=python`); a plugin shown for
  another platform says it cannot be installed here, has no Install, Update or Remove, and its details open on that
  platform's tab. Both tabs: All / Installed / Not installed (`&installed=yes|no`). Filtered on the page the server
  sends: the servers ask the marketplace for their own platform only and do not pass `platform` on, so plugins
  without a package for the server's platform are not listed yet.
- **Platforms in a server plugin's details**: Node, Python and .NET tabs (those without a package disabled and marked,
  this server's marked and chosen by default, with a note saying whether it is the package this server installs);
  the versions, the install command and the readme follow the tab: the platform's `platforms.<p>.readme`, else the
  plugin's readme, else its description.
- **Qodalis CLI 2.9.0** on the Terminal page: `pkg add` works under the dashboard's Content-Security-Policy.
- **Skeletons while loading.** Every page that waits on the server shows the shape of what is coming: tables, cards,
  charts, the Logs list on every filter change, the Jobs page's Last runs, plugin details. Routes load lazily (the
  initial bundle went from 2.6 MB to about 500 kB), and a page or widget that fails shows its error with a retry
  instead of an empty space.
- **Config page on the servers' config providers** (#61). Every provider and section with typed inputs (string,
  number, boolean, lists, enums, secrets, JSON, durations, URLs), validation from the server, per-key errors,
  version conflicts, and reset to default. It shows where each provider stores its values (memory, file, database,
  Redis, appsettings), whether a change needs a restart, the origin of each value (set in code, saved, or the default)
  and which settings are required.
- **Marketplace.** The Plugins page has a Marketplace tab with Dashboard plugins and Server plugins
  (`?tab=marketplace&kind=server`):
  - **Dashboard plugins:** install, update, remove and their settings, with validation and defaults.
  - **Server plugins:** Node, Python and .NET badges with this server's platform highlighted; "not available",
    "incompatible" and "needs setup in code" states; a confirmation naming the publisher and package; a details
    dialog with versions and install commands per platform.
  - **Installed tab:** a Marketplace badge, the load status, and a failed plugin's error. A plugin that needs
    configuration shows the missing settings and a Configure button, which also opens right after such an install.
- **Restart required.** A banner, updated live, when settings or plugins need a restart, with a Restart server button
  for those allowed (`server:restart`).
- **More pages and details:**
  - Stat cards on Users, Databases and Audit.
  - Status filters on Jobs.
  - Clicking an error in Needs attention opens Logs at that entry with its filters.
  - Plugin cards open a details page.
  - A Permissions column on Commands.
  - Machine memory (used of installed) on the Overview.
  - Long lists (groups, permissions) show the first few and "+N more" in a dialog (kit `ChipList`).
- **Themes:** Device, Light and Dark, with the terminal following the dashboard's scheme.
- **Kit:** `Skeleton` family, `Spinner`, `EmptyState`, `ErrorState`, `ChipList`, the theme switcher and
  `useExtensionConfig`.
- **Content-Security-Policy.** The built dashboard's `index.html` carries a strict policy (`<meta http-equiv>`,
  production builds only): requests, scripts, images and forms stay on the server's origin, except a few read-only
  package hosts the embedded terminal's `pkg add` needs (plugins.qodalis.com, registry.npmjs.org, unpkg.com,
  cdn.jsdelivr.net); `'wasm-unsafe-eval'` for the terminal and `blob:` for the package `pkg add` verified, no
  `'unsafe-eval'` and no inline scripts. A plugin's page, which runs with the
  signed-in admin's token, can no longer send it or any data anywhere it could be read back. Images from other origins
  (a branding icon given as an external URL) now fall back to the default icon.
- **Dashboard modules build to exactly `extension.js` and `extension.css`** (lazy imports bundled in, such as the data
  explorer's SQL editor): the marketplace records and the servers install only these two files, so a module installed
  from the marketplace failed to load its chunks. The kit README tells extension authors to do the same.
- **Installing a dashboard plugin (`dashboard:install`) amounts to full admin**: its code runs with the signed-in
  admin's session; install only from publishers you trust (README, Security).

## 1.0.0-beta.28

- **Plugin pages no longer change the dashboard's layout.** The modules' stylesheets (loaded on the Overview for their
  cards) carried their own copies of utility classes, which overrode the dashboard's responsive grids on every page:
  Server resources, Events and other pages showed one column instead of several. A module's classes now apply only
  inside the elements it is mounted into (`important: '.qcli-extension'`, the kit's `EXTENSION_SCOPE`), and the kit's
  modals, menus, selects and tooltips of an extension render inside that scope. Extensions built with the kit set the
  same option in their Tailwind config (kit README).

## 1.0.0-beta.27

- **Qodalis CLI 2.8.0** on the Terminal page.

- **Users page and Account page** (`@qodalis/cli-dashboard-module-users`, `modules/users`, new; servers 1.0.0-beta.30
  register it with their users plugin). Users (`users:read`): search, create (with a first password, temporary by
  default), edit name, email, groups and disabled, set someone's password, delete; groups with their permissions
  (the server's catalog as checkboxes, wildcards typed) and members; signed-in sessions (`sessions:read`) with sign
  out. Account, for every signed-in user, in the account menu: profile (email editable), password change, and what
  they may do. Where the host application signs users in or manages them (e.g. RateBell), the pages only show:
  no password forms, no edits. Texts in the 11 languages.
- **Account menu: plugins' pages.** Extensions in the new group `account` are listed in the account menu (above
  Sign out) and the command palette instead of the sidebar.
- **A password that must be changed first.** Signing in with a password an administrator set (or the default one)
  now asks for a new one before the dashboard opens; until now every request answered 403.
- **Extensions: a session that cannot be read holds no permission**; only a server without sessions (one admin
  account) holds every one.

- **Plugins' pages moved out of the dashboard.** Jobs, Audit, Filesystem, Data explorer and API tokens are dashboard
  modules now (`modules/<name>`, npm `@qodalis/cli-dashboard-module-<name>`), embedded and registered by the server
  plugin that owns the API (jobs, audit, users; the server core for filesystem and data explorer, servers
  1.0.0-beta.30). The dashboard core keeps Overview, Commands, Plugins, Terminal, Events, Logs and Config, and shows
  a plugin's page only when its server registers it, so feature detection (`FeatureGate`) is gone. The old addresses
  (`/jobs/…`, `/audit`, `/filesystem`, `/data-explorer`, `/tokens`) redirect to `/x/<id>/…`, keeping the path, the
  query and the hash. Navigation sorts by section, then `order`, then the dashboard's own pages first.
- **Modules on the Overview and in the command palette.** An extension registered with `widgets: ["overview"]` adds
  cards to the Overview (`stat` in the top row, `half` and `full` panels) and items to Needs attention (asked again
  every minute); with `widgets: ["palette"]` it adds entries to the command palette under its title, and `search`
  adds a "Search <title> for …" entry. Jobs contributes its counts, run chart and failing jobs; Databases its size and
  pending or failed migrations. `defineExtension(App, { overview: { cards, attention }, palette })`; see
  [docs/extensions.md](docs/extensions.md).
- **Kit: more for extensions.** `useAsync`, `usePaging`, `useStoredState`, `useQueryParams`, `useLiveReload`,
  `ExtensionLink`/`useExtensionHref`, `formatBytes`, `shortDuration`, `tagStyle`; test helpers at
  `@qodalis/cli-server-dashboard-kit/testing` (`fakeDashboard`, `mountExtension`, `FakeServer`). `context.fetch` and
  `api.get` take `quiet`: a 401 there does not sign the user out.
- **Modules build minified** (Vite app build, chunks next to `extension.js`): the databases module went from 334 KB
  to 243 KB.
- **Databases page** (`@qodalis/cli-dashboard-module-databases`, `modules/databases`, new): the servers' databases
  plugins (1.0.0-beta.30) embed it as a dashboard extension (group Data, permission `databases:read`). The databases
  with their size, applied, pending and problem counts and last run. A database's overview: size (data, indexes,
  log), connections, transactions and queries per second sampled every 10 seconds while open (chart of the last 10
  minutes), cache hit ratio, version, uptime and the largest tables. Its migrations by status (applied, pending,
  changed, missing, failed) with when, who and how long; Apply pending, Migrate to here, Roll back to here and Roll
  back everything (`databases:migrate`), each confirmed with the SQL it runs (dry run) and a force option while
  migrations changed or are missing; the run history with trigger, who, duration, what it applied and the error. Live
  on the `databases:migration-run` event. Its own texts in the 11 languages.
- **Kit: charts.** `LineChart`, `ColumnChart`, `ChartCard`, `ChartLegend` and their helpers moved from the dashboard
  into the kit, for extensions; `ConfirmDialog` takes a `size`.
- **Sidebar: the navigation scrolls on its own**, the account and language block stays at the bottom (also in the
  mobile drawer).
- **Extensions: server events.** The context gains `onServerEvent(pattern, listener)` (the dashboard's events
  socket), and the kit `useServerEvents(patterns, reload)`.
- **Romanian.** The dashboard, the kit's components and the embedded terminal speak Romanian (Română): 11 languages.
- **Dashboard extensions: pages that plugins add.** The dashboard reads the server's list
  (`GET /api/v1/qcli/dashboard/extensions`, servers 1.0.0-beta.30) and shows each page in its navigation, the drawer
  and the command palette, in its section and with its title in the reader's language, for users holding its
  permission. At `/x/<id>` it loads the plugin's ES module and mounts it with the dashboard's context (session,
  permissions, theme, language, routing, notices, confirm dialog); a page that fails to load shows an error panel
  with Retry. Servers without the endpoint have no extensions. Contract: [docs/extensions.md](docs/extensions.md).
- **New package `@qodalis/cli-server-dashboard-kit`** (folder `kit/`, an npm workspace): the dashboard's components,
  their texts in the eleven languages, the theme tokens, a Tailwind preset and `defineExtension`/`useDashboard`/`useApi`
  to build extensions. The dashboard itself now uses its components from the kit. See [kit/README.md](kit/README.md).

## 1.0.0-beta.26

- **Tokens: requests today.** When the server counts API usage (its public-api plugin, servers 1.0.0-beta.29), the
  tokens table shows a Requests today column; the cell's tooltip gives the last 30 days. Tokens without a count show
  "–"; servers that do not count show no column. Translated in the ten languages.
- **New package `@qodalis/cli-server-portal`** (folder `portal/`, an npm workspace of this repository): the developer
  portal the servers' portal plugin serves, markdown guides from the docs plugin and an API reference from the
  public-api plugin's OpenAPI document, with code samples in seven languages and "try it". It shares the dashboard's
  theme tokens and components. See [portal/README.md](portal/README.md).

## 1.0.0-beta.25

- **Tokens: pick a new token's permissions.** New token offers "Everything I can do" (unscoped, as before) or
  "Selected": checkboxes from the server's list (`GET /api/v1/qcli/permissions`), grouped as the server groups them,
  each with its description, plus an "Other permissions" field for entries not in the list (a command's own
  permission). Picking and typing create the same token. Servers before 1.0.0-beta.29 have no list: the dialog says
  so and keeps the typed field.
- **Permission chips with descriptions.** In the tokens table each permission shows its description as a tooltip
  when the server lists it.
- **Host tokens marked.** Tokens the host application created for its own API (`audience: "host"`, servers
  1.0.0-beta.29) show a Host badge.

## 1.0.0-beta.24

- **Jobs: history retention.** The job page has a History retention card (the job's limits: global, overridden for
  the job, keeps all runs, or kept forever) and the jobs page a bar with the `jobs:prune-history` job's last run and
  how many runs it deleted. Needs servers 1.0.0-beta.28 (`historyRetention`); hidden on older servers.
- **Jobs page for many jobs.** Collapsible filters with the number set, Jobs and Recent runs tabs (`?tab=runs`), and
  paged lists with a rows-per-page picker (recent runs paged by the server).
- **Job tags in colour.** Each tag gets one of ten colours from its name, readable in both schemes, in the table, the
  filter and the job page.
- **Run controls as one button group** (Trigger, Pause/Resume, Stop, Cancel) in the jobs table and the job header.
- **Last-runs bars:** a tooltip with the run's status, duration, error, values and last log lines (loaded on demand),
  and a click opens the run (`/jobs/:id?run=<execId>`). Uses the run `id` that servers 1.0.0-beta.28 send in
  `/jobs/stats`, else finds the run by its start time.
- **Phones and tablets:** below 1024px a top bar and an accessible navigation drawer replace the sidebar; text fields
  are 44px tall on phones.
- **Filesystem:** uploading into a folder works (the upload sends the file's full path).
- **Sign-in:** `root`, the default account, as the username placeholder.

- **Shared dropdowns, menus and dialogs.** Every dropdown is a themed `Select` (search for long lists, keyboard
  support, clear button, a listbox that flips above when there is no room) and the job tag filter a `MultiSelect`.
  The account is a menu button (`DropdownMenu`) in the sidebar and in the phone top bar. Dialogs share one `Modal`
  (focus trap, focus return, scroll lock, bottom sheet on phones), and `ConfirmDialog` replaces `window.confirm`:
  cancelling a run and deleting runs are confirmed in a dialog that shows the action's progress.
- **Button groups on every grid.** Recent runs, a job's run history, files and API tokens show their row actions as a
  button group like the jobs table (icons, labels on wide screens, red for destructive actions, 44px on phones); the
  job history puts Delete in a ⋯ menu. The live events toolbar is a group of toggles.
- **README and screenshots.** A new README with a feature overview and a screenshot gallery; `npm run screenshots`
  (Playwright) regenerates every screenshot from a running server.

- **Plugins: an icon for every plugin and module.** The server plugin cards show the package's icon
  (`GET /api/v1/qcli/plugins/installed` now returns `icon`: an emoji, or an http(s)/root-relative image URL). A plugin
  or module without one (older servers, third-party packages) gets the built-in icon of a known first-party package or
  module, matched by its .NET, Node or Python id or name (`Qodalis.Cli.Plugin.Users`, `@qodalis/cli-server-plugin-users`,
  `Users` -> 👥), else the default 🧩, which replaces the module's initial in a tinted circle. An image that fails to
  load shows the same fallback.

## 1.0.0-beta.23

- Built with Qodalis CLI 2.5.2 (`server add` refuses a server the app already has; the data explorer prints the query the server ran).

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
- **Plugins: module icons.** Each command module card shows the module's `icon` from `GET /api/v1/qcli/plugins`:
  an emoji as text, a URL (`http(s)://` or `/…`) as a small image; without one (older servers) or when the image fails
  to load, the module's initial in a tinted circle. All in the same 32px box, in theme colors.
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
