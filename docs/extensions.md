# Dashboard extensions

Status: contract, 2026-11-23. Lets a server plugin add its own pages to the admin dashboard without
the dashboard knowing about it: the plugin registers an **extension**, serves its UI bundle, and the
dashboard loads that bundle at runtime and mounts it as a page. First user: the plugin marketplace's
moderation page (private `cli-marketplace` repo), which therefore is not part of this repository.

## Pieces

| Piece | Where | What |
|---|---|---|
| Registry + endpoint | each server (Node, .NET, Python) | `addDashboardExtension(...)` on the core builder; the admin plugin serves `GET /api/v1/qcli/dashboard/extensions` |
| Extension host | this repo, `src/` | reads the list, adds nav items and routes, loads and mounts bundles |
| Kit | this repo, `kit/` workspace, npm `@qodalis/cli-server-dashboard-kit` | shared components, theme tokens, Tailwind preset, `defineExtension`, types |
| An extension | the plugin's own repo | an ESM bundle built with the kit, served by the plugin |

## 1. Server contract (all three servers)

A plugin (or the host) registers extensions on the server builder; registration order is the order in
the list. Names: Node `builder.addDashboardExtension(ext)`, .NET `builder.AddDashboardExtension(ext)`
(`CliDashboardExtension`), Python `builder.add_dashboard_extension(ext)` (`CliDashboardExtension`). An
id registered twice throws (`dashboard extension already registered: <id>`); an invalid one throws
(`invalid dashboard extension: <reason>`).

`GET /api/v1/qcli/dashboard/extensions` (admin plugin, behind the dashboard's sign-in and `admin:access`, like
`/api/v1/qcli/plugins`), JSON, `Cache-Control: no-cache`:

```json
{
  "extensions": [
    {
      "id": "marketplace",
      "title": "Marketplace",
      "titles": { "de": "Marktplatz" },
      "icon": "🧩",
      "group": "data",
      "order": 100,
      "permission": "marketplace:moderate",
      "entry": "/qcli/marketplace/admin/extension.js",
      "styles": ["/qcli/marketplace/admin/extension.css"],
      "version": "0.1.0"
    }
  ]
}
```

| Field | Rules |
|---|---|
| `id` | required, `^[a-z0-9][a-z0-9-]{0,39}$`, unique; also the page's path segment |
| `title` | required, 1-40 characters |
| `titles` | optional, language code (`de`, `pt-BR`) → title |
| `icon` | optional: one emoji, or an `http(s)` / root-relative image URL; dashboard shows a generic icon otherwise |
| `group` | optional nav group: `overview`, `operations`, `data`, `access`, `system` (default `system`); unknown → `system`. `account`: listed in the account menu (the signed-in user's menu, with Sign out) and the command palette instead of the sidebar, e.g. the users plugin's Account page |
| `order` | optional integer, within the group (default 100) |
| `permission` | optional; the page shows only for users holding it (wildcards match, as everywhere) |
| `entry` | required: a root-relative path (`/...`, not `//`) or an `http(s)` URL; the dashboard loads only same-origin entries |
| `styles` | optional, same rules as `entry`, at most 5 |
| `version` | optional, shown in the page's error panel |
| `widgets` | optional slots the module fills besides its page: `overview` (cards and "Needs attention" items on the Overview), `palette` (command palette entries), `config` (inputs of the Config page by `editor` hint); unknown slots are ignored |
| `search` | optional path below the page ending where search text goes (`/?q=`): the command palette offers "Search <title> for …" and opens `/x/<id><search><text>` |
| `source` | `marketplace` for a dashboard plugin installed from the marketplace (admin plugin); absent for built-in extensions |
| `package` | optional, a marketplace extension's npm package; the dashboard otherwise finds it by `id` in `GET /api/v1/qcli/dashboard/marketplace/installed` |

Every extension is returned regardless of the caller's permissions (the list holds no secrets and the
plugin's own API enforces access); the dashboard filters what it shows. Paths are returned as
registered; the dashboard resolves root-relative ones against the server's origin and its path prefix
(the same way it resolves its other API URLs). The endpoint is listed nowhere else; a server without it
(404) simply has no extensions.

The plugin serves `entry` and `styles` itself (static files, `Cache-Control` as it likes; a content
hash in the file name or a `?v=` query is recommended). On a protected server those paths must be
public (the bundle is not secret) or behind the same sign-in the dashboard uses.

## 2. Runtime contract (dashboard ↔ extension)

The entry is an ES module. Its default export (or a named export `extension`) is:

```ts
export interface DashboardExtension {
    /** Renders into `element`; returns a cleanup function, or nothing. */
    mount(element: HTMLElement, context: DashboardExtensionContext): void | (() => void) | Promise<void | (() => void)>;
}
```

The dashboard: on the first visit to `/x/<id>`, injects the `styles` (`<link rel="stylesheet">`, once),
`import()`s the entry, calls `mount` with a fresh element inside the page (below nothing: the extension
draws its own page header with the kit), calls the cleanup when the page is left, and shows an error
panel (title, the error, version, "Retry") when loading or mounting fails, inside an error boundary.

```ts
export interface DashboardExtensionContext {
    /** The extension's id and its registration. */
    extension: DashboardExtensionInfo;
    /** The server's API base, e.g. `https://host` or `https://host/prefix` (no trailing slash). */
    apiBase: string;
    /**
     * fetch against the server: a path (`/api/v1/qcli/...`) is resolved against `apiBase`, with the
     * dashboard's credentials (bearer token or cookie) and JSON headers; a 401 signs the user out as
     * the dashboard's own requests do.
     */
    fetch(path: string, init?: RequestInit): Promise<Response>;
    user: { id: string; name: string; email?: string };
    permissions: string[];
    /** Wildcard-aware, the same matcher the dashboard uses. */
    hasPermission(permission: string): boolean;
    /** Current theme and language, with change subscriptions (each returns an unsubscribe). */
    theme: 'light' | 'dark';
    onThemeChange(listener: (theme: 'light' | 'dark') => void): () => void;
    language: string;
    onLanguageChange(listener: (language: string) => void): () => void;
    /** The extension's own routing below `/x/<id>`: `path` is e.g. `/` or `/plugins/abc?tab=log`. */
    path: string;
    navigate(path: string, options?: { replace?: boolean }): void;
    onPathChange(listener: (path: string) => void): () => void;
    /**
     * Server events on the dashboard's own socket (`/ws/v1/qcli/events`): `pattern` is a type (`databases:migration-run`),
     * a prefix (`job:*`) or `*`; the event is the server's message (`{ type, ... }`). Returns an unsubscribe.
     */
    onServerEvent(pattern: string, listener: (event: Record<string, unknown>) => void): () => void;
    /**
     * A marketplace plugin's settings (stored values over the defaults, by key), read before it mounts; `undefined`
     * for built-in extensions, `{}` when they could not be read (the user gets a notice; use your defaults).
     */
    config?: Record<string, unknown>;
    /** The new settings after each change (`config:changed` of its section), live. Returns an unsubscribe. */
    onConfigChange?(listener: (config: Record<string, unknown>) => void): () => void;
    /** The dashboard's toasts and confirmation dialog. */
    notify(message: string, kind?: 'success' | 'error' | 'info'): void;
    confirm(options: { title: string; message?: string; confirmText?: string; danger?: boolean }): Promise<boolean>;
    /** The dashboard's version, for compatibility checks. */
    dashboardVersion: string;
    /** The context API version (1); bumped only on breaking changes. */
    apiVersion: 1;
}
```

### Settings of marketplace plugins

A dashboard plugin from the marketplace declares its settings in its package.json (`qodalis.config.entries`, the
config providers' entry model without `secret`; example and rules in [kit/README.md](../kit/README.md#settings-of-a-marketplace-plugin)).
The admin plugin makes them the config provider `dashboard-plugins`, one section per installed plugin (section id =
the extension id, entries with the version's defaults), validated as every config provider is (400
`{ error: 'validation failed', errors: { key: message } }`, 409 versions, audit, `config:changed`).

- **Install and update** (Plugins page, Marketplace): the confirmation lists the version's settings, editable with the
  Config page's inputs and checked with its validators while typing; Install (Update) stays disabled while any is
  invalid. Install starts from the defaults, Update from the current values (`GET .../installed/{name}/config`; a value
  the new version no longer accepts shows its new default). Only changed settings are sent, as `config` of
  `POST /installed` or `PUT /installed/{name}`: untouched keys keep following the plugin's defaults (a new version's
  default applies) or keep their stored values. The server's per-key errors show under their fields and the dialog
  stays open; after an update the notice names the settings the server reset (`configDropped`). When the settings
  cannot be read the dialog says so and installs with the defaults (an update then shows no fields).
- **Details**: a Settings table of the latest version (key, type, default, rule).
- **Installed**: each marketplace plugin with a section links to it, `/config?provider=dashboard-plugins&section=<id>`;
  the Config page scrolls to the section given by `section=` and outlines it, or notes that there is none.
- **Runtime**: before mounting a page or Overview card with `source: "marketplace"`, the dashboard reads
  `GET /api/v1/qcli/dashboard/marketplace/installed/{name}/config` (`{ values, version }`; `{name}` is the `package`
  the extension list sends with it, no other lookup) and passes `values` as
  `context.config`; on `config:changed` with provider `dashboard-plugins` and the extension's id as section it reads
  them again and calls the `onConfigChange` listeners when they changed. A failed first read mounts the plugin with
  `config: {}` and an error notice (the plugin applies its own defaults); a failed later read keeps the last values,
  also with a notice. Built-in extensions get `config: undefined` and no request.

### Server plugins from the marketplace

The Plugins page's Marketplace tab switches between **Dashboard plugins** and **Server plugins**, kept in the URL
(`/plugins?tab=marketplace&kind=server`). Server plugins come from the admin plugin's
`/api/v1/qcli/server/marketplace` (`GET /` with this server's `platform`, `GET /plugins`, `GET /plugins/{name}`,
`GET /installed`, `POST /installed`, `PUT`/`DELETE /installed/{name}`, 202 with `restartRequired`):

- **Cards**: Node, Python and .NET badges with this server's platform highlighted (from `GET /`, else the platform
  whose package is the plugin's own), the installed version and an available update, "Not available for <platform>"
  without a package for this server, "Incompatible" with the marketplace's reason, "Needs setup in code"
  (`autoInstall: false`) with its reason and a link to the homepage, repository or marketplace page.
- **Install, Update, Remove** need `plugins:install` (not `dashboard:install`). The confirmation says the plugin runs
  code in the server process with full rights, names the publisher and the package, and that a restart applies it.
  Afterwards "Restart the server to apply" with Restart server (`server:restart` on a server that can restart itself);
  the restart banner follows `server:restart-required`. Errors: 502 unreachable or integrity mismatch, 403 unverified
  or forbidden, 400 incompatible, needs setup in code or not available, 409 the host's own package.
  A plugin answered with `status: "needs-configuration"` opens its settings provider (`settings`) on the Config page.
- **Details**: each platform's package and versions, the install command of each platform with a copy button, the
  plugin's settings and the start of its readme.
- **Installed tab**: the marketplace's server plugins (listed once, not again among the host's packages) with a
  Marketplace badge, their status (loaded, runs after a restart, failed with the error of the last start, skipped,
  removed, needs configuration with the `missing` settings and Configure, which opens the `settings` provider), Update
  and Remove. Plugins added in code (`GET /plugins/installed` with `source: "code"`) show needs-configuration and
  Configure too; packages with `source: "marketplace"` are listed only in the marketplace section.
  `server:plugins-changed` reloads both lists.
- **Config page**: an entry's `origin` is shown: `code` ("Set in code", or "From code" next to the store's kind: the
  default, which a saved value overrides; no reset), `setting` ("Saved"); `required: true` entries are marked
  Required, or "Required: not set yet" without a value.

### Overview cards, attention items and palette entries

A module registered with `widgets: ["overview"]` is loaded when the Overview opens; its `overview` export
adds:

- `cards`: `{ id, size, mount }` with `size` `stat` (the row of figures at the top, render a `StatCard`),
  `half` (two per row on wide screens) or `full` (across). Each card is mounted with the module's context,
  `path` `/`; its `navigate` opens the module's page (`navigate('/?at=…')` → `/x/<id>/?at=…`).
- `attention(context)`: `Promise<AttentionItem[]>`, `{ id, level: 'error' | 'warning', title, detail?, time?,
  path? }`, asked when the Overview opens and every minute; merged with the log's errors under "Needs
  attention" (errors first, then newest), each linking to `/x/<id><path>`.

With `widgets: ["palette"]` the module is loaded when the command palette opens and `palette(context)`
gives `{ id, label, hint?, icon?, path }` entries, listed under the module's title.

```tsx
export default defineExtension(JobsPage, {
  overview: {
    cards: [{ id: 'active', size: 'stat', component: ActiveJobsCard }, { id: 'runs', size: 'full', component: RunsChart }],
    attention: async (context) => failingJobs(createApi(context.fetch)),
  },
  palette: async (context) => (await createApi(context.fetch).get<Job[]>('/api/v1/qcli/jobs')).map(toEntry),
});
```

### Config editors

The Config page picks each entry's input from its `type` (`string`, `number`, `boolean`, `string[]`, `enum`,
`secret`, `json`, `duration`, `url`). An entry can ask for a richer one with an `editor` hint (`cron`, `origins`,
`code`, ...): a module registered with `widgets: ["config"]` is loaded when the Config page opens, and its
`configEditors` export (`{ [hint]: mount }`) renders every entry with that hint. `mount(element, props, context)`
gets `{ entry, value, onChange, disabled, error? }` and returns `{ update(props), unmount() }`; the page calls
`update` on every change. The value it reports goes through the entry's validation and the diff before saving, like
any other input. A hint no module fills falls back to the type's input; secrets always use the secret input.
Inside the dashboard, `registerConfigEditor(hint, Component)` (`src/pages/config/configEditors.ts`) does the same.

```tsx
export default defineExtension(SchedulerPage, {
  configEditors: { cron: ({ value, onChange, disabled }) => <CronPicker value={String(value ?? '')} onChange={onChange} disabled={disabled} /> },
});
```

Styling: the dashboard keeps its theme as CSS custom properties on `:root` (the same tokens
`src/theme/tokens.ts` defines). Extensions style with those variables only (through the kit's Tailwind
preset and components), so they follow light/dark and the host's colours with no code. Their utility classes are
scoped: the extension's Tailwind config sets `important: '.qcli-extension'` (the kit's `EXTENSION_SCOPE`), the
dashboard puts that class on every element it mounts an extension or an Overview card into, and the kit's overlays
render into a body-level element with the class (`defineExtension` turns this on). Unscoped classes in an extension's
stylesheet would override the dashboard's own layout (its responsive grids) on every page once the stylesheet is
loaded.

## 3. The kit (`@qodalis/cli-server-dashboard-kit`)

A workspace of this repo (`kit/`), versioned with the dashboard, published with it. Extensions bundle
it (and their own React; `react`/`react-dom` are peer dependencies). The dashboard imports the same
components from it, so built-in pages and extensions look the same.

- `defineExtension(App)`: the `DashboardExtension` for a React component; mounts a React root with
  the context in a provider and re-renders on theme, language and path changes. `useDashboard()`
  returns the context; `useApi()` gives `get/post/put/patch/del` helpers returning parsed JSON and
  throwing `{ status, error }`; `useServerEvents(patterns, reload)` calls `reload` after server events (a burst
  makes one call), for pages that stay live; `useExtensionConfig()` gives a marketplace plugin's settings and
  renders again when they change.
- Components: the dashboard's shared building blocks (page header, buttons and button groups,
  badge, card/stat card, data table with sorting and pagination, modal, confirm dialog, dropdown menu,
  select, tabs, input/textarea, empty and error states, spinner, mono panel, ...), moved from
  `src/components` into the kit with the same props.
- Theme: `tokens` (the CSS variable names), `kit/tailwind-preset` (colours, radii, fonts mapped to the
  variables), `kit/styles.css` (base classes the components need).
- Hooks shared with the dashboard: `useAsync(fetcher, deps)` (data, loading, error, refetch, quiet
  refresh), `useLiveReload(patterns, reload, { filter, paused, delay })` on the dashboard's events,
  `usePaging`, `useStoredState`; charts: `LineChart`, `ColumnChart`, `ChartCard`, `ChartLegend`.
- Types: `DashboardExtension`, `DashboardExtensionContext`, `DashboardExtensionInfo`, `OverviewCard`,
  `AttentionItem`, `PaletteEntry`, `DashboardPluginConfig`, `DashboardPluginConfigEntry`, `DashboardExtensionConfig`.
- Texts: `useTranslations(messages)` / `createTranslations(messages, language)` with `defineMessages` per
  namespace: each extension ships its own messages (plural rules, dates, numbers, relative times, English
  fallback); the dashboard's own texts stay in the dashboard and are never shared with plugins.

## Security

Extensions run as code in the dashboard's page with the signed-in user's rights, like the dashboard
itself: only same-origin entries are loaded, and only what the server's plugins register (the host
decides which plugins it mounts). The context's `fetch` never sends credentials to another origin.

## Plugin-shipped modules

The pages of server plugins are not part of the dashboard: each is a module (`modules/<name>`, npm
`@qodalis/cli-dashboard-module-<name>`, versioned with the dashboard) built with the kit, embedded by the
plugin that serves its API in each server (Node, .NET, Python) and registered when the plugin is mounted, so a
server shows a page only when it has the plugin. The pages are served at `/qcli/modules/<id>` (databases at
`/qcli/databases`).

| Module | Plugin | Page | Overview / palette |
|---|---|---|---|
| `jobs` | jobs | `/x/jobs`, a job `/x/jobs/<id>` | active jobs stat, runs of the last 24 hours, failing jobs as attention items; jobs in the palette; search |
| `audit` | audit (users) | `/x/audit` | search |
| `filesystem` | filesystem | `/x/filesystem` | |
| `data-explorer` | data explorer | `/x/data-explorer` | |
| `tokens` | users | `/x/tokens` | |
| `users` | users | `/x/users` (users, groups, sessions); registered again as `account` (group `account`): `/x/account` in the account menu | search |
| `databases` | databases | `/x/databases` | databases stat; unreadable databases, problems and pending migrations as attention items |

The dashboard itself keeps what every server has: sign-in, layout and navigation, the Overview (server
figures, resources, log errors, live events, and the modules' cards), terminal, commands, plugins,
configuration, events, logs and the extension host. Its old routes (`/jobs`, `/jobs/<id>`, `/audit`,
`/filesystem`, `/data-explorer`, `/tokens`) redirect to the modules' pages.
