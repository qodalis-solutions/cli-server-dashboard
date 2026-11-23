/** An extension as the server lists it (`GET /api/v1/qcli/dashboard/extensions`, see docs/extensions.md). */
export interface DashboardExtensionInfo {
    id: string;
    title: string;
    titles?: Record<string, string>;
    icon?: string;
    group?: string;
    order?: number;
    permission?: string;
    entry: string;
    styles?: string[];
    version?: string;
}

export type DashboardTheme = 'light' | 'dark';

/** What the dashboard gives an extension when it mounts it (context API version 1). */
export interface DashboardExtensionContext {
    /** The extension's own registration. */
    extension: DashboardExtensionInfo;
    /** The server's API base, e.g. `https://host` or `https://host/prefix` (no trailing slash). */
    apiBase: string;
    /**
     * fetch against the server: a path (`/api/v1/qcli/...`) is resolved against `apiBase`, with the
     * dashboard's credentials and JSON headers; a 401 signs the user out as the dashboard's own requests do.
     */
    fetch(path: string, init?: RequestInit): Promise<Response>;
    user: { id: string; name: string; email?: string };
    permissions: string[];
    /** Wildcard-aware, the same matcher the dashboard uses. */
    hasPermission(permission: string): boolean;
    theme: DashboardTheme;
    onThemeChange(listener: (theme: DashboardTheme) => void): () => void;
    language: string;
    onLanguageChange(listener: (language: string) => void): () => void;
    /** The extension's own routing below `/x/<id>`: e.g. `/` or `/plugins/abc?tab=log`. */
    path: string;
    navigate(path: string, options?: { replace?: boolean }): void;
    onPathChange(listener: (path: string) => void): () => void;
    /**
     * Server events (`/ws/v1/qcli/events`, the dashboard's own socket): `pattern` is a type (`migrations:run`), a
     * prefix (`job:*`) or `*`. The event is the message as the server sent it (`{ type, ... }`). Returns the
     * unsubscribe function.
     */
    onServerEvent(pattern: string, listener: (event: Record<string, unknown>) => void): () => void;
    notify(message: string, kind?: 'success' | 'error' | 'info'): void;
    confirm(options: { title: string; message?: string; confirmText?: string; danger?: boolean }): Promise<boolean>;
    dashboardVersion: string;
    apiVersion: 1;
}

/** The module an extension's entry exports (default export, or a named `extension`). */
export interface DashboardExtension {
    /** Renders into `element`; returns a cleanup function, or nothing. */
    mount(element: HTMLElement, context: DashboardExtensionContext): void | (() => void) | Promise<void | (() => void)>;
}
