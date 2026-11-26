/** The first text field a server's JSON error body carries (`{ error }`, `{ message }`, ProblemDetails' `detail`/`title`). */
function messageOfBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const fields = body as Record<string, unknown>;
  for (const key of ['error', 'message', 'detail', 'title']) {
    const value = fields[key];
    if (typeof value === 'string' && value.trim()) return value;
    // `{ error: { message } }`
    if (value && typeof value === 'object') {
      const nested = messageOfBody(value);
      if (nested) return nested;
    }
  }
  return null;
}

/** Reason phrases of the error statuses servers and proxies answer without a readable body. */
export const HTTP_REASON_PHRASES: Readonly<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  409: 'Conflict',
  413: 'Payload Too Large',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

/** `HTTP 404 Not Found`: a status with its text (the standard phrase when the server sent none, as over HTTP/2). */
export function httpStatusText(status: number, statusText = ''): string {
  const phrase = statusText.trim() || HTTP_REASON_PHRASES[status] || '';
  return `HTTP ${status}${phrase ? ` ${phrase}` : ''}`;
}

/** True for an HTML document or fragment (an Express or proxy error page), never shown raw. */
export function isHtml(text: string): boolean {
  return /^\s*<(!doctype|html|head|body|\?xml|[a-z][\w-]*[\s>/])/i.test(text);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (entity, name: string) => {
      if (ENTITIES[name.toLowerCase()] !== undefined) return ENTITIES[name.toLowerCase()];
      if (name.startsWith('#x') || name.startsWith('#X')) return String.fromCodePoint(parseInt(name.slice(2), 16));
      if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)));
      return entity;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The text of an HTML error page: its `<pre>` (Express: "Cannot GET /api/..."), else its `<h1>` or `<title>` (a
 * proxy's "502 Bad Gateway"; a bare "Error" title says nothing); null when it has none.
 */
export function htmlErrorText(html: string): string | null {
  for (const tag of ['pre', 'h1', 'title']) {
    const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(html);
    const text = match ? plainText(match[1]) : '';
    if (text && !(tag === 'title' && /^error$/i.test(text))) return text;
  }
  return null;
}

/**
 * The readable message of a failure, never a raw JSON or HTML body: an Error's message or a string is read as the
 * server's JSON error body when it is one (`{"error":"forbidden"}` → `forbidden`), an HTML page as its `<pre>`,
 * `<h1>` or `<title>` text, else `HTTP 404 Not Found` (with the error's `status` and `statusText` when it has them,
 * else `HTTP error`); a plain text as is (a network error's "Failed to fetch"), anything else as text.
 */
export function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message || String(error) : typeof error === 'string' ? error : String(error);
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try {
      const message = messageOfBody(JSON.parse(trimmed));
      if (message) return message;
    } catch {
      // not JSON: shown as is
    }
  }
  if (isHtml(trimmed)) {
    const fromPage = htmlErrorText(trimmed);
    if (fromPage) return fromPage;
    const failure = error as { status?: unknown; statusText?: unknown } | null;
    const status = failure && typeof failure === 'object' && typeof failure.status === 'number' ? failure.status : 0;
    return status ? httpStatusText(status, typeof failure!.statusText === 'string' ? failure!.statusText : '') : 'HTTP error';
  }
  return text;
}

/**
 * The message of a failed response's body, for an `Error`: the JSON body's `error` (or `message`, `detail`, `title`),
 * an HTML page's text, a plain-text body as is; `HTTP 404 Not Found` when the body says nothing.
 */
export function responseErrorText(status: number, statusText: string, body: string): string {
  const text = body.trim();
  if (!text) return httpStatusText(status, statusText);
  const message = errorText(Object.assign(new Error(text), { status, statusText }));
  // JSON without a message field: the status says more
  return message === text && text.startsWith('{') ? httpStatusText(status, statusText) : message;
}
