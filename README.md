# @qodalis/cli-server-dashboard

Admin dashboard SPA for [Qodalis CLI](https://github.com/qodalis-solutions/web-cli) servers. Provides a web-based administration interface for monitoring and managing CLI server instances.

![Dashboard Overview](https://raw.githubusercontent.com/qodalis-solutions/cli-server-dashboard/main/docs/dashboard-overview.png)

## Features

- **Overview** — Server health, uptime, memory usage, active connections
- **Commands** — Browse and inspect registered command processors
- **Jobs** — Monitor background job status, history, and scheduling
- **Plugins** — View installed plugins and modules
- **Filesystem** — Browse and manage the virtual filesystem
- **Events** — Real-time WebSocket event stream
- **Config** — View and update server configuration
- **Logs** — Live log viewer with level filtering

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
    .setCredentials('admin', 'admin')
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
    .set_credentials("admin", "admin") \
    .build(registry=registry, event_socket_manager=event_socket_manager, builder=builder)

app.include_router(admin.router, prefix="/api/v1/qcli")
app.mount("/qcli/admin", admin.dashboard_app)
```

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

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
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
