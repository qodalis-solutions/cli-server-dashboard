// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { defineExtension, useDashboard, useExtensionConfig } from './defineExtension';
import { fakeDashboard, json, mountExtension } from '../testing';
import type { DashboardExtensionConfig, DashboardExtensionContext } from './types';

afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
});

const server = () => json({});

function Settings() {
    const config = useExtensionConfig<{ refreshSeconds: number; mode: string }>();
    if (config === undefined) return <p>built-in</p>;
    return <p>{`every ${config.refreshSeconds ?? 30}s, ${config.mode ?? 'compact'}`}</p>;
}

function FromContext() {
    const { config } = useDashboard();
    return <p>{`context: ${JSON.stringify(config ?? null)}`}</p>;
}

describe('defineExtension: a marketplace plugin’s settings', () => {
    it('passes ctx.config on mount, and useExtensionConfig() reads it', async () => {
        const { context } = fakeDashboard('kanban', { server, config: { refreshSeconds: 60, mode: 'full' } });
        expect(context.config).toEqual({ refreshSeconds: 60, mode: 'full' });
        expect(context.extension.source).toBe('marketplace');
        const unmount = await mountExtension(defineExtension(Settings), context);
        expect(screen.getByText('every 60s, full')).toBeTruthy();
        unmount();
    });

    it('renders again with new values on onConfigChange (live), through the hook and the context', async () => {
        const { context, setConfig } = fakeDashboard('kanban', { server, config: { refreshSeconds: 60 } });
        const unmount = await mountExtension(defineExtension(() => (<><Settings /><FromContext /></>)), context);
        expect(screen.getByText('every 60s, compact')).toBeTruthy();
        setConfig({ refreshSeconds: 5, mode: 'full' });
        expect(screen.getByText('every 5s, full')).toBeTruthy();
        expect(screen.getByText('context: {"refreshSeconds":5,"mode":"full"}')).toBeTruthy();
        unmount();
    });

    it('stops listening when unmounted', async () => {
        const { context } = fakeDashboard('kanban', { server, config: {} });
        const listeners: Array<(config: DashboardExtensionConfig) => void> = [];
        let removed = 0;
        const counting: DashboardExtensionContext = {
            ...context,
            onConfigChange: (fn) => {
                listeners.push(fn);
                return () => void removed++;
            },
        };
        const unmount = await mountExtension(defineExtension(Settings), counting);
        expect(listeners).toHaveLength(1);
        unmount();
        expect(removed).toBe(1);
    });

    it('gives built-in extensions undefined', async () => {
        const { context } = fakeDashboard('jobs', { server });
        expect(context.config).toBeUndefined();
        expect(context.extension.source).toBeUndefined();
        const unmount = await mountExtension(defineExtension(Settings), context);
        expect(screen.getByText('built-in')).toBeTruthy();
        unmount();
    });

    it('mounts on a dashboard without settings (no config, no onConfigChange)', async () => {
        const { context } = fakeDashboard('jobs', { server });
        const older = { ...context } as Partial<DashboardExtensionContext>;
        delete older.onConfigChange;
        delete older.config;
        const unmount = await mountExtension(defineExtension(Settings), older as DashboardExtensionContext);
        expect(screen.getByText('built-in')).toBeTruthy();
        unmount();
    });
});
