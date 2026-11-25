import type { ConfigEntry, ConfigValue, MarketplaceConfigEntry } from '../../types';
import { editChange, formatDuration, isChange, validateValue, type Edit, type ValueProblem } from '../config/configValue';
import type { MessageKey, MessageParams } from '../../i18n';

/**
 * A plugin's setting as a Config page entry, so the install and update dialogs use the Config page's inputs and
 * validators: `value` is what the field starts from (the default on install, the current value on update).
 */
export function settingsEntry(entry: MarketplaceConfigEntry, value: ConfigValue = entry.default): ConfigEntry {
  return {
    key: entry.key,
    label: entry.label || entry.key,
    description: entry.description ?? '',
    type: entry.type,
    value,
    default: entry.default,
    source: 'default',
    mutable: true,
    requiresRestart: false,
    sensitive: false,
    ...(entry.validation ? { validation: entry.validation } : {}),
  };
}

/**
 * The value an update starts from: the current one when the new version still has the key and the value passes its
 * rules, else the new default (what the server does too: such a value is dropped and reported in `configDropped`).
 */
export function updateValue(entry: MarketplaceConfigEntry, current: Record<string, ConfigValue> | undefined): ConfigValue {
  if (!current || !(entry.key in current)) return entry.default;
  const value = current[entry.key];
  return validateValue(entry, value) ? entry.default : value;
}

/**
 * What the dialog sends and what keeps it from sending. Only the changed settings are sent (a value different from
 * the one the field started from): untouched settings keep following the plugin's defaults on install, and keep their
 * stored values on update.
 */
export function settingsChanges(entries: readonly ConfigEntry[], edits: Readonly<Record<string, Edit>>): {
  changes: Record<string, ConfigValue>;
  problems: Record<string, ValueProblem>;
} {
  const changes: Record<string, ConfigValue> = {};
  const problems: Record<string, ValueProblem> = {};
  for (const entry of entries) {
    const edit = edits[entry.key];
    if (!edit || !isChange(entry, edit)) continue;
    const result = editChange(entry, edit);
    if ('problem' in result) problems[entry.key] = result.problem;
    else changes[entry.key] = result.value;
  }
  return { changes, problems };
}

/** A part of a rule's text: a translation key of the `marketplace` namespace and its parameters. */
export interface RulePart {
  key: MessageKey;
  params?: MessageParams;
}

/** `5 to 3600`, `at least 5`, `at most 10`: a range as the rules give it, or null without bounds. */
function range(min: number | undefined, max: number | undefined, show: (n: number) => string | number): RulePart | null {
  if (min !== undefined && max !== undefined) return { key: 'marketplace.ruleRange', params: { min: show(min), max: show(max) } };
  if (min !== undefined) return { key: 'marketplace.ruleMin', params: { min: show(min) } };
  if (max !== undefined) return { key: 'marketplace.ruleMax', params: { max: show(max) } };
  return null;
}

/**
 * A setting's rules for the details' Settings table, in reading order: required, the range (of the value, a duration,
 * the length of a text or the number of items of a list), the choices, the pattern. Empty without rules.
 */
export function ruleParts(entry: MarketplaceConfigEntry, t: (key: MessageKey, params?: MessageParams) => string): string[] {
  const rules = entry.validation ?? {};
  const parts: string[] = [];
  if (rules.required) parts.push(t('marketplace.ruleRequired'));
  const bounds = range(rules.min, rules.max, entry.type === 'duration' ? formatDuration : n => n);
  if (bounds) {
    const text = t(bounds.key, bounds.params);
    if (entry.type === 'string' || entry.type === 'url') parts.push(t('marketplace.ruleLength', { range: text }));
    else if (entry.type === 'string[]') parts.push(t('marketplace.ruleItems', { range: text }));
    else parts.push(text);
  }
  if (rules.options?.length) parts.push(t('marketplace.ruleOneOf', { options: rules.options.join(', ') }));
  if (rules.pattern) parts.push(t('marketplace.rulePattern', { pattern: rules.pattern }));
  return parts;
}
