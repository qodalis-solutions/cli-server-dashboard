import type { DashboardExtension } from '@qodalis/cli-server-dashboard-kit';

/**
 * Imports an extension's entry and returns its `DashboardExtension` (the default export, or a named `extension`).
 * A retry (`attempt` > 0) asks for a fresh copy: the browser keeps a failed import's result for the same URL.
 */
export async function loadExtension(entry: string, attempt = 0): Promise<DashboardExtension> {
  const url = attempt > 0 ? `${entry}${entry.includes('?') ? '&' : '?'}retry=${attempt}` : entry;
  const module = (await import(/* @vite-ignore */ url)) as { default?: unknown; extension?: unknown };
  const extension = (module.default ?? module.extension) as Partial<DashboardExtension> | undefined;
  if (!extension || typeof extension.mount !== 'function') {
    throw new Error('The module exports no extension: a default export (or `extension`) with mount()');
  }
  return extension as DashboardExtension;
}

/** Adds the extension's stylesheets to the page, once each (they stay for later visits). */
export function injectStyles(styles: readonly string[] | undefined, doc: Document = document): void {
  for (const href of styles ?? []) {
    const present = [...doc.querySelectorAll<HTMLLinkElement>('link[data-qcli-extension-style]')].some(
      link => link.dataset.qcliExtensionStyle === href,
    );
    if (present) continue;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.qcliExtensionStyle = href;
    doc.head.appendChild(link);
  }
}
