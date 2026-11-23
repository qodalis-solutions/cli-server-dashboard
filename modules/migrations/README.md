# @qodalis/cli-dashboard-module-migrations

The migrations page of the Qodalis CLI server dashboard, a [dashboard extension](../../docs/extensions.md) built with
the kit. The servers' migrations plugins (Node `@qodalis/cli-server-plugin-migrations`, .NET
`Qodalis.Cli.Plugin.Migrations`, Python `qodalis-cli-server-plugin-migrations`) embed its build and register it
(id `migrations`, group Data, permission `migrations:read`); hosts install nothing else.

- **Databases**: applied, pending and problem counts, the last run (status, when, who); a database that cannot be read
  shows its error.
- **A database**: its migrations by source with their status (applied, pending, changed, missing, failed), applied
  at/by and duration. With `migrations:run`: Apply pending, Migrate to here, Roll back to here, Roll back everything;
  each opens a confirmation with the SQL the run executes (the API's dry run), and a force option while migrations
  changed or are missing.
- **Runs**: the history with direction, status, trigger (startup, dashboard/API, terminal, MCP), who and duration; a run
  shows what it applied, each migration's duration, and the error.
- Live: reloads on the `migrations:run` server event. Texts in the dashboard's 11 languages.

```bash
npm run build -w modules/migrations   # dist/extension.js, dist/extension.css
```

The package publishes `dist/` (`exports`: `./extension.js`, `./extension.css`). The servers copy it at build time,
preferring a sibling `../cli-server-dashboard/modules/migrations/dist`, as they do with the dashboard.
