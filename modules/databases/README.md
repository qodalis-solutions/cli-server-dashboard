# @qodalis/cli-dashboard-module-databases

The databases page of the Qodalis CLI server dashboard, a [dashboard extension](../../docs/extensions.md) built with
the kit. The servers' databases plugins (Node `@qodalis/cli-server-plugin-databases`, .NET
`Qodalis.Cli.Plugin.Databases`, Python `qodalis-cli-server-plugin-databases`) embed its build and register it
(id `databases`, group Data, permission `databases:read`); hosts install nothing else.

- **The databases**: dialect, size, applied / pending / problem migrations and the last run.
- **A database's overview**: size (data, indexes, log), connections (active, open, max), transactions and queries per
  second sampled every 10 seconds while the page is open (a chart of the last 10 minutes; server-wide counters are
  marked), cache hit ratio, version and uptime, and the largest tables. Metrics the database refuses are listed as
  not available.
- **Its migrations**: by source with their status (applied, pending, changed, missing, failed), applied at/by and
  duration. With `databases:migrate`: Apply pending, Migrate to here, Roll back to here, Roll back everything; each
  opens a confirmation with the SQL the run executes (the API's dry run), and a force option while migrations
  changed or went missing.
- **Its runs**: direction, status, trigger (startup, dashboard/API, terminal, MCP), who, duration, and the details of
  each (what it applied, the error).
- Live: reloads on the `databases:migration-run` server event. Texts in the dashboard's 11 languages.

```bash
npm run build -w modules/databases   # dist/extension.js, dist/extension.css
```

The servers' packages copy `dist/` at build time from the npm package or, in a workspace checkout, from a sibling
`../cli-server-dashboard/modules/databases/dist`, as they do with the dashboard.
