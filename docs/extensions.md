# Dashboard extensions

Status: contract, 2026-11-23. Lets a server plugin add its own pages to the admin dashboard without
the dashboard knowing about it: the plugin registers an **extension**, serves its UI bundle, and the
dashboard loads that bundle at runtime and mounts it as a page. First user: the plugin marketplace's
moderation page (private `cli-marketplace` repo), which therefore is not part of this repository.

## Pieces

| Piece | Where | What |
|---|---|---|
| Registry + endpoint | each server (Node, .NET, Python), core | `addDashboardExtension(...)` on the builder; `GET /api/v1/qcli/dashboard/extensions` |
| Extension host | this repo, `src/` | reads the list, adds nav items and routes, loads and mounts bundles |
| Kit | this repo, `kit/` workspace, npm `@qodalis/cli-server-dashboard-kit` | shared components, theme tokens, Tailwind preset, `defineExtension`, types |
| An extension | the plugin's own repo | an ESM bundle built with the kit, served by the plugin |

## 1. Server contract (all three servers)

A plugin (or the host) registers extensions on the server builder; registration order is the order in
the list. Names: Node `builder.addDashboardExtension(ext)`, .NET `builder.AddDashboardExtension(ext)`
(`CliDashboardExtension`), Python `builder.add_dashboard_extension(ext)` (`CliDashboardExtension`). An
id registered twice throws (`dashboard extension already registered: <id>`); an invalid one throws
(`invalid dashboard extension: <reason>`).

`GET /api/v1/qcli/dashboard/extensions` (a CLI route: behind sign-in on a protected server, like
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
| `group` | optional nav group: `overview`, `operations`, `data`, `access`, `system` (default `system`); unknown → `system` |
| `order` | optional integer, within the group (default 100) |
| `permission` | optional; the page shows only for users holding it (wildcards match, as everywhere) |
| `entry` | required: a root-relative path (`/...`, not `//`) or an `http(s)` URL; the dashboard loads only same-origin entries |
| `styles` | optional, same rules as `entry`, at most 5 |
| `version` | optional, shown in the page's error panel |

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
    /** The dashboard's toasts and confirmation dialog. */
    notify(message: string, kind?: 'success' | 'error' | 'info'): void;
    confirm(options: { title: string; message?: string; confirmText?: string; danger?: boolean }): Promise<boolean>;
    /** The dashboard's version, for compatibility checks. */
    dashboardVersion: string;
    /** The context API version (1); bumped only on breaking changes. */
    apiVersion: 1;
}
```

Styling: the dashboard keeps its theme as CSS custom properties on `:root` (the same tokens
`src/theme/tokens.ts` defines). Extensions style with those variables only (through the kit's Tailwind
preset and components), so they follow light/dark and the host's colours with no code.

## 3. The kit (`@qodalis/cli-server-dashboard-kit`)

A workspace of this repo (`kit/`), versioned with the dashboard, published with it. Extensions bundle
it (and their own React; `react`/`react-dom` are peer dependencies). The dashboard imports the same
components from it, so built-in pages and extensions look the same.

- `defineExtension(App)`: the `DashboardExtension` for a React component; mounts a React root with
  the context in a provider and re-renders on theme, language and path changes. `useDashboard()`
  returns the context; `useApi()` gives `get/post/put/patch/del` helpers returning parsed JSON and
  throwing `{ status, error }`.
- Components: the dashboard's shared building blocks (page header, buttons and button groups,
  badge, card/stat card, data table with sorting and pagination, modal, confirm dialog, dropdown menu,
  select, tabs, input/textarea, empty and error states, spinner, mono panel, ...), moved from
  `src/components` into the kit with the same props.
- Theme: `tokens` (the CSS variable names), `kit/tailwind-preset` (colours, radii, fonts mapped to the
  variables), `kit/styles.css` (base classes the components need).
- Types: `DashboardExtension`, `DashboardExtensionContext`, `DashboardExtensionInfo`.
- i18n helper: `createTranslator(messages, language)` (extensions bring their own strings; the
  dashboard's i18n stays in the dashboard).

## Security

Extensions run as code in the dashboard's page with the signed-in user's rights, like the dashboard
itself: only same-origin entries are loaded, and only what the server's plugins register (the host
decides which plugins it mounts). The context's `fetch` never sends credentials to another origin.
