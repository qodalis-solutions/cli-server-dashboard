const OPEN_EVENT = 'qcli:open-command-palette';

/** Opens the command palette from anywhere (the sidebar button; the palette also listens for Ctrl+K / ⌘K). */
export function openCommandPalette(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function onOpenCommandPalette(handler: () => void): () => void {
  window.addEventListener(OPEN_EVENT, handler);
  return () => window.removeEventListener(OPEN_EVENT, handler);
}
