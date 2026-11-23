# @qodalis/cli-dashboard-module-jobs

The jobs page of the Qodalis CLI server dashboard, a [dashboard extension](../../docs/extensions.md) built with the
kit. The servers' jobs plugins (Node `@qodalis/cli-server-plugin-jobs`, .NET and Python alike) embed its build and
register it (id `jobs`, group Operations, permission `jobs:read`, `widgets: ["overview", "palette"]`, `search: "/?q="`);
hosts install nothing else.

- **The jobs**: filters (search, status, group, tags) kept in the URL, the runs of the last hour, day or week as a
  chart, each job's last runs, its actions (trigger, pause, resume, stop, cancel) and the history pruning job.
- **Recent runs**: across jobs, paged by the server, with each run's details and logs.
- **A job** (`/x/jobs/<id>`): its schedule and options (editable), history retention, run history, statistics and actions.
- **Overview**: an *Active jobs* figure, the last 24 hours' runs as a chart (a column opens the jobs at that hour),
  and failing jobs in *Needs attention*.
- **Command palette**: every job, to jump to it; "Search Jobs for …" opens the list filtered.
- Live on the `job:*` server events. Texts in the dashboard's 11 languages.

```bash
npm run build -w modules/jobs   # dist/extension.js, dist/extension.css
```

The servers' packages copy `dist/` at build time from the npm package or, in a workspace checkout, from a sibling
`../cli-server-dashboard/modules/jobs/dist`.
