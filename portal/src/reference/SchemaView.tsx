import Markdown from '../markdown/Markdown';
import { resolveSchema, type OpenApiDocument, type Schema } from './openapi';
import { typeLabel } from './typeLabel';

const MAX_DEPTH = 12;

/** Properties of an object schema (allOf parts merged), with the required ones. */
function propertiesOf(doc: OpenApiDocument, schema: Schema, seen: readonly string[]): { properties: Record<string, Schema>; required: Set<string> } {
  const properties: Record<string, Schema> = {};
  const required = new Set<string>(schema.required ?? []);
  for (const part of schema.allOf ?? []) {
    const level = resolveSchema(doc, part, seen);
    if (!level.schema || level.circular) continue;
    const inner = propertiesOf(doc, level.schema, level.seen);
    Object.assign(properties, inner.properties);
    inner.required.forEach(r => required.add(r));
  }
  Object.assign(properties, schema.properties ?? {});
  return { properties, required };
}

/** The schema of the next level down, when it has one worth expanding (an object, or an array of objects). */
function childSchema(doc: OpenApiDocument, schema: Schema | undefined, seen: readonly string[]): { schema: Schema; seen: string[] } | null {
  const level = resolveSchema(doc, schema, seen);
  if (!level.schema || level.circular) return null;
  const s = level.schema;
  if (s.properties || s.allOf) return { schema: s, seen: level.seen };
  if (s.items) return childSchema(doc, s.items, level.seen);
  const choice = (s.oneOf ?? s.anyOf)?.[0];
  return choice ? childSchema(doc, choice, level.seen) : null;
}

function Facts({ schema }: { schema: Schema }) {
  const facts: string[] = [];
  if (Array.isArray(schema.enum)) facts.push(`One of: ${schema.enum.map(v => JSON.stringify(v)).join(', ')}`);
  if (schema.default !== undefined) facts.push(`Default: ${JSON.stringify(schema.default)}`);
  if (schema.example !== undefined && typeof schema.example !== 'object') facts.push(`Example: ${JSON.stringify(schema.example)}`);
  if (typeof schema.minimum === 'number') facts.push(`Minimum: ${schema.minimum}`);
  if (typeof schema.maximum === 'number') facts.push(`Maximum: ${schema.maximum}`);
  if (typeof schema.minLength === 'number') facts.push(`Min length: ${schema.minLength}`);
  if (typeof schema.maxLength === 'number') facts.push(`Max length: ${schema.maxLength}`);
  if (typeof schema.pattern === 'string') facts.push(`Pattern: ${schema.pattern}`);
  if (!facts.length) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-subtle">
      {facts.map(fact => <li key={fact} className="font-mono break-all">{fact}</li>)}
    </ul>
  );
}

interface Props {
  doc: OpenApiDocument;
  schema: Schema | undefined;
  seen?: readonly string[];
  depth?: number;
}

/**
 * A schema as a tree: each property with its type, required mark, description and constraints; nested objects
 * (and arrays of objects) collapsible below their property. `$ref`s are resolved; a recursive type stops at the
 * cycle and is shown by name.
 */
export default function SchemaView({ doc, schema, seen = [], depth = 0 }: Props) {
  const level = resolveSchema(doc, schema, seen);
  if (!level.schema) {
    return <p className="text-sm text-muted font-mono">{typeLabel(doc, schema, seen)}</p>;
  }
  const child = childSchema(doc, schema, seen);
  if (!child) {
    return (
      <div className="text-sm">
        <span className="font-mono text-xs text-muted">{typeLabel(doc, schema, seen)}</span>
        {level.schema.description && <Markdown markdown={level.schema.description} className="mt-1 text-sm" />}
        <Facts schema={level.schema} />
      </div>
    );
  }
  const { properties, required } = propertiesOf(doc, child.schema, child.seen);
  const entries = Object.entries(properties);
  return (
    <div>
      {depth === 0 && (
        <p className="mb-2 font-mono text-xs text-muted">{typeLabel(doc, schema, seen)}</p>
      )}
      {entries.length === 0 ? (
        <p className="text-sm text-muted">No properties.</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {entries.map(([name, property]) => (
            <PropertyRow
              key={name}
              doc={doc}
              name={name}
              schema={property}
              required={required.has(name)}
              seen={child.seen}
              depth={depth}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function PropertyRow({ doc, name, schema, required, seen, depth }: {
  doc: OpenApiDocument; name: string; schema: Schema; required: boolean; seen: readonly string[]; depth: number;
}) {
  const level = resolveSchema(doc, schema, seen);
  const resolved = level.schema;
  const nested = depth < MAX_DEPTH ? childSchema(doc, schema, seen) : null;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <code className="font-mono text-sm font-semibold text-heading break-all">{name}</code>
        <span className="font-mono text-xs text-muted">{typeLabel(doc, schema, seen)}</span>
        {required && <span className="text-[11px] font-medium text-warning">required</span>}
        {resolved?.deprecated && <span className="text-[11px] font-medium text-error">deprecated</span>}
        {resolved?.readOnly && <span className="text-[11px] text-subtle">read-only</span>}
      </div>
      {resolved?.description && <Markdown markdown={resolved.description} className="mt-1 text-sm" />}
      {resolved && <Facts schema={resolved} />}
      {nested && (
        <details className="group mt-2 rounded-md border border-border">
          <summary className="cursor-pointer select-none list-none px-3 py-1.5 text-xs font-medium text-muted hover:text-text">
            <span aria-hidden className="inline-block mr-1 transition-transform group-open:rotate-90">›</span>
            Attributes of {name}
          </summary>
          <div className="px-3 pb-1">
            <SchemaView doc={doc} schema={nested.schema} seen={nested.seen} depth={depth + 1} />
          </div>
        </details>
      )}
    </li>
  );
}
