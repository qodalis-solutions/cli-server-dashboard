import type { ConfigEntry, ConfigEntryType, ConfigValue } from '../../types';
import type { MessageKey, MessageParams } from '../../i18n';

/**
 * What an input holds while the user edits an entry. Text inputs (string, url, duration, enum, secret, number, json)
 * hold the text as typed, so half-typed numbers and JSON stay as they are; booleans hold a boolean, lists a string[].
 */
export type Draft = string | boolean | string[];

/**
 * One pending change of an entry: a draft of the built-in input, a value from a custom editor, or back to the default
 * (a cleared secret, a removed free key).
 */
export type Edit = { kind: 'set'; draft: Draft } | { kind: 'value'; value: ConfigValue } | { kind: 'reset' };

/** A problem with a value, as a translation key of the `config` namespace and its parameters. */
export interface ValueProblem {
  key: MessageKey;
  params?: MessageParams;
}

const DURATION = /^(\d+)(ms|s|m|h|d)$/;
const DURATION_MS: Record<string, number> = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** Milliseconds of a duration such as `500ms`, `30s`, `15m`, `12h` or `7d`; undefined when it is not one. */
export function parseDuration(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = DURATION.exec(value.trim());
  return match ? Number(match[1]) * DURATION_MS[match[2]] : undefined;
}

/** The shortest whole unit for milliseconds: 90000 → `90s`, 3600000 → `1h`. */
export function formatDuration(ms: number): string {
  const whole = Math.round(ms);
  if (whole === 0) return '0s';
  for (const unit of ['d', 'h', 'm', 's'] as const) {
    if (whole % DURATION_MS[unit] === 0) return `${whole / DURATION_MS[unit]}${unit}`;
  }
  return `${whole}ms`;
}

/** The input's starting content for a value. Secrets start empty: their value is never sent to the dashboard. */
export function toDraft(type: ConfigEntryType, value: ConfigValue): Draft {
  switch (type) {
    case 'boolean':
      return value === true;
    case 'string[]':
      return Array.isArray(value) ? value.map(String) : [];
    case 'json':
      return value === null || value === undefined ? '' : JSON.stringify(value, null, 2);
    case 'secret':
      return '';
    default:
      return value === null || value === undefined ? '' : String(value);
  }
}

/** The value a draft stands for, or the reason it is not one (a number or JSON that does not parse). */
export function fromDraft(type: ConfigEntryType, draft: Draft): { value: ConfigValue } | { problem: ValueProblem } {
  switch (type) {
    case 'boolean':
      return { value: draft === true };
    case 'string[]':
      return { value: Array.isArray(draft) ? draft : [] };
    case 'number': {
      const text = String(draft).trim();
      const n = Number(text);
      if (text === '' || !Number.isFinite(n)) return { problem: { key: 'config.invalidNumber' } };
      return { value: n };
    }
    case 'json': {
      const text = String(draft).trim();
      if (text === '') return { problem: { key: 'config.invalidJson' } };
      try {
        return { value: JSON.parse(text) as ConfigValue };
      } catch {
        return { problem: { key: 'config.invalidJson' } };
      }
    }
    default:
      return { value: String(draft) };
  }
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

function matches(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return true; // a pattern the browser cannot read is the server's to check
  }
}

/**
 * The same rules the server applies (`validateCliConfigValue`), checked while typing so most mistakes show before
 * saving; the server checks again and its per-key errors are shown the same way.
 */
export function validateValue(entry: Pick<ConfigEntry, 'type' | 'validation'>, value: ConfigValue): ValueProblem | null {
  const rules = entry.validation ?? {};
  if (rules.required && isEmpty(value)) return { key: 'config.required' };
  const text = (s: string): ValueProblem | null => {
    if (rules.min !== undefined && s.length < rules.min) return { key: 'config.minLength', params: { min: rules.min } };
    if (rules.max !== undefined && s.length > rules.max) return { key: 'config.maxLength', params: { max: rules.max } };
    if (rules.pattern !== undefined && !matches(rules.pattern, s)) return { key: 'config.pattern', params: { pattern: rules.pattern } };
    return null;
  };
  switch (entry.type) {
    case 'string':
    case 'secret': {
      if (typeof value !== 'string') return null;
      if (value === '' && !rules.required) return null;
      const problem = text(value);
      if (problem) return problem;
      if (rules.options?.length && !rules.options.includes(value)) return { key: 'config.oneOf', params: { options: rules.options.join(', ') } };
      return null;
    }
    case 'url': {
      if (typeof value !== 'string' || value === '') return null;
      let ok = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
      if (ok) {
        try {
          new URL(value);
        } catch {
          ok = false;
        }
      }
      return ok ? text(value) : { key: 'config.invalidUrl' };
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return { key: 'config.invalidNumber' };
      if (rules.min !== undefined && value < rules.min) return { key: 'config.min', params: { min: rules.min } };
      if (rules.max !== undefined && value > rules.max) return { key: 'config.max', params: { max: rules.max } };
      return null;
    }
    case 'enum': {
      const options = rules.options ?? [];
      return typeof value === 'string' && options.includes(value) ? null : { key: 'config.oneOf', params: { options: options.join(', ') } };
    }
    case 'string[]': {
      if (!Array.isArray(value)) return null;
      if (rules.min !== undefined && value.length < rules.min) return { key: 'config.minItems', params: { min: rules.min } };
      if (rules.max !== undefined && value.length > rules.max) return { key: 'config.maxItems', params: { max: rules.max } };
      for (const item of value as string[]) {
        if (rules.pattern !== undefined && !matches(rules.pattern, item)) return { key: 'config.itemPattern', params: { item, pattern: rules.pattern } };
        if (rules.options?.length && !rules.options.includes(item)) return { key: 'config.itemOneOf', params: { item, options: rules.options.join(', ') } };
      }
      return null;
    }
    case 'duration': {
      const ms = parseDuration(value);
      if (ms === undefined) return { key: 'config.invalidDuration' };
      if (rules.min !== undefined && ms < rules.min) return { key: 'config.min', params: { min: formatDuration(rules.min) } };
      if (rules.max !== undefined && ms > rules.max) return { key: 'config.max', params: { max: formatDuration(rules.max) } };
      return null;
    }
    default:
      return null;
  }
}

/** What an edit sends (`null` resets), or the problem that keeps it from being saved. */
export function editChange(entry: ConfigEntry, edit: Edit): { value: ConfigValue } | { problem: ValueProblem } {
  if (edit.kind === 'reset') return { value: null };
  const parsed = edit.kind === 'value' ? { value: edit.value } : fromDraft(entry.type, edit.draft);
  if ('problem' in parsed) return parsed;
  const problem = validateValue(entry, parsed.value);
  return problem ? { problem } : parsed;
}

/** Two values are the same setting (deep, key order of objects included as JSON sees it). */
export function sameValue(a: ConfigValue | undefined, b: ConfigValue | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Whether an edit changes anything: a draft equal to the current value is no change. A secret draft always is. */
export function isChange(entry: ConfigEntry, edit: Edit): boolean {
  if (edit.kind === 'reset') return entry.sensitive ? entry.isSet === true : !sameValue(entry.value, entry.default);
  if (entry.sensitive || entry.type === 'secret') return true;
  const parsed = edit.kind === 'value' ? { value: edit.value } : fromDraft(entry.type, edit.draft);
  return !('value' in parsed) || !sameValue(parsed.value, entry.value);
}

/** A value for the diff and the read-only view; secrets show only whether they are set. */
export function displayValue(value: ConfigValue | undefined): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value === '' ? '""' : value;
  if (Array.isArray(value) && value.every(v => typeof v === 'string')) return value.length ? (value as string[]).join(', ') : '[]';
  return JSON.stringify(value);
}

/** Whether an entry matches the search text (key, label, description, case-insensitive). */
export function entryMatches(entry: ConfigEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [entry.key, entry.label, entry.description].some(s => typeof s === 'string' && s.toLowerCase().includes(q));
}

/** The type a new free key gets from what was typed into the "add" row. */
export const FREE_KEY_TYPES: readonly ConfigEntryType[] = ['string', 'number', 'boolean', 'string[]', 'json'];

/** Keys the server accepts (`CLI_CONFIG_KEY`). */
export const CONFIG_KEY = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;

/** A free key added in the dashboard, as an entry of its section until it is saved. */
export function freeEntry(key: string, type: ConfigEntryType): ConfigEntry {
  return {
    key,
    label: key,
    description: '',
    type,
    value: null,
    default: null,
    source: 'runtime',
    mutable: true,
    requiresRestart: false,
    sensitive: false,
  };
}
