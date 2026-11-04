/**
 * Vitest setup. Node 22+ defines its own global `localStorage`/`sessionStorage` (unusable
 * without `--localstorage-file`), which shadow jsdom's: use jsdom's in jsdom test files.
 */
const dom = (globalThis as { jsdom?: { window: Window } }).jsdom;
if (dom) {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true, writable: true });
  }
}
