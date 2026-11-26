import type { Plugin } from 'vite';

/**
 * The dashboard's Content-Security-Policy, as directive -> sources.
 *
 * Plugins' pages (extensions, `/qcli/modules/...`) run inside the dashboard with the signed-in admin's token, so the
 * policy keeps every request on the dashboard's own origin: a plugin cannot send the token or any data elsewhere
 * (fetch, WebSocket, images, forms, frames). WebSockets to the same host are covered by `'self'` (CSP Level 3).
 *
 * - `'wasm-unsafe-eval'`: the terminal's WebAssembly module (`@qodalis/cli/wasm`); no `'unsafe-eval'`.
 * - `style-src 'unsafe-inline'`: React `style` attributes, xterm.js, CodeMirror and the CLI inject styles.
 * - `img-src data:`: branding icons given as `data:image` URLs; `blob:` is not needed (downloads are navigations).
 *
 * `frame-ancestors` is ignored in a `<meta>` policy: a server that wants to forbid framing sends it as a header.
 */
export const CSP_DIRECTIVES: Readonly<Record<string, readonly string[]>> = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'wasm-unsafe-eval'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
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
