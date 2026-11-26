import { ApiError, errorText, responseErrorText } from '@qodalis/cli-server-dashboard-kit';
/**
 * The data explorer of the server (`/api/qcli/data-explorer`, the data explorer plugin): its sources, their schema
 * and queries. Servers with data explorer hardening refuse queries a source does not allow (`errorCode`).
 */
export const BASE = '/api/qcli/data-explorer';

/** The dashboard's `fetch` (the extension context's). */
export type Fetch = (path: string, init?: RequestInit) => Promise<Response>;

export interface DataExplorerTemplate {
  name: string;
  query: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface DataExplorerSource {
  name: string;
  description: string;
  /** `sql`, `json` (MongoDB), `redis`, `elasticsearch`, `graphql`, `shell`. */
  language: string;
  defaultOutputFormat?: string;
  templates?: DataExplorerTemplate[];
  parameters?: { name: string; description?: string; required?: boolean; defaultValue?: unknown }[];
  /** Queries may only read (servers with data explorer hardening; absent: unknown). */
  readOnly?: boolean;
  /** The caller may export results (json/csv in the web CLI); absent on older servers. */
  canExport?: boolean;
}

/** Why the server refused a query. */
export type DataExplorerErrorCode = 'forbidden' | 'rate_limited' | 'read_only' | 'object_not_allowed' | 'masked_column' | 'unknown_source';

export const DATA_EXPLORER_ERROR_CODES: readonly DataExplorerErrorCode[] = [
  'forbidden', 'rate_limited', 'read_only', 'object_not_allowed', 'masked_column', 'unknown_source',
];

export interface DataExplorerResult {
  success: boolean;
  source: string;
  language?: string;
  defaultOutputFormat?: string;
  /** Milliseconds. */
  executionTime: number;
  columns: string[] | null;
  rows: unknown[][] | Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  error: string | null;
  errorCode?: DataExplorerErrorCode;
  /** The query as the server ran it, when it differs from the one sent (e.g. a mixed-case name quoted: `"Users"`). */
  executedQuery?: string;
}

export interface DataExplorerSchemaTable {
  name: string;
  type: string;
  columns: { name: string; type: string; nullable: boolean; primaryKey: boolean }[];
}

export interface DataExplorerSchema {
  source: string;
  tables: DataExplorerSchemaTable[];
}

/** What running a query gave: rows, or why it failed or was refused. */
export type QueryOutcome =
  | { kind: 'rows'; result: DataExplorerResult }
  | { kind: 'refused'; code: DataExplorerErrorCode; message: string; executedQuery?: string }
  | { kind: 'failed'; message: string; executionTime?: number; executedQuery?: string };

const isErrorCode = (value: unknown): value is DataExplorerErrorCode =>
  DATA_EXPLORER_ERROR_CODES.includes(value as DataExplorerErrorCode);

/** The `error` of a JSON error body, an HTML page's text, or the body itself. */
function messageOf(body: string): string {
  return errorText(body);
}

/**
 * An execute response as an outcome. The routes answer refusals for permissions (403) and rate limits (429) with
 * only `{ error }`; other refusals (`read_only`, `object_not_allowed`) come as a 200 result with `errorCode`.
 */
export function toQueryOutcome(status: number, body: unknown): QueryOutcome {
  if (status === 403 || status === 429) {
    const message = typeof body === 'string' ? messageOf(body) : String((body as { error?: unknown })?.error ?? '');
    return { kind: 'refused', code: status === 403 ? 'forbidden' : 'rate_limited', message };
  }
  if (status >= 200 && status < 300 && body && typeof body === 'object') {
    const result = body as DataExplorerResult;
    if (result.success !== false) return { kind: 'rows', result };
    const executed = typeof result.executedQuery === 'string' && result.executedQuery ? { executedQuery: result.executedQuery } : {};
    if (isErrorCode(result.errorCode)) return { kind: 'refused', code: result.errorCode, message: result.error ?? '', ...executed };
    return { kind: 'failed', message: result.error ?? '', executionTime: result.executionTime, ...executed };
  }
  const text = typeof body === 'string' ? messageOf(body) : String((body as { error?: unknown })?.error ?? status);
  return status === 404 && /unknown data source/i.test(text)
    ? { kind: 'refused', code: 'unknown_source', message: text }
    : { kind: 'failed', message: text };
}

/** A failed request: its status and the server's message (the `{ error }` text, an HTML page's text, else the status). */
export class DataExplorerError extends ApiError {
  constructor(status: number, message: string, body?: unknown) {
    super(status, message, body);
    this.name = 'DataExplorerError';
  }
}

async function getJson<T>(fetch: Fetch, path: string): Promise<T> {
  const res = await fetch(path);
  const text = await res.text();
  if (!res.ok) throw new DataExplorerError(res.status, responseErrorText(res.status, res.statusText, text), text);
  return (text ? JSON.parse(text) : undefined) as T;
}

export function getDataExplorerSources(fetch: Fetch): Promise<DataExplorerSource[]> {
  return getJson<DataExplorerSource[]>(fetch, `${BASE}/sources`);
}

/** The source's tables, or null when it cannot describe them (404). */
export async function getDataExplorerSchema(fetch: Fetch, source: string): Promise<DataExplorerSchema | null> {
  try {
    return await getJson<DataExplorerSchema>(fetch, `${BASE}/schema?source=${encodeURIComponent(source)}`);
  } catch (err) {
    if (err instanceof DataExplorerError && err.status === 404) return null;
    throw err;
  }
}

/** Runs a query; never throws for an answer of the server (a 401 still goes to sign-in). */
export async function executeDataExplorerQuery(fetch: Fetch, source: string, query: string): Promise<QueryOutcome> {
  try {
    const res = await fetch(`${BASE}/execute`, { method: 'POST', body: JSON.stringify({ source, query }) });
    const text = await res.text();
    if (!res.ok) return toQueryOutcome(res.status, text);
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      // not JSON: a failure with the text
    }
    return toQueryOutcome(res.status, body);
  } catch (err) {
    return { kind: 'failed', message: err instanceof Error ? err.message : String(err) };
  }
}
