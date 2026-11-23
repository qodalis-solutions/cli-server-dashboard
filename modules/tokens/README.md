# @qodalis/cli-dashboard-module-tokens

The API tokens page of the Qodalis CLI server dashboard, a [dashboard extension](../../docs/extensions.md) built with
the kit. The servers' users plugins (Node `@qodalis/cli-server-plugin-users`, .NET and Python alike) embed its build
and register it (id `tokens`, group Access); hosts install nothing else.

- **Your tokens** (`qcli_pat_…`), or every user's with `tokens:read`: created, expires, last used, audience,
  permissions and, when the server counts API usage, requests today with the last 30 days.
- **Create** a token with a name, an expiry and a subset of your permissions; the token is shown once.
- **Revoke** own tokens, or any with `tokens:revoke`.
- Texts in the dashboard's 11 languages.

```bash
npm run build -w modules/tokens   # dist/extension.js, dist/extension.css
```

The servers' packages copy `dist/` at build time from the npm package or, in a workspace checkout, from a sibling
`../cli-server-dashboard/modules/tokens/dist`.
