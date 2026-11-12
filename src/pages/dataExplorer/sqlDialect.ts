import type { DataExplorerSchema, DataExplorerSource } from '../../api/dataExplorer';

/** The SQL flavours the editor knows (CodeMirror `@codemirror/lang-sql` dialects). */
export type SqlDialectName = 'postgresql' | 'mysql' | 'sqlite' | 'mssql' | 'standard';

const PATTERNS: [SqlDialectName, RegExp][] = [
  ['mssql', /\b(mssql|sql\s*server|sqlserver|t-?sql|azure\s*sql)\b/i],
  ['postgresql', /\b(postgres(ql)?|pg|psql|timescale(db)?|cockroach(db)?|supabase|redshift)\b/i],
  ['mysql', /\b(mysql|maria(db)?|tidb)\b/i],
  ['sqlite', /\b(sqlite3?|libsql|turso)\b/i],
];

/** Queries that only make sense in one dialect (the source's templates). */
const QUERY_HINTS: [SqlDialectName, RegExp][] = [
  ['sqlite', /\bsqlite_(master|schema)\b|\bPRAGMA\b/i],
  ['postgresql', /\bpg_(catalog|tables|class|namespace)\b|::\s*[a-z]+/i],
  ['mssql', /\bsys\.(tables|objects|columns)\b|\bSELECT\s+TOP\b|\[[^\]\s]+\]/i],
  ['mysql', /\bSHOW\s+(TABLES|DATABASES)\b|`[^`]+`/i],
];

function match(text: string, patterns: [SqlDialectName, RegExp][]): SqlDialectName | null {
  for (const [dialect, pattern] of patterns) if (pattern.test(text)) return dialect;
  return null;
}

/**
 * The SQL dialect of a source. Servers only say `language: 'sql'`, so a `dialect`/`type`/`provider` field is used
 * when a server sends one, then the source's name and description, then its templates; `standard` otherwise.
 */
export function detectSqlDialect(source: DataExplorerSource): SqlDialectName {
  const extra = source as DataExplorerSource & { dialect?: unknown; type?: unknown; provider?: unknown };
  for (const field of [extra.dialect, extra.type, extra.provider]) {
    if (typeof field === 'string') {
      const found = match(field, PATTERNS);
      if (found) return found;
    }
  }
  return match(`${source.name} ${source.description ?? ''}`.replace(/[_-]/g, ' '), PATTERNS)
    ?? match((source.templates ?? []).map(t => t.query).join('\n'), QUERY_HINTS)
    ?? 'standard';
}

const FOLDED_LOWER = /^[a-z_][a-z0-9_]*$/;
/** Words that cannot be used as names unquoted in any of the dialects. */
const RESERVED = new Set([
  'all', 'and', 'as', 'by', 'case', 'check', 'column', 'constraint', 'create', 'default', 'delete', 'desc', 'distinct',
  'drop', 'else', 'end', 'from', 'group', 'having', 'in', 'index', 'insert', 'into', 'is', 'join', 'key', 'like', 'limit',
  'not', 'null', 'on', 'or', 'order', 'primary', 'references', 'select', 'set', 'table', 'then', 'to', 'union', 'unique',
  'update', 'user', 'values', 'when', 'where', 'with',
]);

/**
 * A name as it must be written in a query, in the source's quoting style: double quotes for PostgreSQL, SQLite and
 * standard SQL, backticks for MySQL, brackets for SQL Server. Mixed-case names are always quoted (`"Users"`,
 * `` `Users` ``, `[Users]`): PostgreSQL and standard SQL fold unquoted names, and quoting keeps the exact name
 * everywhere else. Names that are not plain identifiers, or are reserved words, are quoted too.
 */
export function quoteIdentifier(name: string, dialect: SqlDialectName): string {
  if (FOLDED_LOWER.test(name) && !RESERVED.has(name)) return name;
  switch (dialect) {
    case 'mysql':
      return `\`${name.replace(/`/g, '``')}\``;
    case 'mssql':
      return `[${name.replace(/]/g, ']]')}]`;
    default:
      return `"${name.replace(/"/g, '""')}"`;
  }
}

/** A qualified name (`schema.table`) quoted part by part. */
export function quoteQualified(name: string, dialect: SqlDialectName): string {
  return name.split('.').map(part => quoteIdentifier(part, dialect)).join('.');
}

/** A completion option (structurally `@codemirror/autocomplete`'s `Completion`, without importing it). */
export interface SqlCompletion {
  label: string;
  apply?: string;
  type?: string;
  detail?: string;
  boost?: number;
}

/** `@codemirror/lang-sql`'s `SQLNamespace`. */
export type SqlNamespace = { [name: string]: SqlNamespace } | { self: SqlCompletion; children: SqlNamespace } | readonly (SqlCompletion | string)[];

/**
 * The explorer schema as a completion namespace: tables (nested under their schema for `schema.table` names) with
 * their columns; each option inserts the name quoted as the dialect needs it.
 */
export function toCompletionSchema(schema: DataExplorerSchema | null | undefined, dialect: SqlDialectName): Record<string, SqlNamespace> {
  const root: Record<string, SqlNamespace> = {};
  for (const table of schema?.tables ?? []) {
    const parts = table.name.split('.');
    const tableName = parts.pop()!;
    let level = root;
    for (const part of parts) {
      const existing = level[part] as { self?: SqlCompletion; children?: Record<string, SqlNamespace> } | undefined;
      if (!existing || !existing.children) {
        const children: Record<string, SqlNamespace> = {};
        level[part] = { self: { label: part, apply: quoteIdentifier(part, dialect), type: 'namespace' }, children };
        level = children;
      } else {
        level = existing.children;
      }
    }
    level[tableName] = {
      self: { label: tableName, apply: quoteIdentifier(tableName, dialect), type: 'type', detail: table.type },
      children: table.columns.map(col => ({
        label: col.name,
        apply: quoteIdentifier(col.name, dialect),
        type: 'property',
        detail: `${col.type}${col.nullable ? '?' : ''}${col.primaryKey ? ' 🔑' : ''}`,
        boost: col.primaryKey ? 1 : 0,
      })),
    };
  }
  return root;
}
