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

/**
 * The readable message of a failure, never a raw JSON body: an Error's message or a string is read as the server's
 * JSON error body when it is one (`{"error":"forbidden"}` → `forbidden`), a plain text as is (a network error's
 * "Failed to fetch"), anything else as text.
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
  return text;
}
