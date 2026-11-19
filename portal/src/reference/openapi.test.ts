// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exampleOf, groupByTag, loadDocument, operationId, resolveRef, resolveSchema, serverUrlOf, type OpenApiDocument } from './openapi';
import { OPENAPI, json } from '../test/fixtures';

afterEach(() => vi.unstubAllGlobals());

const doc = OPENAPI as unknown as OpenApiDocument;

describe('groupByTag', () => {
  it('groups by tag in document order with Other last', () => {
    const groups = groupByTag(doc);

    expect(groups.map(g => g.tag)).toEqual(['Rates', 'Alerts', 'Other']);
    expect(groups[0].description).toBe('Exchange rates');
    expect(groups[0].operations.map(o => `${o.method} ${o.path}`)).toEqual(['get /v1/rates/{country}']);
    expect(groups[2].operations.map(o => `${o.method} ${o.path}`)).toEqual(['get /health']);
  });

  it('without declared tags: the order operations use them in; undeclared tags after declared ones', () => {
    const paths = {
      '/b': { get: { tags: ['Beta'], responses: {} } },
      '/a': { post: { tags: ['Alpha', 'Beta'], responses: {} }, get: { responses: {} } },
      '/c': { get: { tags: ['Gamma'], responses: {} } },
    };
    expect(groupByTag({ openapi: '3.1.0', paths }).map(g => g.tag)).toEqual(['Beta', 'Alpha', 'Gamma', 'Other']);
    expect(groupByTag({ openapi: '3.1.0', tags: [{ name: 'Gamma' }], paths }).map(g => g.tag)).toEqual(['Gamma', 'Beta', 'Alpha', 'Other']);
    // An operation with two tags is listed under both
    expect(groupByTag({ openapi: '3.1.0', paths }).find(g => g.tag === 'Beta')!.operations.map(o => o.path)).toEqual(['/b', '/a']);
  });

  it('reads the permission, host-token flag, code samples and merged path-level parameters', () => {
    const op = groupByTag(doc)[0].operations[0];
    expect(op.permissions).toEqual(['rates:read']);
    expect(op.hostTokenOnly).toBe(true);
    expect(op.parameters.map(p => `${p.in}:${p.name}:${p.required}`)).toEqual(['path:country:true', 'query:currency:false']);
    expect(op.parameters[0].example).toBe('md');

    const withPathLevel = groupByTag({
      openapi: '3.1.0',
      paths: {
        '/x/{id}': {
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'v', in: 'query' }],
          get: { parameters: [{ name: 'v', in: 'query', description: 'own' }], 'x-codeSamples': [{ lang: 'Ruby', source: 'r' }], responses: {} },
        },
      },
    })[0].operations[0];
    expect(withPathLevel.parameters.map(p => `${p.name}:${p.description ?? ''}`)).toEqual(['id:', 'v:own']);
    expect(withPathLevel.codeSamples).toEqual([{ lang: 'Ruby', source: 'r' }]);
  });

  it('x-required-permission may be a string or a list of strings', () => {
    const ops = groupByTag({
      openapi: '3.1.0',
      paths: {
        '/a': { get: { 'x-required-permission': ['rates:read', 'alerts:write', 3], responses: {} } },
        '/b': { get: { 'x-required-permission': 'rates:read', responses: {} } },
        '/c': { get: { 'x-required-permission': { no: 1 }, responses: {} } },
      },
    })[0].operations;
    expect(ops.map(o => o.permissions)).toEqual([['rates:read', 'alerts:write'], ['rates:read'], []]);
  });

  it('operationId: the document\'s, else method and path', () => {
    const [rates, alerts, other] = groupByTag(doc);
    expect(operationId(rates.operations[0])).toBe('getRates');
    expect(operationId(alerts.operations[0])).toBe('post-v1-alerts');
    expect(operationId(other.operations[0])).toBe('get-health');
  });
});

describe('$ref', () => {
  const refDoc: OpenApiDocument = {
    openapi: '3.1.0',
    components: {
      parameters: { Country: { name: 'country', in: 'path', required: true, schema: { $ref: '#/components/schemas/Code' } } },
      requestBodies: { Alert: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Node' } } } } },
      responses: { Rates: { description: 'The rates', content: { 'application/json': { schema: { $ref: '#/components/schemas/Code' } } } } },
      schemas: {
        Code: { type: 'string', example: 'md' },
        Alias: { $ref: '#/components/schemas/Code' },
        Loop: { $ref: '#/components/schemas/Loop2' },
        Loop2: { $ref: '#/components/schemas/Loop' },
        Node: {
          type: 'object',
          properties: { name: { type: 'string', example: 'n' }, children: { type: 'array', items: { $ref: '#/components/schemas/Node' } } },
        },
      },
    },
    paths: {
      '/r/{country}': {
        post: {
          parameters: [{ $ref: '#/components/parameters/Country' }],
          requestBody: { $ref: '#/components/requestBodies/Alert' },
          responses: { 200: { $ref: '#/components/responses/Rates' } },
        },
      },
    },
  };

  it('resolves $ref in parameters, bodies and responses, and stops on cycles', () => {
    const op = groupByTag(refDoc)[0].operations[0];
    expect(op.parameters[0].name).toBe('country');
    expect(op.parameters[0].example).toBe('md');
    expect(op.requestBody?.content['application/json'].schema).toEqual({ $ref: '#/components/schemas/Node' });
    expect(op.responses['200'].description).toBe('The rates');

    expect(resolveRef(refDoc, { $ref: '#/components/schemas/Alias' })).toEqual({ type: 'string', example: 'md' });
    // A chain that loops resolves to nothing instead of spinning
    expect(resolveRef(refDoc, { $ref: '#/components/schemas/Loop' })).toBeUndefined();
    expect(resolveRef(refDoc, { $ref: '#/components/schemas/Missing' })).toBeUndefined();

    const node = resolveSchema(refDoc, { $ref: '#/components/schemas/Node' }, []);
    expect(node.name).toBe('Node');
    expect(node.schema?.type).toBe('object');
    const again = resolveSchema(refDoc, { $ref: '#/components/schemas/Node' }, node.seen);
    expect(again.circular).toBe(true);

    // A recursive schema's example stops at the cycle
    expect(exampleOf(refDoc, { $ref: '#/components/schemas/Node' })).toEqual({ name: 'n', children: [] });
    expect(op.bodyExample).toBe('{\n  "name": "n",\n  "children": []\n}');
  });

  it('a malformed pointer resolves to nothing instead of throwing', () => {
    expect(resolveRef(refDoc, { $ref: '#/components/schemas/%E0' })).toBeUndefined();
  });

  it('decodes JSON pointer escapes', () => {
    const d: OpenApiDocument = { openapi: '3.1.0', components: { schemas: { 'a/b~c': { type: 'integer' } } } };
    expect(resolveRef(d, { $ref: '#/components/schemas/a~1b~0c' })).toEqual({ type: 'integer' });
  });
});

describe('examples', () => {
  it('prefers the media example, then examples, then the schema', () => {
    const base = { openapi: '3.1.0' } as OpenApiDocument;
    const media = (m: object) => groupByTag({
      ...base,
      paths: { '/x': { post: { requestBody: { content: { 'application/json': m } }, responses: {} } } },
    })[0].operations[0].bodyExample;

    expect(media({ example: { a: 1 }, schema: { type: 'object' } })).toBe('{\n  "a": 1\n}');
    expect(media({ examples: { one: { value: { b: 2 } } } })).toBe('{\n  "b": 2\n}');
    expect(media({ schema: { type: 'object', properties: { n: { type: 'integer' }, s: { type: 'string', format: 'date' }, e: { enum: ['x', 'y'] }, f: { type: 'boolean' } } } }))
      .toBe('{\n  "n": 0,\n  "s": "2026-01-01",\n  "e": "x",\n  "f": true\n}');
    expect(media({ schema: { allOf: [{ properties: { a: { type: 'string', example: 'A' } } }, { properties: { b: { type: 'number', default: 2 } } }] } }))
      .toBe('{\n  "a": "A",\n  "b": 2\n}');
  });
});

describe('servers and loading', () => {
  it('servers missing → the document\'s own origin', () => {
    expect(serverUrlOf({ openapi: '3.1.0' }, 'https://docs.example.com/qcli/api/openapi.json')).toBe('https://docs.example.com');
    expect(serverUrlOf({ openapi: '3.1.0', servers: [] }, 'https://docs.example.com/qcli/api/openapi.json')).toBe('https://docs.example.com');
  });

  it('a server URL that is not http(s) is not used', () => {
    expect(serverUrlOf({ openapi: '3.1.0', servers: [{ url: 'javascript:alert(1)' }] }, 'https://x.example.com/openapi.json')).toBe('https://x.example.com');
    expect(serverUrlOf({ openapi: '3.1.0', servers: [{ url: 'ftp://files.example.com' }] }, 'https://x.example.com/openapi.json')).toBe('https://x.example.com');
  });

  it('servers: the first one, relative ones against the document, variables filled with their defaults', () => {
    expect(serverUrlOf(doc, 'https://x.example.com/openapi.json')).toBe('https://api.example.com');
    expect(serverUrlOf({ openapi: '3.1.0', servers: [{ url: '/api/' }] }, 'https://x.example.com/qcli/api/openapi.json')).toBe('https://x.example.com/api');
    expect(serverUrlOf(
      { openapi: '3.1.0', servers: [{ url: 'https://{region}.example.com/v{v}', variables: { region: { default: 'eu' }, v: { default: '2' } } }] },
      'https://x.example.com/openapi.json',
    )).toBe('https://eu.example.com/v2');
  });

  it('loadDocument fetches the document; a non-document answer is an error', async () => {
    const fetchMock = vi.fn(async () => json(OPENAPI));
    vi.stubGlobal('fetch', fetchMock);
    expect((await loadDocument('/qcli/api/openapi.json')).info?.title).toBe('RateBell public API');
    expect(fetchMock.mock.calls[0][0]).toBe('/qcli/api/openapi.json');

    vi.stubGlobal('fetch', vi.fn(async () => json(['not', 'a', 'document'])));
    await expect(loadDocument('/qcli/api/openapi.json')).rejects.toThrow('not an OpenAPI document');
  });
});
