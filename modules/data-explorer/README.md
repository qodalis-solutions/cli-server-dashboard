# @qodalis/cli-dashboard-module-data-explorer

The data explorer page of the Qodalis CLI server dashboard, a [dashboard extension](../../docs/extensions.md) built
with the kit. The servers' data explorer plugins embed its build and register it (id `data-explorer`, group Data,
permission `data:query`, served at `/qcli/modules/data-explorer`); hosts install nothing else.

- The server's data sources (SQL, MongoDB, Redis, Elasticsearch, ...) with their read-only and export flags; the
  chosen source is in the page's URL (`?source=`).
- A SQL editor (CodeMirror, loaded on demand as its own chunk) in the source's dialect, completing table and column
  names from its schema; a plain text area for the other languages. Templates, the schema panel ("Query this table").
- Results as a table with row count, time and truncation; refusals (permission, rate limit, read-only, object not
  allowed, masked column) explained; the query as the server ran it, editable. Texts in the dashboard's 11 languages.

```bash
npm run build -w modules/data-explorer   # dist/extension.js, dist/extension.css
```

The build is exactly these two files (the SQL editor, imported lazily, is bundled into `extension.js`): the servers
copy and serve `dist/` from the npm package, from the marketplace (which records only these two files) or, in a
workspace checkout, a sibling `../cli-server-dashboard/modules/data-explorer/dist`.
