import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { useDashboard } from './defineExtension';

/**
 * The dashboard URL of a path below the extension's page, for an `href` (open in a new tab, copy the link): the
 * current page's URL up to `/x/<id>`, then the path.
 */
export function useExtensionHref(to: string): string {
    const { extension } = useDashboard();
    const prefix = `/x/${extension.id}`;
    const here = typeof window === 'undefined' ? '' : window.location.pathname;
    const at = here.indexOf(prefix);
    const base = at === -1 ? prefix : here.slice(0, at + prefix.length);
    return `${base}${to === '/' ? '' : to}`;
}

/** A link inside the extension: a real `href`, and a plain click navigates (`context.navigate`) without reloading. */
export function ExtensionLink({ to, onClick, ...props }: { to: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
    const { navigate } = useDashboard();
    const href = useExtensionHref(to);
    const click = (e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(to);
    };
    return <a href={href} onClick={click} {...props} />;
}
