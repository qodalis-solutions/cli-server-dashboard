import { vi } from 'vitest';

/** The bodies of the cross-server contract (C8 portal.json, C9 docs pages), as the servers answer them. */

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

export const PORTAL_CONFIG = {
  name: 'RateBell API',
  logo: '/logo.svg',
  theme: { mode: 'system', dark: { primary: '#ff5500' }, light: { primary: '#cc4400' } },
  footerLinks: [
    { label: 'Terms', url: 'https://example.com/terms' },
    { label: 'Status', url: '/status' },
  ],
  docs: { title: 'Guides', pages: '/qcli/docs/pages' },
  api: { title: 'API reference', openapi: '/qcli/api/openapi.json', swagger: '/qcli/api/swagger' },
};

export const PAGES = [
  { slug: 'limits', title: 'Limits and quotas', group: 'Guides', order: 0 },
  { slug: 'index', title: 'Welcome to RateBell API', group: 'Guides', order: 1 },
  { slug: 'auth', title: 'Authentication', group: 'Basics', order: 2 },
];

export const PAGE_BODIES: Record<string, string> = {
  limits: '# Limits and quotas\nRequests per day.\n',
  index: 'Call http://localhost/v1/rates with help@ratebell.app and {{unknown}}.\n',
  auth: '# Ignored heading\nSend `Authorization: Bearer <token>`.\n',
};

/** A small public document: two tags, one untagged operation, a $ref'd schema. */
export const OPENAPI = {
  openapi: '3.1.0',
  info: { title: 'RateBell public API', version: '1.0.0', description: 'Exchange rates of every bank.' },
  servers: [{ url: 'https://api.example.com' }],
  components: {
    securitySchemes: {
      qcliToken: {
        type: 'http', scheme: 'bearer', bearerFormat: 'qcli_pat',
        description: 'API token (qcli_pat_…), sent as Authorization: Bearer <token>',
      },
    },
    schemas: {
      Rate: {
        type: 'object',
        required: ['currency', 'buy'],
        properties: {
          currency: { type: 'string', example: 'EUR', description: 'ISO 4217 code' },
          buy: { type: 'number', example: 19.45 },
          sell: { type: 'number', example: 19.6 },
        },
      },
      Alert: {
        type: 'object',
        properties: { currency: { type: 'string', example: 'EUR' }, above: { type: 'number', example: 20 } },
      },
    },
  },
  security: [{ qcliToken: [] }],
  tags: [{ name: 'Rates', description: 'Exchange rates' }, { name: 'Alerts' }],
  paths: {
    '/v1/rates/{country}': {
      get: {
        tags: ['Rates'],
        operationId: 'getRates',
        summary: 'Rates of a country',
        description: 'Every bank of the country, latest rates.',
        'x-required-permission': 'rates:read',
        'x-host-token-only': true,
        parameters: [
          { name: 'country', in: 'path', required: true, schema: { type: 'string' }, example: 'md' },
          { name: 'currency', in: 'query', schema: { type: 'string' }, description: 'One currency only' },
        ],
        responses: {
          200: {
            description: 'The rates',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Rate' } } } },
          },
          429: { description: 'Quota exceeded' },
        },
      },
    },
    '/v1/alerts': {
      post: {
        tags: ['Alerts'],
        summary: 'Create an alert',
        'x-required-permission': 'alerts:write',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Alert' } } },
        },
        responses: { 201: { description: 'Created' } },
      },
    },
    '/health': {
      get: { summary: 'Health', security: [], responses: { 200: { description: 'OK' } } },
    },
  },
};

export interface PortalFakeOptions {
  config?: Record<string, unknown> | 'error';
  pages?: typeof PAGES;
  bodies?: Record<string, string>;
  openapi?: unknown;
}

/**
 * Stubs `fetch` with the server's answers: portal.json (relative to the base), the docs pages and the OpenAPI
 * document. Anything else answers 404 `{ "error": "not found" }`.
 */
export function installPortalFetch(options: PortalFakeOptions = {}) {
  const config = options.config ?? PORTAL_CONFIG;
  const pages = options.pages ?? PAGES;
  const bodies = options.bodies ?? PAGE_BODIES;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url, 'http://localhost/').pathname;
    if (path.endsWith('/portal.json')) {
      return config === 'error' ? new Response('boom', { status: 500 }) : json(config);
    }
    if (path === '/qcli/docs/pages') return json(pages);
    const page = /^\/qcli\/docs\/pages\/([^/]+)$/.exec(path);
    if (page) {
      const summary = pages.find(p => p.slug === decodeURIComponent(page[1]));
      return summary ? json({ ...summary, markdown: bodies[summary.slug] ?? '' }) : json({ error: 'page not found' }, 404);
    }
    if (path === '/qcli/api/openapi.json') return json(options.openapi ?? OPENAPI);
    return json({ error: 'not found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Points `document.baseURI` at a mount, as the servers' `<base href>` rewrite does. */
export function setBase(href: string): void {
  document.head.querySelectorAll('base').forEach(b => b.remove());
  const base = document.createElement('base');
  base.setAttribute('href', href);
  document.head.prepend(base);
}
