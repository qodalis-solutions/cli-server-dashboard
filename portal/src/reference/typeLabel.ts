import { resolveSchema, type OpenApiDocument, type Schema } from './openapi';

/** A short type label: `string (date)`, `array of Rate`, `integer | null`, `one of A, B`. */
export function typeLabel(doc: OpenApiDocument, schema: Schema | undefined, seen: readonly string[] = []): string {
  const level = resolveSchema(doc, schema, seen);
  const s = level.schema;
  if (level.circular) return level.name ?? 'object';
  if (!s) return level.name ?? 'any';
  const nullable = s.nullable === true || (Array.isArray(s.type) && s.type.includes('null'));
  let label: string;
  if (s.oneOf || s.anyOf) {
    label = `${s.oneOf ? 'one of' : 'any of'} ${(s.oneOf ?? s.anyOf)!.map(part => typeLabel(doc, part, level.seen)).join(', ')}`;
  } else if (Array.isArray(s.type) && s.type.filter(t => t !== 'null').length > 1) {
    label = s.type.filter(t => t !== 'null').join(' | ');
  } else {
    const type = Array.isArray(s.type) ? s.type.find(t => t !== 'null') : s.type;
    if (type === 'array' || (!type && s.items)) label = `array of ${typeLabel(doc, s.items, level.seen)}`;
    else if (level.name && (type === 'object' || !type)) label = level.name;
    else label = `${type ?? (s.properties || s.allOf ? 'object' : 'any')}${s.format ? ` (${s.format})` : ''}`;
  }
  return nullable ? `${label} | null` : label;
}
