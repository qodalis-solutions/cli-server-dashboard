import { describe, expect, it } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CSP_DIRECTIVES, PACKAGE_SOURCES, contentSecurityPolicy, cspPlugin } from '../csp';

/** The directives of a policy string, as name -> sources. */
function parse(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy.split(';').map(part => part.trim()).filter(Boolean).map(part => {
      const [name, ...sources] = part.split(/\s+/);
      return [name, sources];
    }),
  );
}

function expectStrict(policy: string) {
  const directives = parse(policy);
  expect(directives['default-src']).toEqual(["'self'"]);
  expect(directives['script-src']).toEqual(["'self'", "'wasm-unsafe-eval'", 'https://unpkg.com', 'https://cdn.jsdelivr.net']);
  expect(directives['style-src']).toEqual(["'self'", "'unsafe-inline'"]);
  expect(directives['img-src']).toEqual(["'self'", 'data:', 'https://cdn.jsdelivr.net']);
  expect(directives['connect-src']).toEqual(["'self'", ...PACKAGE_SOURCES]);
  expect(directives['form-action']).toEqual(["'self'"]);
  expect(directives['base-uri']).toEqual(["'self'"]);
  expect(directives['object-src']).toEqual(["'none'"]);
  expect(directives['frame-src']).toEqual(["'none'"]);
  expect(policy).not.toContain("'unsafe-eval'");
  // Other origins only the read-only package hosts, https only, and no wildcard
  const origins = policy.match(/\b(?:https?|wss?):[^\s;]*/g) ?? [];
  expect(origins.every(origin => (PACKAGE_SOURCES as readonly string[]).includes(origin))).toBe(true);
  expect(policy).not.toMatch(/\*|\bhttp:|\bws:|\bwss:/);
}

describe('Content-Security-Policy', () => {
  it('keeps every request on the dashboard origin', () => {
    expectStrict(contentSecurityPolicy());
    expect(Object.keys(CSP_DIRECTIVES)).not.toContain('frame-ancestors'); // ignored in a meta tag
  });

  it('is added to index.html by a production build, before any script', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'qcli-csp-'))); // /var is /private/var on macOS
    try {
      writeFileSync(join(root, 'index.html'), '<!DOCTYPE html><html><head><meta charset="UTF-8" /><title>t</title></head><body><script type="module" src="./main.js"></script></body></html>');
      writeFileSync(join(root, 'main.js'), 'document.title = "x";');
      await build({ root, logLevel: 'silent', configFile: false, plugins: [cspPlugin()], build: { outDir: join(root, 'dist') } });
      const html = readFileSync(join(root, 'dist', 'index.html'), 'utf8');
      const match = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
      expect(match).not.toBeNull();
      expectStrict(match![1]);
      expect(html.indexOf('<meta charset')).toBeLessThan(html.indexOf('Content-Security-Policy'));
      expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<script'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('is not applied by the dev server', () => {
    expect(cspPlugin().apply).toBe('build');
  });
});
