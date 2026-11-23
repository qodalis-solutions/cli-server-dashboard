# @qodalis/cli-dashboard-module-audit

The audit page of the Qodalis CLI server dashboard, a [dashboard extension](../../docs/extensions.md) built with the
kit. The servers' audit plugins (Node `@qodalis/cli-server-plugin-audit`, .NET and Python alike) embed its build and
register it (id `audit`, group Operations, permission `audit:read`, `search: "/?q="`); hosts install nothing else.

- **The audit log**: filters (search, event, actor, user, time range) kept in the URL, paged by the server, with
  each event's details.
- **Command palette**: "Search Audit for …" opens the log filtered.
- Live on the audit server events. Texts in the dashboard's 11 languages.

```bash
npm run build -w modules/audit   # dist/extension.js, dist/extension.css
```

The servers' packages copy `dist/` at build time from the npm package or, in a workspace checkout, from a sibling
`../cli-server-dashboard/modules/audit/dist`.
