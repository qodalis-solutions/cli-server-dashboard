import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getCapabilities, getStatus } from '../api/status';
import { getPlugins } from '../api/plugins';
import { apiFetch } from '../api/client';
import type { CapabilitiesResponse, PluginsListResponse, ServerStatusResponse } from '../types';

/** Server features that gate dashboard pages. */
export type Feature = 'jobs' | 'filesystem' | 'audit' | 'shell' | 'tokens';

interface FeaturesState {
  features: string[];
  loading: boolean;
  hasFeature: (feature: string) => boolean;
}

const FeaturesContext = createContext<FeaturesState | null>(null);

/** Plugin module names that provide a feature (older servers without `enabledFeatures`). */
const PLUGIN_PATTERNS: Record<Exclude<Feature, 'shell' | 'audit' | ProbedFeature>, RegExp> = {
  jobs: /\bjobs?\b/i,
  filesystem: /\b(filesystem|file-?system|files)\b/i,
};

/** Features no status field reports: the dashboard asks their endpoint (a list answered means present). */
type ProbedFeature = 'tokens';
const PROBES: Record<ProbedFeature, string> = {
  // API tokens of the users plugin (also for linked terminals)
  tokens: '/api/v1/qcli/tokens',
};

/** What each probe answered (null: failed), by feature. */
export type ProbeResults = Partial<Record<ProbedFeature, unknown>>;

/**
 * What the server provides, from what the dashboard already loads:
 * - `shell` from `GET /api/v1/qcli/capabilities` (`shell: true`);
 * - `jobs`, `filesystem`, `audit` from the admin status (`enabledFeatures`), plus `capabilities.features`;
 *   servers whose status has no `enabledFeatures` fall back to the plugin list (`/plugins`).
 * - `tokens` from probing its endpoint (`probes`): a list answered means present.
 * Anything that failed to load counts as missing.
 */
export function resolveFeatures(
  status: ServerStatusResponse | null,
  capabilities: CapabilitiesResponse | null,
  plugins: PluginsListResponse | null,
  probes: ProbeResults = {},
): string[] {
  const features = new Set<string>();
  status?.enabledFeatures?.forEach(f => features.add(f));
  if (Array.isArray(capabilities?.features)) capabilities.features.forEach(f => features.add(String(f)));
  if (capabilities && (capabilities.shell === true || capabilities.shell === 'true')) features.add('shell');

  if (!Array.isArray(status?.enabledFeatures) && Array.isArray(plugins)) {
    for (const [feature, pattern] of Object.entries(PLUGIN_PATTERNS)) {
      if (plugins.some(p => p.enabled !== false && (pattern.test(p.id ?? '') || pattern.test(p.name ?? '')))) {
        features.add(feature);
      }
    }
  }
  for (const [feature, answer] of Object.entries(probes)) {
    if (Array.isArray(answer)) features.add(feature);
  }
  return [...features];
}

const valueOf = <T,>(result: PromiseSettledResult<T>): T | null =>
  result.status === 'fulfilled' ? result.value : null;

export function FeaturesProvider({ children }: { children: ReactNode }) {
  const [features, setFeatures] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const probed = Object.keys(PROBES) as ProbedFeature[];
    // Quiet: a probe answered 401 (e.g. a host's own sign-in without the users plugin) only means "missing"
    const probes = probed.map(feature => apiFetch<unknown>(PROBES[feature], { quiet: true }));
    Promise.allSettled([getStatus(), getCapabilities(), getPlugins(), ...probes]).then(([status, caps, plugins, ...answers]) => {
      if (cancelled) return;
      const probeResults: ProbeResults = Object.fromEntries(probed.map((feature, i) => [feature, valueOf(answers[i])]));
      setFeatures(resolveFeatures(valueOf(status), valueOf(caps), valueOf(plugins), probeResults));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasFeature = useCallback((feature: string) => features.includes(feature), [features]);
  const value = useMemo(() => ({ features, loading, hasFeature }), [features, loading, hasFeature]);

  return <FeaturesContext.Provider value={value}>{children}</FeaturesContext.Provider>;
}

export function useFeatures(): FeaturesState {
  const ctx = useContext(FeaturesContext);
  if (!ctx) throw new Error('useFeatures must be used within FeaturesProvider');
  return ctx;
}
