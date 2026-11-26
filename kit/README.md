# @qodalis/cli-server-dashboard-kit

Build pages that a plugin adds to the admin dashboard of the Qodalis CLI servers (Node, .NET, Python). The kit
holds the dashboard's own components, its theme (CSS variables and a Tailwind preset), the texts of its components
in eleven languages, and the extension API. A page built with it looks and behaves like the dashboard's own pages, in
the light and dark themes and in the reader's language.

The contract between server, dashboard and extension is in
[docs/extensions.md](https://github.com/qodalis-solutions/cli-server-dashboard/blob/main/docs/extensions.md).

## How an extension works

1. The plugin registers the page on the server: `builder.addDashboardExtension({ id, title, entry, ... })` (Node),
   `cli.AddDashboardExtension(...)` (.NET), `builder.add_dashboard_extension(...)` (Python).
2. The plugin serves `entry` (an ES module) and its stylesheet, e.g. under `/qcli/<plugin>/admin/`.
3. The dashboard lists the page in its navigation (only for users holding its `permission`), and at `/x/<id>` it
   loads the module and calls `mount(element, context)`.

## Install

```bash
npm install @qodalis/cli-server-dashboard-kit react react-dom
npm install -D vite @vitejs/plugin-react tailwindcss@3 postcss autoprefixer
```

## A page

```tsx
// src/index.tsx
import './styles.css';
import { PageHeader, defineExtension, defineMessages, useApi, useDashboard, useTranslations } from '@qodalis/cli-server-dashboard-kit';

// The page's own texts: each plugin ships its messages, in as many of the dashboard's languages as it likes
const messages = {
    billing: defineMessages({
        en: { title: 'Billing', invoices_one: '{count} invoice', invoices_other: '{count} invoices' },
        de: { title: 'Abrechnung', invoices_one: '{count} Rechnung', invoices_other: '{count} Rechnungen' },
        ro: { title: 'Facturare', invoices_one: '{count} factură', invoices_few: '{count} facturi', invoices_other: '{count} de facturi' },
    }),
};

function Billing() {
    const { user } = useDashboard();
    const api = useApi(); // JSON over the dashboard's session: api.get('/api/v1/qcli/...')
    const { t, formatDate } = useTranslations(messages); // the dashboard's language, plural rules, dates
    // ...
    return <PageHeader title={t('billing.title')} subtitle={t('billing.invoices', { count: 3 })} />;
}

export default defineExtension(Billing);
```

`defineExtension` mounts a React root with the dashboard's context and re-renders on theme, language, path and
settings changes. Without React, export `{ mount(element, context) { ...; return cleanup; } }` yourself.

The context (`useDashboard()`):

| Member | |
|---|---|
| `fetch(path, init)` | `fetch` against the server with the dashboard's token and JSON headers; a 401 signs the user out, unless `quiet: true` |
| `user`, `permissions`, `hasPermission(p)` | the signed-in user; wildcard-aware permission check |
| `theme`, `onThemeChange` | `light` or `dark` |
| `language`, `onLanguageChange` | the dashboard's language (`en`, `de`, ...) |
| `path`, `navigate(path)`, `onPathChange` | the page's own routing below `/x/<id>` |
| `onServerEvent(pattern, listener)` | server events (`databases:migration-run`, `job:*`, `*`) on the dashboard's socket; `useServerEvents(patterns, reload)` reloads after them |
| `config`, `onConfigChange(listener)` | a marketplace plugin's settings (below); `undefined` for built-in extensions; `useExtensionConfig()` reads them and renders again on every change |
| `notify(message, kind)`, `confirm(options)` | the dashboard's notices and confirm dialog |
| `extension`, `apiBase`, `dashboardVersion`, `apiVersion` | the registration, the server's URL, versions |

Hooks and helpers the dashboard's own pages use: `useAsync`, `usePaging`, `useStoredState`, `useQueryParams` (the
page's query string), `useLiveReload`, `ExtensionLink`/`useExtensionHref` (links below `/x/<id>`), `formatBytes`,
`shortDuration`, `tagStyle`, and the charts (`LineChart`, `ColumnChart`, `ChartCard`).

## Overview cards, attention and the command palette

Registered with `widgets: ["overview"]` and/or `["palette"]`, the module also fills the Overview and the command
palette. They are mounted with the page's context; `navigate` opens the page.

```tsx
export default defineExtension(Billing, {
    overview: {
        // stat: a figure in the top row; half or full: a panel below
        cards: [{ id: 'open', size: 'stat', component: OpenInvoices }],
        // Needs attention, asked again every minute
        attention: async ctx => [{ id: 'late', level: 'warning', title: '3 invoices late', path: '/?status=late' }],
    },
    // Command palette entries, under the page's title
    palette: async ctx => [{ id: 'inv-42', label: 'Invoice 42', path: '/42' }],
});
```

With `widgets: ["config"]`, `configEditors` gives the Config page an input for every entry with an `editor` hint
(`{ cron: CronEditor }`, a component taking `ConfigEditorProps`: `entry`, `value`, `onChange`, `disabled`, `error`).
`mountConfigEditor(Component)` makes the same mount function by hand.

With `search: "/?q="` in the registration, the palette offers "Search Billing for …" and opens `/x/<id>/?q=<text>`.

## Settings of a marketplace plugin

A dashboard plugin installed from the marketplace can declare settings with defaults in its package.json, with the
server config providers' entry model (`DashboardPluginConfigEntry`):

```json
{
    "name": "@acme/dashboard-kanban",
    "qodalis": {
        "kind": "dashboard",
        "extension": { "js": "dist/extension.js", "css": "dist/extension.css" },
        "config": {
            "entries": [
                { "key": "refreshSeconds", "label": "Refresh every", "description": "Seconds between reloads", "type": "number", "default": 30, "validation": { "min": 5, "max": 3600 } },
                { "key": "columns", "label": "Columns", "type": "string[]", "default": ["name", "status"] },
                { "key": "mode", "type": "enum", "default": "compact", "validation": { "options": ["compact", "full"] } }
            ]
        }
    }
}
```

- Types: `string`, `number`, `boolean`, `string[]`, `enum`, `json`, `duration` (`30s`, `15m`; min/max in
  milliseconds), `url`. No `secret`: the plugin runs in the browser and cannot keep one; the marketplace rejects a
  version declaring one. Rules: `min`, `max` (value, length, items), `pattern`, `options`, `required`.
- Keys `^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$`, at most 50 entries, each default valid under its own rules, at most 32 KB of
  JSON; the marketplace rejects a version otherwise.
- The install dialog shows the settings with their defaults to change; afterwards they are the section `<id>` of the
  `dashboard-plugins` provider on the Config page (`/config?provider=dashboard-plugins&section=<id>`) and
  `config set dashboard-plugins.<id>.<key> <value>` in the CLI. An update keeps the values the new version still
  accepts and resets the others to its defaults.

The plugin reads the stored values over the defaults, by key. The dashboard reads them before it mounts the page (and
its Overview cards), and again on each change, live:

```tsx
import { defineExtension, useExtensionConfig } from '@qodalis/cli-server-dashboard-kit';

interface KanbanSettings { refreshSeconds: number; columns: string[]; mode: 'compact' | 'full' }

function Kanban() {
    const config = useExtensionConfig<KanbanSettings>(); // renders again when someone saves new values
    const seconds = config?.refreshSeconds ?? 30;          // keep the package.json defaults as fallbacks
    // ...
}

export default defineExtension(Kanban);
```

Without React: `context.config` on mount and `context.onConfigChange(values => ...)` (returns the unsubscribe; absent
on dashboards before settings, so call it as `context.onConfigChange?.(...)`).

- Built-in extensions (the server's own modules) get `config: undefined`.
- When the dashboard cannot read the settings, the plugin still mounts, with `config: {}`, and the user sees a notice:
  fall back to your defaults for every key (`config.x ?? default`), as above.

## Tests

`@qodalis/cli-server-dashboard-kit/testing` mounts a page with a fake context whose `fetch` answers from a function
(needs `@testing-library/react`):

```tsx
import { fakeDashboard, json, mountExtension } from '@qodalis/cli-server-dashboard-kit/testing';
import billing from '../src/index';

const dashboard = fakeDashboard('billing', { server: path => json([]), permissions: ['billing:read'] });
const unmount = await mountExtension(billing, dashboard.context);
// dashboard.state.requests: what the page asked the server
```

`fakeDashboard(id, { server, config: { refreshSeconds: 60 } })` makes it a marketplace plugin with these settings;
`dashboard.setConfig(values)` changes them as a save on the Config page would.

## Styles

```css
/* src/styles.css */
@tailwind components;
@tailwind utilities;
```

```js
// tailwind.config.js
import kit from '@qodalis/cli-server-dashboard-kit/tailwind-preset';

export default {
    presets: [kit],
    content: ['./src/**/*.{ts,tsx}', './node_modules/@qodalis/cli-server-dashboard-kit/dist/**/*.js'],
    corePlugins: { preflight: false }, // the dashboard has its base styles
    important: '.qcli-extension', // the page's classes apply only inside it (EXTENSION_SCOPE)
};
```

`important: '.qcli-extension'` is required: the dashboard loads every extension's stylesheet into its own page, and
unscoped utility classes (`.grid-cols-1`, ...) would override the dashboard's responsive layout on its other pages. The
dashboard puts `qcli-extension` on the element it mounts the page (and each Overview card) into, and `defineExtension`
renders the kit's modals, menus, selects and tooltips into a body-level element with the same class.

The preset maps every color to the dashboard's theme variables (`bg-surface`, `text-muted`, `border-border`,
`text-error`, ...), so the page follows the server's color scheme. `@qodalis/cli-server-dashboard-kit/styles.css`
holds the classes the kit's components use, for pages that do not run Tailwind.

## Build

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
        lib: { entry: 'src/index.tsx', formats: ['es'], fileName: () => 'extension.js', cssFileName: 'extension' },
        rollupOptions: { output: { inlineDynamicImports: true } },
    },
});
```

The output (`dist/extension.js`, `dist/extension.css`) is what the plugin serves as `entry` and `styles`. React and
the kit are bundled in: the extension does not depend on the dashboard's versions of them. Keep it to these two files
(`inlineDynamicImports` bundles lazy imports in): the marketplace records and the servers install only `extension.js`
and `extension.css`, so a chunk next to them would be missing on a server that installed the plugin from the
marketplace.

A complete example is in [example/](example/) (`npm run build:example -w kit` in this repository).
