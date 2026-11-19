# Change Log

Notable changes to `@qodalis/cli-server-portal`, the developer portal of the Qodalis CLI servers.

## 1.0.0-beta.26

First release.

- **Guides** from the docs plugin: grouped navigation in the server's order, the `index` page as home, safe markdown
  (GitHub-flavoured: tables, task lists; raw HTML not rendered, unsafe link targets dropped), highlighted code with a
  copy button, heading anchors and an "On this page" list, previous and next guides.
- **API reference** from the public-api plugin's OpenAPI document: an overview (description, base URL,
  authentication, tags, links to the document and Swagger UI) and a page per tag with each operation's method, path,
  permission, host-token flag, parameters, request body and response schemas, and a response example.
- **Code samples** in cURL, JavaScript, Python, C#, PHP, Go and Java, generated from the operation; a host's own
  `x-codeSamples` replace the generated sample of their language and add other languages.
- **Try it** with a pasted token kept in memory only, showing the status, the `X-RateLimit-*` headers and the body.
- **Branding from `portal.json`:** name, logo, the dashboard's colour tokens, footer links; light and dark with a
  reader toggle; a navigation drawer on phones. Works at any mount (`<base href>` rewritten by the server) with only
  the guides, only the reference, or both.
