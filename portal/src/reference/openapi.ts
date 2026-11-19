import { getJson } from '../guides/GuidesApi';

/**
 * The public OpenAPI document (contract C6), read as far as the reference needs it: operations by tag, parameters,
 * bodies and responses with `$ref` resolved, examples, the permission (`x-required-permission`), the host-token flag
 * (`x-host-token-only`) and the host's own code samples (`x-codeSamples`).
 */

export interface Schema {
  $ref?: string;
  type?: string | string[];
  format?: string;
  title?: string;
  description?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  additionalProperties?: boolean | Schema;
  enum?: unknown[];
  const?: unknown;
  example?: unknown;
  examples?: unknown[] | Record<string, unknown>;
  default?: unknown;
  allOf?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
  nullable?: boolean;
  deprecated?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  [key: string]: unknown;
}

export interface Parameter {
  name: string;
  in: string;
  required: boolean;
  description?: string;
  deprecated?: boolean;
  schema?: Schema;
  /** The parameter's example (its own `example`/`examples`, else its schema's). */
  example?: unknown;
}

export interface MediaType {
  schema?: Schema;
  example?: unknown;
  examples?: Record<string, { value?: unknown; $ref?: string }>;
}

export interface RequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, MediaType>;
}

export interface ResponseObject {
  description?: string;
  content?: Record<string, MediaType>;
}

/** A host's own code sample (`x-codeSamples`), passed through untouched by the servers. */
export interface CodeSample {
  lang: string;
  label?: string;
  source: string;
}

export type SecurityRequirement = Record<string, string[]>;

export interface Operation {
  method: string;
  path: string;
  tags: string[];
  operationId?: string;
  summary?: string;
  description?: string;
  deprecated: boolean;
  parameters: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, ResponseObject>;
  /** `security` of the operation; an empty list means it needs no token. */
  security?: SecurityRequirement[];
  /** `x-required-permission`: one permission, or several (a string or a list of strings in the document). */
  permissions: string[];
  /** `x-host-token-only` */
  hostTokenOnly: boolean;
  codeSamples: CodeSample[];
  /** The media type the body is sent as (JSON preferred). */
  bodyMediaType?: string;
  /** The request body's example, pretty JSON (or the raw example of a non-JSON body). */
  bodyExample?: string;
  /** The first success response's JSON example. */
  responseExample?: string;
  /** The first success response is described as JSON (or describes no success at all). */
  successJson: boolean;
}

export interface TagGroup {
  tag: string;
  description?: string;
  operations: Operation[];
}

export interface ServerObject {
  url: string;
  description?: string;
  variables?: Record<string, { default?: string; enum?: string[]; description?: string }>;
}

export interface SecurityScheme {
  type?: string;
  scheme?: string;
  bearerFormat?: string;
  description?: string;
  name?: string;
  in?: string;
}

export interface OpenApiDocument {
  openapi?: string;
  swagger?: string;
  info?: { title?: string; version?: string; description?: string };
  servers?: ServerObject[];
  paths?: Record<string, Record<string, unknown>>;
  components?: Record<string, Record<string, unknown> | undefined> & { securitySchemes?: Record<string, SecurityScheme> };
  security?: SecurityRequirement[];
  tags?: { name: string; description?: string }[];
}

export const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

/** Operations without a tag are listed under this one, last. */
export const UNTAGGED = 'Other';

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isRef = (value: unknown): value is { $ref: string } => isObject(value) && typeof value.$ref === 'string';

export async function loadDocument(url: string): Promise<OpenApiDocument> {
  const doc = await getJson<unknown>(url);
  if (!isObject(doc) || !(typeof doc.openapi === 'string' || typeof doc.swagger === 'string' || isObject(doc.paths))) {
    throw new Error(`${url}: not an OpenAPI document`);
  }
  return doc as OpenApiDocument;
}

/** The value a local JSON pointer (`#/components/schemas/Rate`) names, or undefined. */
function pointer(doc: OpenApiDocument, ref: string): unknown {
  if (!ref.startsWith('#/')) return undefined;
  let current: unknown = doc;
  for (const raw of ref.slice(2).split('/')) {
    let key: string;
    try {
      key = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~');
    } catch {
      return undefined;
    }
    if (!isObject(current) && !Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
    if (current === undefined) return undefined;
  }
  return current;
}

/**
 * Follows `$ref`s (a chain of them too) to the object they name. Keys written next to a `$ref` (OpenAPI 3.1, e.g. a
 * `description`) win over the target's. A missing target, an external reference or a chain that loops gives
 * undefined.
 */
export function resolveRef<T>(doc: OpenApiDocument, value: T | { $ref: string } | undefined): T | undefined {
  let current: unknown = value;
  let siblings: Record<string, unknown> = {};
  const seen = new Set<string>();
  while (isRef(current)) {
    const { $ref, ...rest } = current as { $ref: string } & Record<string, unknown>;
    if (seen.has($ref)) return undefined;
    seen.add($ref);
    siblings = { ...rest, ...siblings };
    current = pointer(doc, $ref);
  }
  if (current === undefined) return undefined;
  return (Object.keys(siblings).length && isObject(current) ? { ...current, ...siblings } : current) as T;
}

const refName = (ref: string) => ref.slice(ref.lastIndexOf('/') + 1).replace(/~1/g, '/').replace(/~0/g, '~');

export interface ResolvedSchema {
  schema?: Schema;
  /** The component's name when the schema was a `$ref` (e.g. `Rate`). */
  name?: string;
  /** The schema refers back to one being shown above it (a recursive type): shown by name only. */
  circular: boolean;
  /** The references on the way here, for the levels below. */
  seen: string[];
}

/** One level of a schema tree: its `$ref` resolved, cycles stopped against the references above it. */
export function resolveSchema(doc: OpenApiDocument, schema: Schema | undefined, seen: readonly string[]): ResolvedSchema {
  if (!schema) return { circular: false, seen: [...seen] };
  if (!isRef(schema)) return { schema, circular: false, seen: [...seen] };
  const ref = schema.$ref;
  const name = refName(ref);
  if (seen.includes(ref)) return { name, circular: true, seen: [...seen] };
  return { schema: resolveRef<Schema>(doc, schema), name, circular: false, seen: [...seen, ref] };
}

const SAMPLE_STRINGS: Record<string, string> = {
  date: '2026-01-01',
  'date-time': '2026-01-01T00:00:00Z',
  time: '00:00:00',
  email: 'user@example.com',
  uuid: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  uri: 'https://example.com',
  url: 'https://example.com',
  hostname: 'example.com',
  ipv4: '192.0.2.1',
  ipv6: '2001:db8::1',
  byte: 'U3dhZ2dlcg==',
};

const MAX_EXAMPLE_DEPTH = 8;

function primaryType(schema: Schema): string | undefined {
  if (Array.isArray(schema.type)) return schema.type.find(t => t !== 'null') ?? schema.type[0];
  if (schema.type) return schema.type;
  if (schema.properties || schema.additionalProperties) return 'object';
  if (schema.items) return 'array';
  return undefined;
}

/**
 * An example value for a schema: its own `example`/`examples`/`default`/`enum`/`const`, else one built from its
 * type (objects from their properties, arrays from their items). Recursive schemas stop at the cycle.
 */
export function exampleOf(doc: OpenApiDocument, schema: Schema | undefined, seen: readonly string[] = [], depth = 0): unknown {
  if (!schema || depth > MAX_EXAMPLE_DEPTH) return undefined;
  const level = resolveSchema(doc, schema, seen);
  if (level.circular || !level.schema) return undefined;
  const s = level.schema;
  const next = level.seen;
  if (s.example !== undefined) return s.example;
  if (Array.isArray(s.examples) && s.examples.length) return s.examples[0];
  if (s.default !== undefined) return s.default;
  if (s.const !== undefined) return s.const;
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
  if (Array.isArray(s.allOf) && s.allOf.length) {
    const parts = s.allOf.map(part => exampleOf(doc, part, next, depth + 1));
    if (parts.every(p => p === undefined || isObject(p))) {
      return Object.assign({}, ...parts.filter(isObject), objectExample(doc, s, next, depth) ?? {}) as Record<string, unknown>;
    }
    return parts.find(p => p !== undefined);
  }
  const choice = (s.oneOf ?? s.anyOf)?.[0];
  if (choice) return exampleOf(doc, choice, next, depth + 1);
  switch (primaryType(s)) {
    case 'object':
      return objectExample(doc, s, next, depth) ?? {};
    case 'array': {
      const item = exampleOf(doc, s.items, next, depth + 1);
      return item === undefined ? [] : [item];
    }
    case 'string':
      return SAMPLE_STRINGS[s.format ?? ''] ?? 'string';
    case 'integer':
    case 'number':
      return typeof s.minimum === 'number' ? s.minimum : 0;
    case 'boolean':
      return true;
    case 'null':
      return null;
    default:
      return undefined;
  }
}

function objectExample(doc: OpenApiDocument, s: Schema, seen: readonly string[], depth: number): Record<string, unknown> | undefined {
  if (!s.properties) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, property] of Object.entries(s.properties)) {
    const value = exampleOf(doc, property, seen, depth + 1);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function firstExample(examples: unknown, doc: OpenApiDocument): unknown {
  if (!isObject(examples)) return undefined;
  for (const entry of Object.values(examples)) {
    const resolved = resolveRef<{ value?: unknown }>(doc, entry as { value?: unknown });
    if (resolved && resolved.value !== undefined) return resolved.value;
  }
  return undefined;
}

/** The media type a body or response is described in: JSON first, else the first one listed. */
export function pickMediaType(content: Record<string, MediaType> | undefined): string | undefined {
  if (!content) return undefined;
  const types = Object.keys(content);
  return types.find(t => t.split(';')[0].trim() === 'application/json') ?? types.find(t => /[/+]json\b/i.test(t)) ?? types[0];
}

export const isJsonType = (type: string | undefined) => !!type && /^application\/(.+\+)?json\b/i.test(type.split(';')[0].trim());

function mediaExample(doc: OpenApiDocument, media: MediaType | undefined): unknown {
  if (!media) return undefined;
  if (media.example !== undefined) return media.example;
  const fromExamples = firstExample(media.examples, doc);
  if (fromExamples !== undefined) return fromExamples;
  return exampleOf(doc, media.schema);
}

const isFormType = (type: string | undefined) => !!type && type.split(';')[0].trim().toLowerCase() === 'application/x-www-form-urlencoded';

function formatExample(value: unknown, type: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  // A form body with a flat object example is shown and sent as form data (a=1&b=x)
  if (isFormType(type) && isObject(value) && Object.values(value).every(v => v === null || typeof v !== 'object')) {
    return new URLSearchParams(Object.entries(value).map(([k, v]) => [k, v === null ? '' : String(v)])).toString();
  }
  if (!isJsonType(type) && typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function readParameter(doc: OpenApiDocument, raw: unknown): Parameter | undefined {
  const p = resolveRef<Record<string, unknown>>(doc, raw as Record<string, unknown>);
  if (!p || typeof p.name !== 'string' || typeof p.in !== 'string') return undefined;
  const schema = isObject(p.schema) ? (p.schema as Schema) : undefined;
  const resolvedSchema = schema ? resolveRef<Schema>(doc, schema) : undefined;
  let example = p.example;
  if (example === undefined) example = firstExample(p.examples, doc);
  if (example === undefined && resolvedSchema) {
    example = resolvedSchema.example !== undefined
      ? resolvedSchema.example
      : Array.isArray(resolvedSchema.examples) ? resolvedSchema.examples[0] : undefined;
  }
  return {
    name: p.name,
    in: p.in,
    required: p.in === 'path' || p.required === true,
    description: typeof p.description === 'string' ? p.description : undefined,
    deprecated: p.deprecated === true,
    schema,
    example,
  };
}

function mergeParameters(doc: OpenApiDocument, pathLevel: unknown, own: unknown): Parameter[] {
  const result: Parameter[] = [];
  const add = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const raw of list) {
      const p = readParameter(doc, raw);
      if (!p) continue;
      const at = result.findIndex(r => r.name === p.name && r.in === p.in);
      if (at >= 0) result[at] = p;
      else result.push(p);
    }
  };
  add(pathLevel);
  add(own);
  return result;
}

function readPermissions(value: unknown): string[] {
  if (typeof value === 'string') return value ? [value] : [];
  return Array.isArray(value) ? value.filter((p): p is string => typeof p === 'string' && p !== '') : [];
}

function readCodeSamples(value: unknown): CodeSample[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isObject)
    .filter(s => typeof s.lang === 'string' && typeof s.source === 'string')
    .map(s => ({ lang: s.lang as string, source: s.source as string, ...(typeof s.label === 'string' ? { label: s.label } : {}) }));
}

function readOperation(doc: OpenApiDocument, path: string, method: string, raw: Record<string, unknown>, pathItem: Record<string, unknown>): Operation {
  const requestBody = resolveRef<RequestBody>(doc, raw.requestBody as RequestBody | undefined);
  const responses: Record<string, ResponseObject> = {};
  if (isObject(raw.responses)) {
    for (const [status, response] of Object.entries(raw.responses)) {
      responses[status] = resolveRef<ResponseObject>(doc, response as ResponseObject) ?? { description: '' };
    }
  }
  const bodyMediaType = pickMediaType(isObject(requestBody?.content) ? requestBody.content : undefined);
  const bodyExample = bodyMediaType
    ? formatExample(mediaExample(doc, requestBody!.content[bodyMediaType]), bodyMediaType)
    : undefined;
  const success = Object.keys(responses).find(code => /^2\d\d$/.test(code));
  const successType = success ? pickMediaType(responses[success].content) : undefined;
  const responseExample = success && isJsonType(successType)
    ? formatExample(mediaExample(doc, responses[success].content![successType!]), successType)
    : undefined;
  return {
    method,
    path,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
    operationId: typeof raw.operationId === 'string' ? raw.operationId : undefined,
    summary: typeof raw.summary === 'string' ? raw.summary : undefined,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    deprecated: raw.deprecated === true,
    parameters: mergeParameters(doc, pathItem.parameters, raw.parameters),
    requestBody: requestBody && isObject(requestBody.content) ? requestBody : undefined,
    responses,
    security: Array.isArray(raw.security) ? (raw.security as SecurityRequirement[]) : undefined,
    permissions: readPermissions(raw['x-required-permission']),
    hostTokenOnly: raw['x-host-token-only'] === true,
    codeSamples: readCodeSamples(raw['x-codeSamples']),
    bodyMediaType,
    bodyExample,
    responseExample,
    successJson: !success || isJsonType(successType),
  };
}

/** Every operation of the document, in document order (paths, then methods as written). */
export function listOperations(doc: OpenApiDocument): Operation[] {
  const operations: Operation[] = [];
  for (const [path, rawItem] of Object.entries(doc.paths ?? {})) {
    const pathItem = resolveRef<Record<string, unknown>>(doc, rawItem);
    if (!isObject(pathItem)) continue;
    for (const [key, raw] of Object.entries(pathItem)) {
      const method = key.toLowerCase();
      if (!(HTTP_METHODS as readonly string[]).includes(method) || !isObject(raw)) continue;
      operations.push(readOperation(doc, path, method, raw, pathItem));
    }
  }
  return operations;
}

/**
 * Operations by tag: the document's declared tags first (in their order, those with operations), then tags only
 * operations use (in the order they first appear), then the untagged ones under `Other`. An operation with several
 * tags is listed under each.
 */
export function groupByTag(doc: OpenApiDocument): TagGroup[] {
  const declared = (Array.isArray(doc.tags) ? doc.tags : []).filter(t => isObject(t) && typeof t.name === 'string');
  const groups = new Map<string, TagGroup>();
  for (const tag of declared) {
    if (!groups.has(tag.name)) groups.set(tag.name, { tag: tag.name, description: tag.description, operations: [] });
  }
  const untagged: Operation[] = [];
  for (const op of listOperations(doc)) {
    if (op.tags.length === 0) {
      untagged.push(op);
      continue;
    }
    for (const tag of op.tags) {
      if (!groups.has(tag)) groups.set(tag, { tag, operations: [] });
      groups.get(tag)!.operations.push(op);
    }
  }
  const result = [...groups.values()].filter(g => g.operations.length > 0);
  if (untagged.length) {
    const other = result.find(g => g.tag === UNTAGGED);
    if (other) {
      other.operations.push(...untagged);
      result.push(...result.splice(result.indexOf(other), 1));
    } else {
      result.push({ tag: UNTAGGED, operations: untagged });
    }
  }
  return result;
}

/** The operation's anchor: its `operationId`, else `<method>-<path>` (`post-v1-alerts`). */
export function operationId(op: Pick<Operation, 'operationId' | 'method' | 'path'>): string {
  if (op.operationId) return op.operationId.replace(/\s+/g, '-');
  return `${op.method}-${op.path}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * The base URL requests go to: the document's first server (relative ones against the document's own URL,
 * `{variables}` filled with their defaults), else the origin the document was served from.
 */
export function serverUrlOf(doc: OpenApiDocument, documentUrl: string): string {
  const base = new URL(documentUrl, typeof window !== 'undefined' ? window.location.href : 'http://localhost/');
  const server = Array.isArray(doc.servers) ? doc.servers.find(s => isObject(s) && typeof s.url === 'string') : undefined;
  if (!server) return base.origin;
  const url = server.url.replace(/\{([^}]+)\}/g, (match, name: string) => server.variables?.[name]?.default ?? match);
  try {
    const resolved = new URL(url, base);
    // Only an http(s) server is used for samples and Try it
    return /^https?:$/.test(resolved.protocol) ? resolved.href.replace(/\/+$/, '') : base.origin;
  } catch {
    return base.origin;
  }
}
