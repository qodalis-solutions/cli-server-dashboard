# @qodalis/cli-server-dashboard-kit

Build pages that a plugin adds to the admin dashboard of the Qodalis CLI servers (Node, .NET, Python). The kit
holds the dashboard's own components, its theme (CSS variables and a Tailwind preset), the texts of its components
in ten languages, and the extension API. A page built with it looks and behaves like the dashboard's own pages, in
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
import { PageHeader, StatCard, createTranslator, defineExtension, useApi, useDashboard } from '@qodalis/cli-server-dashboard-kit';

const messages = {
    en: { title: 'Billing', invoices: 'Invoices' },
    de: { title: 'Abrechnung', invoices: 'Rechnungen' },
};

function Billing() {
    const { language, user } = useDashboard();
    const api = useApi(); // JSON over the dashboard's session: api.get('/api/v1/qcli/...')
    const t = createTranslator(messages, language);
    // ...
    return <PageHeader title={t('title')} subtitle={user.name} />;
}

export default defineExtension(Billing);
```

`defineExtension` mounts a React root with the dashboard's context and re-renders on theme, language and path
changes. Without React, export `{ mount(element, context) { ...; return cleanup; } }` yourself.

The context (`useDashboard()`):

| Member | |
|---|---|
| `fetch(path, init)` | `fetch` against the server with the dashboard's token and JSON headers; a 401 signs the user out |
| `user`, `permissions`, `hasPermission(p)` | the signed-in user; wildcard-aware permission check |
| `theme`, `onThemeChange` | `light` or `dark` |
| `language`, `onLanguageChange` | the dashboard's language (`en`, `de`, ...) |
| `path`, `navigate(path)`, `onPathChange` | the page's own routing below `/x/<id>` |
| `notify(message, kind)`, `confirm(options)` | the dashboard's notices and confirm dialog |
| `extension`, `apiBase`, `dashboardVersion`, `apiVersion` | the registration, the server's URL, versions |

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
};
```

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
    },
});
```

The output (`dist/extension.js`, `dist/extension.css`) is what the plugin serves as `entry` and `styles`. React and
the kit are bundled in: the extension does not depend on the dashboard's versions of them.

A complete example is in [example/](example/) (`npm run build:example -w kit` in this repository).
