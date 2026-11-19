import { useId, useState, type KeyboardEvent } from 'react';
import { useReferenceState } from './ReferenceState';
import { isJsonType, operationId, type Operation, type Parameter } from './openapi';

/** Response headers worth showing: the quota (contract C5) and the type. */
const SHOWN_HEADERS = ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After', 'Content-Type'];

type Result =
  | { kind: 'response'; status: number; statusText: string; headers: [string, string][]; body: string; ms: number }
  | { kind: 'error'; message: string; hint?: string };

interface Props {
  operation: Operation;
  serverUrl: string;
}

/**
 * "Try it": sends the operation to the server with a token the reader pastes. The token is held in memory by the
 * reference's provider only (see ReferenceState); requests go without cookies (`credentials: 'omit'`), so only the
 * pasted token authenticates them.
 */
export default function TryIt({ operation, serverUrl }: Props) {
  const { token, setToken } = useReferenceState();
  const id = useId();
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-heading">Try it</h3>
        <p className="mt-0.5 text-xs text-subtle">Sends a real request. The token stays in this tab's memory and is never stored.</p>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <label htmlFor={`${id}-token`} className="block text-xs font-medium text-muted mb-1">API token</label>
          <div className="flex gap-2">
            <input
              id={`${id}-token`}
              type="password"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="qcli_pat_…"
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-text placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              type="button"
              onClick={() => setToken('')}
              disabled={!token}
              aria-label="Clear token"
              className="shrink-0 rounded-md border border-border px-3 text-xs text-muted hover:text-text hover:bg-control disabled:opacity-40 transition-colors"
            >
              Clear
            </button>
          </div>
          {!isSecure(serverUrl) && (
            <p role="note" className="mt-2 text-xs text-warning">
              This server is not on HTTPS: the token would travel unencrypted. Use a test token.
            </p>
          )}
        </div>
        {/* A new operation starts from its own examples; the token stays */}
        <TryItForm key={operationId(operation)} operation={operation} serverUrl={serverUrl} token={token} />
      </div>
    </div>
  );
}

/** https, or a local server (plain http on the reader's own machine is fine). */
function isSecure(serverUrl: string): boolean {
  try {
    const url = new URL(serverUrl);
    return url.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost');
  } catch {
    return false;
  }
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

const initialValue = (p: Parameter) =>
  p.example === undefined || p.example === null || typeof p.example === 'object' ? '' : String(p.example);

function buildUrl(serverUrl: string, op: Operation, values: Record<string, string>): string {
  const path = op.path.replace(/\{([^}]+)\}/g, (match, name: string) => {
    const value = values[`path:${name}`];
    return value ? encodeURIComponent(value) : match;
  });
  const query = op.parameters
    .filter(p => p.in === 'query' && values[`query:${p.name}`])
    .map(p => `${encodeURIComponent(p.name)}=${encodeURIComponent(values[`query:${p.name}`])}`);
  return `${serverUrl.replace(/\/+$/, '')}${path}${query.length ? `?${query.join('&')}` : ''}`;
}

function TryItForm({ operation: op, serverUrl, token }: Props & { token: string }) {
  const id = useId();
  const params = op.parameters.filter(p => p.in === 'path' || p.in === 'query' || p.in === 'header');
  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(params.map(p => [`${p.in}:${p.name}`, initialValue(p)])),
  );
  const method = op.method.toUpperCase();
  const takesBody = op.bodyMediaType !== undefined && method !== 'GET' && method !== 'HEAD';
  const [body, setBody] = useState(op.bodyExample ?? '');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const url = buildUrl(serverUrl, op, values);

  const send = async () => {
    if (busy) return;
    const json = isJsonType(op.bodyMediaType);
    if (takesBody && json && body.trim()) {
      try {
        JSON.parse(body);
      } catch {
        setResult({ kind: 'error', message: 'Body is not valid JSON' });
        return;
      }
    }
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token.trim()) headers.Authorization = `Bearer ${token.trim()}`;
    for (const p of params) {
      const value = values[`header:${p.name}`];
      if (p.in === 'header' && value && p.name.toLowerCase() !== 'authorization') headers[p.name] = value;
    }
    const sendBody = takesBody && body.trim() !== '';
    if (sendBody) headers['Content-Type'] = op.bodyMediaType!;
    setBusy(true);
    setResult(null);
    const started = performance.now();
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: sendBody ? body : undefined,
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      });
      const text = await res.text();
      setResult({
        kind: 'response',
        status: res.status,
        statusText: res.statusText,
        headers: SHOWN_HEADERS.flatMap(name => {
          const value = res.headers.get(name);
          return value === null ? [] : [[name, value] as [string, string]];
        }),
        body: pretty(text),
        ms: Math.round(performance.now() - started),
      });
    } catch (error) {
      setResult({
        kind: 'error',
        message: `Request failed: ${error instanceof Error ? error.message : String(error)}`,
        hint: 'The server could not be reached, or it does not allow requests from this page (CORS). The code samples work from anywhere.',
      });
    } finally {
      setBusy(false);
    }
  };

  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="space-y-4">
      {params.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {params.map(p => {
            const key = `${p.in}:${p.name}`;
            return (
              <div key={key}>
                <label htmlFor={`${id}-${key}`} className="flex items-baseline gap-1.5 text-xs font-medium text-muted mb-1">
                  <span className="font-mono text-text">{p.name}</span>
                  <span className="text-subtle">{p.in}</span>
                  {p.required && <span className="text-warning">*</span>}
                </label>
                <input
                  id={`${id}-${key}`}
                  aria-label={p.name}
                  value={values[key] ?? ''}
                  onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}
                  onKeyDown={onEnter}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            );
          })}
        </div>
      )}
      {takesBody && (
        <div>
          <label htmlFor={`${id}-body`} className="block text-xs font-medium text-muted mb-1">
            Request body <span className="font-mono text-subtle">{op.bodyMediaType}</span>
          </label>
          <textarea
            id={`${id}-body`}
            aria-label="Request body"
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={Math.min(14, Math.max(4, body.split('\n').length + 1))}
            spellCheck={false}
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed text-text focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-60 transition-colors"
        >
          {busy ? 'Sending…' : 'Send request'}
        </button>
        <code className="min-w-0 flex-1 truncate text-xs text-subtle" title={url}>{`${method} ${url}`}</code>
      </div>
      {/* Where the pasted token goes, always in full */}
      <p className="text-xs text-muted break-all">
        Sends to <code data-testid="tryit-origin" className="font-mono text-text">{originOf(url)}</code>
      </p>
      {result && <ResultView result={result} />}
    </div>
  );
}

function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function statusVariant(status: number): string {
  if (status < 300) return 'bg-success/15 text-success border-success/30';
  if (status < 400) return 'bg-info/15 text-info border-info/30';
  if (status < 500) return 'bg-warning/15 text-warning border-warning/30';
  return 'bg-error/15 text-error border-error/30';
}

function ResultView({ result }: { result: Result }) {
  if (result.kind === 'error') {
    return (
      <div role="alert" className="rounded-md border border-error/30 bg-error/[0.06] px-3 py-2">
        <p className="text-sm font-medium text-error">{result.message}</p>
        {result.hint && <p className="mt-1 text-xs text-muted">{result.hint}</p>}
      </div>
    );
  }
  return (
    <div aria-live="polite" className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <span className={`inline-flex rounded-full border px-2 py-0.5 font-mono text-xs font-semibold ${statusVariant(result.status)}`}>
          {result.status}
        </span>
        {result.statusText && <span className="text-muted">{result.statusText}</span>}
        <span className="ml-auto text-xs text-subtle">{result.ms} ms</span>
      </div>
      {result.headers.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          {result.headers.map(([name, value]) => (
            <div key={name} className="contents">
              <dt className="font-mono text-subtle">{name}</dt>
              <dd className="font-mono text-text break-all">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <pre data-testid="tryit-body" className="qp-pre max-h-96 overflow-auto whitespace-pre-wrap break-words">{result.body}</pre>
    </div>
  );
}
