/** An extension as the server lists it (`GET /api/v1/qcli/dashboard/extensions`, see docs/extensions.md). */
export interface DashboardExtensionInfo {
    id: string;
    title: string;
    titles?: Record<string, string>;
    icon?: string;
    /** Sidebar section (`overview`, `operations`, `data`, `access`, `system`), or `account`: the account menu. */
    group?: string;
    order?: number;
    permission?: string;
    entry: string;
    styles?: string[];
    version?: string;
    /**
     * Slots the module fills besides its page: `overview` (cards and attention items on the dashboard's Overview),
     * `palette` (entries in the command palette).
     */
    widgets?: string[];
    /**
     * Where the module searches, below its page, ending where the text goes (e.g. `/?q=`): the command palette offers
     * "Search <title> for …".
     */
    search?: string;
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
     * dashboard's credentials and JSON headers; a 401 signs the user out as the dashboard's own requests do, unless
     * `quiet` (an optional request the user may not be allowed: its 401 is just an answer).
     */
    fetch(path: string, init?: RequestInit & { quiet?: boolean }): Promise<Response>;
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
     * Server events (`/ws/v1/qcli/events`, the dashboard's own socket): `pattern` is a type (`databases:migration-run`), a
     * prefix (`job:*`) or `*`. The event is the message as the server sent it (`{ type, ... }`). Returns the
     * unsubscribe function.
     */
    onServerEvent(pattern: string, listener: (event: Record<string, unknown>) => void): () => void;
    notify(message: string, kind?: 'success' | 'error' | 'info'): void;
    confirm(options: { title: string; message?: string; confirmText?: string; danger?: boolean }): Promise<boolean>;
    dashboardVersion: string;
    apiVersion: 1;
}

/** Renders into `element` with the dashboard's context; returns a cleanup function, or nothing. */
export type DashboardMount = (
    element: HTMLElement,
    context: DashboardExtensionContext,
) => void | (() => void) | Promise<void | (() => void)>;

/**
 * Where an Overview card goes: `stat` in the row of figures at the top (a `StatCard`), `half` beside another half
 * card, `full` across the page.
 */
export type OverviewCardSize = 'stat' | 'half' | 'full';

/** A card a module adds to the dashboard's Overview. Its context's `navigate` opens the module's page. */
export interface OverviewCard {
    /** Unique within the module. */
    id: string;
    size: OverviewCardSize;
    mount: DashboardMount;
}

/** Something on the Overview's "Needs attention" list (a failing job, a database with problems). */
export interface AttentionItem {
    /** Unique within the module. */
    id: string;
    level: 'error' | 'warning';
    title: string;
    detail?: string;
    /** When it happened (ISO): newest first in the list. */
    time?: string;
    /** Below the module's page (`/x/<id><path>`), opened on click. */
    path?: string;
}

/** What a module shows on the Overview (registered with `widgets: ["overview"]`). */
export interface DashboardOverview {
    cards?: OverviewCard[];
    /** The module's items for "Needs attention"; asked when the Overview opens and again every minute. */
    attention?(context: DashboardExtensionContext): Promise<AttentionItem[]>;
}

/** An entry a module adds to the command palette (Ctrl+K), listed under its title. */
export interface PaletteEntry {
    /** Unique within the module. */
    id: string;
    label: string;
    /** Shown after the label, also searched (an id, a group). */
    hint?: string;
    icon?: string;
    /** Below the module's page (`/x/<id><path>`). */
    path: string;
}

/** An entry of the dashboard's Config page, as a config editor sees it (the server's config provider entry). */
export interface ConfigEditorEntry {
    key: string;
    label: string;
    description: string;
    /** `string`, `number`, `boolean`, `string[]`, `enum`, `secret`, `json`, `duration` or `url`. */
    type: string;
    /** The editor hint the entry asked for (`cron`, `origins`, ...). */
    editor?: string;
    default: unknown;
    validation?: { min?: number; max?: number; pattern?: string; options?: string[]; required?: boolean };
}

/** What a config editor renders: the entry, the value being edited, and where to report a new one. */
export interface ConfigEditorProps {
    entry: ConfigEditorEntry;
    /** The value being edited (the saved value until the user changes it). */
    value: unknown;
    /** Reports the new value; the page validates it with the entry's rules and shows it in the diff before saving. */
    onChange(value: unknown): void;
    /** Read-only entry, or the page is saving. */
    disabled: boolean;
    /** The page's message for the current value (a validation or server error), if any. */
    error?: string;
}

/** A mounted config editor: `update` gets new props on every change, `unmount` removes it. */
export interface ConfigEditorHandle {
    update(props: ConfigEditorProps): void;
    unmount?(): void;
}

/**
 * Renders an input for config entries with one `editor` hint into `element` (Config page, a module registered with
 * `widgets: ["config"]`).
 */
export type ConfigEditorMount = (
    element: HTMLElement,
    props: ConfigEditorProps,
    context: DashboardExtensionContext,
) => ConfigEditorHandle | void;

/** The module an extension's entry exports (default export, or a named `extension`). */
export interface DashboardExtension {
    /** Renders the page into `element`; returns a cleanup function, or nothing. */
    mount: DashboardMount;
    /** Cards and attention items for the dashboard's Overview (registered with `widgets: ["overview"]`). */
    overview?: DashboardOverview;
    /** Entries for the command palette, asked each time it opens (registered with `widgets: ["palette"]`). */
    palette?(context: DashboardExtensionContext): Promise<PaletteEntry[]>;
    /**
     * Inputs for the Config page by `editor` hint (`{ cron: mountCronEditor }`), used for every entry with that hint
     * (registered with `widgets: ["config"]`).
     */
    configEditors?: Record<string, ConfigEditorMount>;
}
