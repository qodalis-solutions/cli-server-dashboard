import { createContext, useContext, useEffect, useMemo, useRef, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { KitProvider } from '../i18n/text';
import { EXTENSION_SCOPE, scopeOverlays } from '../components/overlay';
import { useLiveReloadFrom, type LiveReloadOptions } from '../hooks/liveReload';
import type {
    ConfigEditorMount,
    ConfigEditorProps,
    DashboardExtension,
    DashboardExtensionConfig,
    DashboardExtensionContext,
    DashboardMount,
    DashboardOverview,
    OverviewCardSize,
} from './types';

const ExtensionContext = createContext<DashboardExtensionContext | null>(null);

/**
 * Mounts a React root holding `App` with the dashboard's context and the kit's language; re-renders on theme, language,
 * path and settings changes.
 */
function mountReact(App: ComponentType): DashboardMount {
    return (element, context) => {
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
            // Older dashboards have no settings
            context.onConfigChange?.((config) => update({ config })) ?? (() => {}),
        ];
        render();
        return () => {
            off.forEach((unsubscribe) => unsubscribe());
            root.unmount();
        };
    };
}

/** An Overview card as a React component (rendered with `useDashboard()` available). */
export interface OverviewCardComponent {
    id: string;
    size: OverviewCardSize;
    component: ComponentType;
}

export interface ExtensionOptions {
    /** Cards and attention items for the dashboard's Overview (register the module with `widgets: ["overview"]`). */
    overview?: {
        cards?: OverviewCardComponent[];
        attention?: DashboardOverview['attention'];
    };
    /** Entries for the command palette (register the module with `widgets: ["palette"]`). */
    palette?: DashboardExtension['palette'];
    /**
     * Inputs for the dashboard's Config page by `editor` hint, as React components (register the module with
     * `widgets: ["config"]`). They render with `useDashboard()` available and again on every change of their props.
     */
    configEditors?: Record<string, ComponentType<ConfigEditorProps>>;
}

/** A React config editor as a {@link ConfigEditorMount}: one root per entry, rendered again on every update. */
export function mountConfigEditor(Editor: ComponentType<ConfigEditorProps>): ConfigEditorMount {
    return (element, props, context) => {
        const root = createRoot(element);
        const render = (current: ConfigEditorProps) =>
            root.render(
                <ExtensionContext.Provider value={context}>
                    <KitProvider locale={context.language}>
                        <Editor {...current} />
                    </KitProvider>
                </ExtensionContext.Provider>,
            );
        render(props);
        return { update: render, unmount: () => root.unmount() };
    };
}

/**
 * The extension for a React component: mounts a React root holding `App` with the dashboard's
 * context (`useDashboard()`) and the kit's language, and renders again when the theme, the
 * language or the extension's path changes. `options.overview` adds cards to the dashboard's Overview.
 *
 * @example
 * ```tsx
 * export default defineExtension(() => {
 *     const { user } = useDashboard();
 *     return <PageHeader title={`Hello ${user.name}`} />;
 * }, {
 *     overview: { cards: [{ id: 'count', size: 'stat', component: CountCard }] },
 * });
 * ```
 */
export function defineExtension(App: ComponentType, options: ExtensionOptions = {}): DashboardExtension {
    // This bundle's modals and menus render inside the extension's style scope (see EXTENSION_SCOPE)
    scopeOverlays(EXTENSION_SCOPE);
    const overview = options.overview;
    return {
        mount: mountReact(App),
        ...(overview
            ? {
                  overview: {
                      cards: (overview.cards ?? []).map((card) => ({ id: card.id, size: card.size, mount: mountReact(card.component) })),
                      ...(overview.attention ? { attention: overview.attention } : {}),
                  },
              }
            : {}),
        ...(options.palette ? { palette: options.palette } : {}),
        ...(options.configEditors
            ? { configEditors: Object.fromEntries(Object.entries(options.configEditors).map(([hint, Editor]) => [hint, mountConfigEditor(Editor)])) }
            : {}),
    };
}

/** The dashboard's context inside an extension made with {@link defineExtension}. */
export function useDashboard(): DashboardExtensionContext {
    const context = useContext(ExtensionContext);
    if (!context) throw new Error('useDashboard() is only available inside defineExtension');
    return context;
}

/**
 * A marketplace plugin's settings (`qodalis.config` of its package.json): the stored values over the defaults, the
 * component rendering again when they change (Config page, `config set`). `undefined` for built-in extensions; `{}`
 * when the dashboard could not read them, so fall back to your defaults:
 *
 * ```tsx
 * const config = useExtensionConfig<{ refreshSeconds?: number }>();
 * const seconds = config?.refreshSeconds ?? 30;
 * ```
 */
export function useExtensionConfig<T extends object = DashboardExtensionConfig>(): Partial<T> | undefined {
    return useDashboard().config as Partial<T> | undefined;
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

/** Options of an {@link ExtensionApi} call. */
export interface ApiCallOptions {
    /** An optional request: its 401 does not sign the user out. */
    quiet?: boolean;
}

export interface ExtensionApi {
    get<T = unknown>(path: string, options?: ApiCallOptions): Promise<T>;
    post<T = unknown>(path: string, body?: unknown): Promise<T>;
    put<T = unknown>(path: string, body?: unknown): Promise<T>;
    patch<T = unknown>(path: string, body?: unknown): Promise<T>;
    del<T = unknown>(path: string): Promise<T>;
}

/** JSON helpers over the context's `fetch`: parsed bodies, {@link ApiError} for non-2xx answers. */
export function createApi(fetcher: DashboardExtensionContext['fetch']): ExtensionApi {
    const call = async <T,>(method: string, path: string, body?: unknown, options: ApiCallOptions = {}): Promise<T> => {
        const res = await fetcher(path, {
            method,
            ...(options.quiet ? { quiet: true } : {}),
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
        get: (path, options) => call('GET', path, undefined, options),
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
 * Calls `reload` shortly after the dashboard's server events of the given types (`job:*`, `fs:changed`, …): a burst
 * of events causes one reload, `delay` ms after the last; `paused` keeps them for later, `filter` picks events.
 */
export function useLiveReload(patterns: string | readonly string[], reload: () => void, options: LiveReloadOptions = {}): void {
    const { onServerEvent } = useDashboard();
    useLiveReloadFrom(onServerEvent, patterns, reload, options);
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
