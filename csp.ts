import type { Plugin } from 'vite';

/**
 * The dashboard's Content-Security-Policy, as directive -> sources.
 *
 * Plugins' pages (extensions, `/qcli/modules/...`) run inside the dashboard with the signed-in admin's token, so the
 * policy keeps every request on the dashboard's own origin or a few read-only package hosts: a plugin cannot send the
 * token or any data anywhere it could be read back (fetch, WebSocket, images, forms, frames). WebSockets to the same host are covered by `'self'` (CSP Level 3).
 *
 * - `'wasm-unsafe-eval'`: the terminal's WebAssembly module (`@qodalis/cli/wasm`); no `'unsafe-eval'`.
 * - `style-src 'unsafe-inline'`: React `style` attributes, xterm.js, CodeMirror and the CLI inject styles.
 * - `img-src data:`: branding icons given as `data:image` URLs; `blob:` is not needed (downloads are navigations).
 *
 * - `PACKAGE_SOURCES`: the embedded terminal's `pkg add` asks the marketplace and the npm registry and loads browser
 *   bundles from unpkg or jsDelivr (marketplace icons are on jsDelivr too). They are read-only public hosts, so
 *   allowing them lets no page send data anywhere it could be read back.
 *
 * `frame-ancestors` is ignored in a `<meta>` policy: a server that wants to forbid framing sends it as a header.
 */
/** Read-only public hosts of the terminal's packages (`pkg add`): the marketplace, the npm registry and the CDNs. */
export const PACKAGE_SOURCES = [
  'https://plugins.qodalis.com',
  'https://registry.npmjs.org',
  'https://unpkg.com',
  'https://cdn.jsdelivr.net',
] as const;

export const CSP_DIRECTIVES: Readonly<Record<string, readonly string[]>> = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'wasm-unsafe-eval'", 'https://unpkg.com', 'https://cdn.jsdelivr.net'],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'https://cdn.jsdelivr.net'],
  'font-src': ["'self'"],
  'connect-src': ["'self'", ...PACKAGE_SOURCES],
  'worker-src': ["'self'"],
  'frame-src': ["'none'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
};

/** The policy as one header/meta value. */
export function contentSecurityPolicy(directives: Readonly<Record<string, readonly string[]>> = CSP_DIRECTIVES): string {
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ');
}

/**
 * Adds the policy to index.html as `<meta http-equiv="Content-Security-Policy">`, in production builds only:
 * Vite's dev server injects inline scripts and connects to its own HMR socket, which the policy would block.
 */
export function cspPlugin(policy: string = contentSecurityPolicy()): Plugin {
  return {
    name: 'qcli-dashboard-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: html => {
        // Right after <meta charset> (which must come first), before any script or stylesheet
        const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}" />`;
        const charset = /<meta charset=[^>]*>/i;
        return charset.test(html)
          ? html.replace(charset, match => `${match}\n  ${meta}`)
          : html.replace(/<head>/i, match => `${match}\n  ${meta}`);
      },
    },
  };
}
