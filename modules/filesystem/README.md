# @qodalis/cli-dashboard-module-filesystem

The filesystem page of the Qodalis CLI server dashboard, a [dashboard extension](../../docs/extensions.md) built with
the kit. The servers' filesystem plugins embed its build and register it (id `filesystem`, group Data, permission
`files:read`, served at `/qcli/modules/filesystem`); hosts install nothing else.

- Browse the server's files folder by folder (the folder is in the page's URL, `?path=`), read a file in a panel,
  upload into the folder shown, download, create folders and delete files or folders (confirmed).
- Live: lists the folder again when the server reports a change in it (`fs:changed`). Texts in the dashboard's 11
  languages.

```bash
npm run build -w modules/filesystem   # dist/extension.js, dist/extension.css
```

The servers' packages copy `dist/` at build time from the npm package or, in a workspace checkout, from a sibling
`../cli-server-dashboard/modules/filesystem/dist`.
