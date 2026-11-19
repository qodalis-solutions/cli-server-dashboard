/** The element id a location hash names (`#getRates` → `getRates`), or null when it is empty or malformed (`#%E0`). */
export function hashTarget(hash: string): string | null {
  if (!hash || hash === '#') return null;
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return null;
  }
}

/** Scrolls to the element the hash names, if any. */
export function scrollToHash(hash: string): void {
  const id = hashTarget(hash);
  if (id) document.getElementById(id)?.scrollIntoView?.({ block: 'start' });
}
