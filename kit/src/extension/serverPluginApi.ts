/** The server plugin a dashboard page needs: its declaration, and how its absence is told from an answer. */

/** The server plugins a platform installs a dashboard page's API with. */
export interface ServerPluginPackages {
    node?: string;
    python?: string;
    dotnet?: string;
}

/**
 * The server plugin a dashboard page needs: the one serving its API. Official modules declare it in
 * `defineExtension(App, { serverPlugin })` and their package.json (`qodalis.serverPackages`, read by the marketplace);
 * the marketplace's `requires.serverPackage` of the dashboard plugin is the same relation.
 */
export interface ServerPluginRequirement {
    /** Its id in the marketplace (`data-explorer`): the server plugins tab opens on it. */
    id: string;
    /** Its name as the page says it (`Data explorer`). */
    title: string;
    /** Its package on each platform. */
    packages: ServerPluginPackages;
    /**
     * The route the page loads first (`/api/qcli/data-explorer/sources`, no query): when the server answers it 404
     * without a JSON `{ error }` (Express's "Cannot GET", an empty .NET 404, FastAPI's `detail`), the plugin is missing.
     */
    api: string;
    /** It is added in the server's code only (not installable from the marketplace). */
    codeOnly?: boolean;
}

/**
 * True when a response says the route does not exist (the server plugin serving it is not installed): 404 whose body
 * is not a JSON object with an `error` (a 404 of the plugin itself, `{ "error": "unknown data source" }`, carries one).
 */
export function isMissingApi(status: number, body: string): boolean {
    if (status !== 404) return false;
    const text = body.trim();
    if (!text.startsWith('{')) return true;
    try {
        const parsed = JSON.parse(text) as { error?: unknown };
        return typeof parsed?.error !== 'string';
    } catch {
        return true;
    }
}

export type Fetcher = (path: string, init?: RequestInit & { quiet?: boolean }) => Promise<Response>;

/** The path of a request without its query and the server's origin (`https://host/api/x?y` → `/api/x`). */
function routeOf(path: string): string {
    const bare = path.split(/[?#]/)[0];
    const at = bare.indexOf('/api/');
    return (at === -1 ? bare : bare.slice(at)).replace(/\/+$/, '');
}

/**
 * The extension's `fetch`, watching its answers: `onMissing` runs when the plugin's {@link ServerPluginRequirement.api}
 * route is answered as missing ({@link isMissingApi}). No request of its own; the answer is passed on unchanged.
 */
export function watchMissingApi(fetcher: Fetcher, api: string, onMissing: () => void): Fetcher {
    const route = routeOf(api);
    return async (path, init) => {
        const res = await fetcher(path, init);
        if (res.status === 404 && routeOf(path) === route) {
            const body = await res.clone().text().catch(() => '');
            if (isMissingApi(res.status, body)) onMissing();
        }
        return res;
    };
}

/** The dashboard's Plugins → Marketplace → Server plugins tab searching `id`, below the dashboard's base path. */
export function serverPluginMarketplaceHref(id: string, here = typeof window === 'undefined' ? '' : window.location.pathname): string {
    const at = here.indexOf('/x/');
    const base = at === -1 ? '' : here.slice(0, at);
    return `${base}/plugins?${new URLSearchParams({ tab: 'marketplace', kind: 'server', q: id })}`;
}
