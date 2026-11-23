import { createContext, useContext, useEffect, useMemo, useRef, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { KitProvider } from '../i18n/text';
import type { DashboardExtension, DashboardExtensionContext } from './types';

const ExtensionContext = createContext<DashboardExtensionContext | null>(null);

/**
 * The extension for a React component: mounts a React root holding `App` with the dashboard's
 * context (`useDashboard()`) and the kit's language, and renders again when the theme, the
 * language or the extension's path changes.
 *
 * @example
 * ```tsx
 * export default defineExtension(() => {
 *     const { user } = useDashboard();
 *     return <PageHeader title={`Hello ${user.name}`} />;
 * });
 * ```
 */
export function defineExtension(App: ComponentType): DashboardExtension {
    return {
        mount(element, context) {
            const root = createRoot(element);
            let current: DashboardExtensionContext = { ...context };
            const render = () =>
                root.render(
                    <ExtensionContext.Provider value={current}>
                        <KitProvider locale={current.language}>
                            <App />
                        </KitProvider>
                    </ExtensionContext.Provider>,
                );
            const update = (patch: Partial<DashboardExtensionContext>) => {
                current = { ...current, ...patch };
                render();
            };
            const off = [
                context.onThemeChange((theme) => update({ theme })),
                context.onLanguageChange((language) => update({ language })),
                context.onPathChange((path) => update({ path })),
            ];
            render();
            return () => {
                off.forEach((unsubscribe) => unsubscribe());
                root.unmount();
            };
        },
    };
}

/** The dashboard's context inside an extension made with {@link defineExtension}. */
export function useDashboard(): DashboardExtensionContext {
    const context = useContext(ExtensionContext);
    if (!context) throw new Error('useDashboard() is only available inside defineExtension');
    return context;
}

/** A failed request: the HTTP status and the server's `error` text (or the status text). */
export class ApiError extends Error {
    constructor(
        readonly status: number,
        readonly error: string,
        readonly body?: unknown,
    ) {
        super(error);
        this.name = 'ApiError';
    }
}

export interface ExtensionApi {
    get<T = unknown>(path: string): Promise<T>;
    post<T = unknown>(path: string, body?: unknown): Promise<T>;
    put<T = unknown>(path: string, body?: unknown): Promise<T>;
    patch<T = unknown>(path: string, body?: unknown): Promise<T>;
    del<T = unknown>(path: string): Promise<T>;
}

/** JSON helpers over the context's `fetch`: parsed bodies, {@link ApiError} for non-2xx answers. */
export function createApi(fetcher: DashboardExtensionContext['fetch']): ExtensionApi {
    const call = async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
        const res = await fetcher(path, {
            method,
            ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
        });
        const text = await res.text();
        let parsed: unknown = undefined;
        if (text) {
            try {
                parsed = JSON.parse(text);
            } catch {
                parsed = text;
            }
        }
        if (!res.ok) {
            const message =
                parsed && typeof parsed === 'object' && typeof (parsed as { error?: unknown }).error === 'string'
                    ? (parsed as { error: string }).error
                    : res.statusText || `HTTP ${res.status}`;
            throw new ApiError(res.status, message, parsed);
        }
        return parsed as T;
    };
    return {
        get: (path) => call('GET', path),
        post: (path, body) => call('POST', path, body),
        put: (path, body) => call('PUT', path, body),
        patch: (path, body) => call('PATCH', path, body),
        del: (path) => call('DELETE', path),
    };
}

/** {@link createApi} for the dashboard's `fetch`, inside an extension. */
export function useApi(): ExtensionApi {
    const { fetch } = useDashboard();
    return useMemo(() => createApi(fetch), [fetch]);
}

/**
 * Calls `reload` shortly after server events matching `patterns` (`databases:migration-run`, `job:*`): a burst of events
 * causes one call, `delay` ms after the last. `reload` may change on every render.
 */
export function useServerEvents(patterns: string | readonly string[], reload: () => void, delay = 500): void {
    const { onServerEvent } = useDashboard();
    const reloadRef = useRef(reload);
    useEffect(() => {
        reloadRef.current = reload;
    });
    const key = typeof patterns === 'string' ? patterns : patterns.join('\n');
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const fire = () => {
            clearTimeout(timer);
            timer = setTimeout(() => reloadRef.current(), delay);
        };
        const offs = key.split('\n').map((pattern) => onServerEvent(pattern, fire));
        return () => {
            clearTimeout(timer);
            offs.forEach((off) => off());
        };
    }, [onServerEvent, key, delay]);
}
