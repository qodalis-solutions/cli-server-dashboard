# @qodalis/cli-server-portal

The developer portal of the Qodalis CLI servers: a prebuilt static site that shows a host application's **guides**
(markdown pages from the docs plugin) and its **API reference** (from the public-api plugin's OpenAPI document), in one
navigation, light and dark, on desktops and phones.

The .NET, Node.js and Python servers embed it through their **portal** plugin and serve it at one mount
(`/qcli/portal` by default, `/` allowed). The host's name, logo, colours and footer links come from `portal.json` at
run time, so one build serves every host.

- **Guides:** the docs plugin's pages, grouped and ordered as the server lists them; the `index` page is the home
  page. Markdown is rendered safely: raw HTML is not rendered, link and image targets are filtered (http(s), mailto,
  relative), relative links (`auth`, `./auth.md#section`) stay inside the portal, fenced code is highlighted and has a
  copy button, headings get anchors and an "On this page" list.
- **API reference:** an overview (description, base URL, authentication, the tags) and a page per tag listing its
  operations: method and path, the required permission (`x-required-permission`) and host-token flag
  (`x-host-token-only`), parameters, request body and response schemas as collapsible trees (`$ref`s resolved,
  recursive types stopped), code samples in cURL, JavaScript, Python, C#, PHP, Go and Java (a host's own
  `x-codeSamples` replace the generated one of their language and add tabs for others), a response example and
  **Try it**.
- **Try it** sends the request with a token the reader pastes. The token is held in memory only, for the open tab
  (never in `localStorage`, `sessionStorage`, a cookie or the URL); requests go without cookies (`credentials:
  'omit'`). The API must allow the portal's origin (CORS) when it runs on another origin. Samples always show the
  placeholder `YOUR_TOKEN`.
- No analytics, no external fonts or scripts: everything is in `dist/`.

## What the server serves (`portal.json`)

The site fetches `portal.json` next to its `index.html`:

```json
{
  "name": "Documentation",
  "logo": null,
  "theme": { "mode": "system", "dark": {}, "light": {} },
  "footerLinks": [ { "label": "Terms", "url": "https://example.com/terms" } ],
  "docs": { "title": "Guides", "pages": "/qcli/docs/pages" },
  "api": { "title": "API reference", "openapi": "/qcli/api/openapi.json", "swagger": "/qcli/api/swagger" }
}
```

- `name` is shown in the header and the page titles; `logo` (an http(s) URL, a root-relative path or a
  `data:image/…;base64` URL, else the default icon) beside it.
- `theme` has the shape of the dashboard's `theme.json` without `branding`: `mode` `dark`, `light` or `system` (the
  default), and `dark`/`light` maps of the dashboard's 21 colour tokens holding only the values set. Readers can switch
  the scheme with the header's toggle (remembered in this browser under `qcli_portal_theme`).
- `docs` and `api` are null when that plugin was not given to the portal: with only the guides there is no API
  entry; with only the API the home page opens the reference; with neither the site shows "Nothing published yet".
- The guides come from `GET <docs.pages>` (`[{ slug, title, group, order }]`, in page order) and
  `GET <docs.pages>/<slug>` (`{ slug, title, group, order, markdown }`, 404 for an unknown page); the reference from
  `GET <api.openapi>`, whose first `servers` entry is the base URL of the samples and of Try it (the document's own
  origin when it has none).

## How a server embeds it

The servers serve `dist/` from a sibling checkout of this repository (`../cli-server-dashboard/portal/dist`, so run
`npm run build -w portal` first) and otherwise from this npm package (`node_modules/@qodalis/cli-server-portal/dist`).
They answer only the site's own paths below the mount, GET and HEAD:

| Path below the mount | Answer |
| --- | --- |
| `` (the mount), `/`, `/guides/<slug>`, `/reference`, `/reference/<tag>` | `index.html`, `Cache-Control: no-cache` |
| `/portal.json` | the JSON above, `Cache-Control: no-cache` |
| `/assets/<file>`, `/favicon.svg` | the file (`/assets/` cached for a year: the names carry a hash) |

**`<base href>`.** The site is built with relative asset URLs and its `index.html` has exactly one
`<base href="/" />`. A server replaces it with the mount, `<base href="/developers/" />` for a portal at
`/developers` (`/` for a root mount). The router's basename, the assets and `portal.json` all resolve below it, so the
same build works at any path.

## Development

From the repository root (an npm workspace; the dashboard stays at the root):

| Command | What it does |
| --- | --- |
| `npm install` | Install both apps' dependencies |
| `npm test -w portal` | Tests (Vitest, Testing Library, jsdom) |
| `npm run build -w portal` | Type-check and build into `portal/dist/` |
| `npm run lint` | ESLint for the dashboard and the portal |

The portal imports the dashboard's theme (`../src/theme`) and self-contained components (`Badge`, drawer helpers,
`useMediaQuery`) through the `@dashboard` alias, and uses the same Tailwind colour tokens, so the two look like one
family. Its own texts are English.
