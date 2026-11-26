import { useMemo, useState, type ReactNode } from 'react';
import { useKitText } from '../i18n/text';
import { serverPluginMarketplaceHref, watchMissingApi, type Fetcher, type ServerPluginPackages, type ServerPluginRequirement } from './serverPluginApi';

const PLATFORMS: ReadonlyArray<[keyof ServerPluginPackages, string, (pkg: string) => string]> = [
    ['node', 'Node', (pkg) => `npm install ${pkg}`],
    ['python', 'Python', (pkg) => `pip install ${pkg}`],
    ['dotnet', '.NET', (pkg) => `dotnet add package ${pkg}`],
];

/**
 * The page of a dashboard plugin whose server plugin is not installed: which one, a button opening it in the
 * marketplace's server plugins (unless it is added in code only), and the packages to add in code.
 */
export function MissingServerPlugin({ requirement }: { requirement: ServerPluginRequirement }) {
    const { t } = useKitText();
    const packages = PLATFORMS.filter(([platform]) => requirement.packages[platform]);
    return (
        <div className="p-4 sm:p-6">
            <div role="alert" data-testid="missing-server-plugin" className="rounded-xl border border-warning/40 bg-warning/[0.06] p-4 sm:p-5 space-y-3 max-w-3xl">
                <div>
                    <h2 className="text-sm font-semibold text-heading">{t('serverPluginMissing', { title: requirement.title })}</h2>
                    <p className="text-xs text-muted mt-1">{t('serverPluginMissingHint', { title: requirement.title })}</p>
                </div>
                {!requirement.codeOnly && (
                    <a
                        href={serverPluginMarketplaceHref(requirement.id)}
                        className="inline-flex items-center px-3 py-1.5 text-xs rounded-lg bg-primary text-on-primary hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                        {t('serverPluginOpen')}
                    </a>
                )}
                {packages.length > 0 && (
                    <div className="space-y-1">
                        <p className="text-xs text-subtle">{t('serverPluginFromCode')}</p>
                        <ul className="space-y-0.5">
                            {packages.map(([platform, label, command]) => (
                                <li key={platform} className="text-[11px] font-mono text-text break-all">
                                    <span className="text-subtle">{label}: </span>
                                    {command(requirement.packages[platform]!)}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Renders `children` with an extension `fetch` that watches the plugin's route ({@link watchMissingApi}); when the
 * route is missing, {@link MissingServerPlugin} replaces the page. `provide` gives `children` the watched fetch.
 */
export function RequireServerPlugin({ requirement, fetcher, provide }: {
    requirement: ServerPluginRequirement;
    fetcher: Fetcher;
    provide: (fetcher: Fetcher) => ReactNode;
}) {
    const [missing, setMissing] = useState(false);
    const watched = useMemo(() => watchMissingApi(fetcher, requirement.api, () => setMissing(true)), [fetcher, requirement.api]);
    if (missing) return <MissingServerPlugin requirement={requirement} />;
    return <>{provide(watched)}</>;
}
