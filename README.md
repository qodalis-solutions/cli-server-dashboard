# @qodalis/cli-server-dashboard

Admin dashboard SPA for [Qodalis CLI](https://github.com/qodalis-solutions/web-cli) servers. Provides a web-based administration interface for monitoring and managing CLI server instances.

![Dashboard Overview](https://raw.githubusercontent.com/qodalis-solutions/cli-server-dashboard/main/docs/dashboard-overview.png)

## Features

- **Overview** — Server health, uptime, memory usage, active connections
- **Commands** — Browse and inspect registered command processors
- **Plugins** — View installed plugins, toggle modules, inspect registered commands
- **Terminal** — Embedded CLI terminal powered by `@qodalis/react-cli`
- **Jobs** — Monitor background job status, history, and scheduling
- **Filesystem** — Browse and manage the virtual filesystem
- **Events** — Real-time WebSocket event stream and connected client monitoring
- **Config** — View and update server configuration (structured sections with mutable/read-only settings)
- **Logs** — Live log viewer with level filtering and search

## Languages

The dashboard is available in English, Español, Français, Deutsch, Português, Italiano, 日本語, 한국어, 中文 and Русский.
It starts in the browser's language (English otherwise); the picker under **Sign out** changes it and the choice is
remembered per browser. Dates, numbers and relative times follow the selected language. The embedded terminal loads the CLI language packs
(`@qodalis/cli-lang-*`) and switches with the dashboard; text the packs do not cover yet stays in English.

Adding or changing text:

- Messages live in `src/i18n/messages/<area>.ts` (one file per page/area, all languages in one place). English is the
  source; a missing translation falls back to English.
- Use them with `const { t } = useI18n()` and keys like `t('jobs.title')`. Keys are type-checked, so a typo or a removed
  key fails the build.
- Placeholders: `'{count} entries shown'` → `t('logs.shown', { count })`. Plurals: define `key_one` / `key_other`
  (plus `key_few` / `key_many` where the language needs them) and pass `count`.
- Dates and times: `formatDate`, `formatRelative`, `formatNumber` from the same hook.
- New language: add it to `src/i18n/locales.ts` and add its block to each message file.

## Installation

```bash
npm install @qodalis/cli-server-dashboard
```

## Usage

### Node.js Server

```typescript
import { createCliServer } from '@qodalis/cli-server-node';
import { CliAdminBuilder } from '@qodalis/cli-server-plugin-admin';

const { app, registry, builder, eventSocketManager } = createCliServer({ ... });

const adminPlugin = new CliAdminBuilder()
    .setCredentials('admin', 'secure-password')
    .build({ registry, eventSocketManager, builder, broadcastFn: (msg) => { ... } });

app.use('/api/v1/qcli', adminPlugin.router);
app.use('/qcli/admin', adminPlugin.dashboardRouter);
```

The Node server automatically resolves the dashboard from `node_modules/@qodalis/cli-server-dashboard/dist`.

### .NET Server

```csharp
builder.Services.AddCli(cli => {
    cli.AddAdmin();
});

app.UseQodalisAdmin();
```

### Python Server

```python
from qodalis_cli_admin import CliAdminBuilder

admin = CliAdminBuilder() \
    .set_credentials("admin", "secure-password") \
    .build(registry=registry, event_socket_manager=event_socket_manager, builder=builder)

app.include_router(admin.router, prefix="/api/v1/qcli")
app.mount("/qcli/admin", admin.dashboard_app)
```

## Configuration

Credentials and JWT settings can be configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `QCLI_ADMIN_USERNAME` | `admin` | Admin login username |
| `QCLI_ADMIN_PASSWORD` | `admin` | Admin login password |
| `QCLI_ADMIN_JWT_SECRET` | auto-generated | Secret for signing JWT tokens |

> **Warning:** The server logs a warning at startup if default credentials are in use. Always set custom credentials for any non-local deployment.

## Security

- **Servers with the users plugin** (protected servers): sign in with a server account that holds `admin:access`
  (members of `admin` do; grant it to another group with `groupmod ops --grant=admin:access`). The dashboard token is a
  server session, so **Sign out** ends it on the server (`DELETE /api/v1/qcli/sessions/current`) and revoking the session
  elsewhere (`session-kick`, disabling the user) signs the dashboard out on its next request.
- **WebSockets** (events, logs, terminal) never carry the bearer token in the URL on protected servers: each connection
  first gets a single-use ticket from `POST /api/v1/qcli/sessions/ws-ticket`. Servers without the users plugin keep
  accepting the legacy `?token=` parameter.
- The dashboard is served from the server's own origin, which every server accepts for its Origin, CSRF and WebSocket
  checks; no CORS configuration is needed for it.
- The embedded **Terminal** signs requests with the dashboard session. `ssh` from it follows the server's remote shell
  policy (`shell:execute`, shell token, or disabled); see the server READMEs.
- A failing page or panel shows an error in its own area (with **Retry**) instead of taking down the whole dashboard.

## Admin API

All endpoints are mounted at `/api/v1/qcli` and require JWT authentication (except login).

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/login` | POST | Authenticate with username/password, returns JWT |
| `/auth/me` | GET | Current user info |
| `/status` | GET | Server health, uptime, memory, connections, features |
| `/config` | GET | Structured configuration sections |
| `/config` | PUT | Update mutable settings |
| `/plugins` | GET | List registered modules with processors |
| `/plugins/:id/toggle` | POST | Enable/disable a module |
| `/logs` | GET | Query logs (supports `level`, `search`, `limit`, `offset`) |
| `/ws/clients` | GET | Active WebSocket connections |

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

`npm run dev` and `npm run build` first copy the CLI's optional WebAssembly accelerator from `node_modules/@qodalis/cli`
to `public/assets/wasm/` (`scripts/copy-wasm.mjs`, git-ignored); the terminal falls back to JavaScript without it.

### Deploying to servers

Each server bundles the dashboard into its admin plugin at build time. The copy step prefers a sibling checkout of this
repo (`../cli-server-dashboard/dist`, so run `npm run build` here first) and otherwise uses the published
`@qodalis/cli-server-dashboard` package:

| Server | When it is copied | Served from |
|--------|-------------------|-------------|
| **Node.js** | `npm run build` in `plugins/admin` (`prebuild` runs `scripts/copy-dashboard.js`) | `plugins/admin/dashboard/` |
| **Python** | `python scripts/copy_dashboard.py` in `plugins/admin` (also resolved at runtime from `node_modules` or the sibling repo) | `plugins/admin/qodalis_cli_admin/dashboard/` |
| **.NET** | `dotnet build` of `Qodalis.Cli.Plugin.Admin` (runs `npm install` itself when neither source exists) | embedded in the plugin assembly (staged in `wwwroot/admin/`) |

The servers' Docker images install the npm package, so they ship the published dashboard version; refresh the admin
plugin's lockfile after publishing a new dashboard.

## Tech Stack

- React 18 + TypeScript
- Vite (base path: `/qcli/admin/`)
- Tailwind CSS (dark theme)
- React Router

## API Compatibility

The dashboard works with all three Qodalis CLI server implementations:

| Server | Package | Port |
|--------|---------|------|
| Node.js | [@qodalis/cli-server-node](https://github.com/qodalis-solutions/cli-server-node) | 8047 |
| .NET | [Qodalis.Cli](https://github.com/qodalis-solutions/cli-server-dotnet) | 8046 |
| Python | [qodalis-cli](https://github.com/qodalis-solutions/cli-server-python) | 8048 |

## License

MIT
