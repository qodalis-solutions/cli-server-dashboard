import { describe, expect, it } from 'vitest';
import type { ConfigEntry } from '../../types';
import {
  displayValue,
  editChange,
  entryMatches,
  formatDuration,
  fromDraft,
  isChange,
  parseDuration,
  toDraft,
  validateValue,
} from './configValue';

function entry(patch: Partial<ConfigEntry>): ConfigEntry {
  return {
    key: 'k', label: 'K', description: '', type: 'string', value: null, default: null, source: 'default',
    mutable: true, requiresRestart: false, sensitive: false, ...patch,
  };
}

describe('durations', () => {
  it('parses the server units and formats milliseconds back', () => {
    expect(parseDuration('500ms')).toBe(500);
    expect(parseDuration('30s')).toBe(30_000);
    expect(parseDuration('15m')).toBe(900_000);
    expect(parseDuration('12h')).toBe(43_200_000);
    expect(parseDuration('7d')).toBe(604_800_000);
    expect(parseDuration('7 days')).toBeUndefined();
    expect(parseDuration(5)).toBeUndefined();
    expect(formatDuration(3_600_000)).toBe('1h');
    expect(formatDuration(90_000)).toBe('90s');
    expect(formatDuration(1500)).toBe('1500ms');
    expect(formatDuration(0)).toBe('0s');
  });
});

describe('drafts', () => {
  it('start from the value by type; secrets start empty', () => {
    expect(toDraft('boolean', true)).toBe(true);
    expect(toDraft('string[]', ['a'])).toEqual(['a']);
    expect(toDraft('string[]', null)).toEqual([]);
    expect(toDraft('json', { a: 1 })).toBe('{\n  "a": 1\n}');
    expect(toDraft('json', null)).toBe('');
    expect(toDraft('number', 5)).toBe('5');
    expect(toDraft('secret', 'x')).toBe('');
    expect(toDraft('string', null)).toBe('');
  });

  it('parse numbers and JSON, or say why not', () => {
    expect(fromDraft('number', ' 42 ')).toEqual({ value: 42 });
    expect(fromDraft('number', '')).toEqual({ problem: { key: 'config.invalidNumber' } });
    expect(fromDraft('number', 'abc')).toEqual({ problem: { key: 'config.invalidNumber' } });
    expect(fromDraft('json', '{"a":[1]}')).toEqual({ value: { a: [1] } });
    expect(fromDraft('json', '{a:1}')).toEqual({ problem: { key: 'config.invalidJson' } });
    expect(fromDraft('json', ' ')).toEqual({ problem: { key: 'config.invalidJson' } });
    expect(fromDraft('boolean', false)).toEqual({ value: false });
    expect(fromDraft('string[]', ['x'])).toEqual({ value: ['x'] });
    expect(fromDraft('url', 'https://a')).toEqual({ value: 'https://a' });
  });
});

describe('validateValue (the server rules)', () => {
  it('required', () => {
    expect(validateValue({ type: 'string', validation: { required: true } }, '')?.key).toBe('config.required');
    expect(validateValue({ type: 'string[]', validation: { required: true } }, [])?.key).toBe('config.required');
    expect(validateValue({ type: 'string', validation: { required: true } }, 'x')).toBeNull();
  });

  it('string length, pattern and options; an empty optional string passes', () => {
    const rules = { min: 2, max: 4, pattern: '^[a-z]+$' };
    expect(validateValue({ type: 'string', validation: rules }, 'a')).toEqual({ key: 'config.minLength', params: { min: 2 } });
    expect(validateValue({ type: 'string', validation: rules }, 'abcde')).toEqual({ key: 'config.maxLength', params: { max: 4 } });
    expect(validateValue({ type: 'string', validation: rules }, 'AB')?.key).toBe('config.pattern');
    expect(validateValue({ type: 'string', validation: rules }, '')).toBeNull();
    expect(validateValue({ type: 'string', validation: { options: ['a', 'b'] } }, 'c')?.key).toBe('config.oneOf');
    expect(validateValue({ type: 'string', validation: { pattern: '(' } }, 'x')).toBeNull();
  });

  it('numbers with min and max', () => {
    expect(validateValue({ type: 'number', validation: { min: 1, max: 10 } }, 0)).toEqual({ key: 'config.min', params: { min: 1 } });
    expect(validateValue({ type: 'number', validation: { min: 1, max: 10 } }, 11)).toEqual({ key: 'config.max', params: { max: 10 } });
    expect(validateValue({ type: 'number', validation: { min: 1, max: 10 } }, 5)).toBeNull();
    expect(validateValue({ type: 'number' }, Number.NaN)?.key).toBe('config.invalidNumber');
  });

  it('enums', () => {
    expect(validateValue({ type: 'enum', validation: { options: ['debug', 'info'] } }, 'info')).toBeNull();
    expect(validateValue({ type: 'enum', validation: { options: ['debug', 'info'] } }, 'x')).toEqual({ key: 'config.oneOf', params: { options: 'debug, info' } });
  });

  it('lists: item count, item pattern and options', () => {
    expect(validateValue({ type: 'string[]', validation: { min: 1 } }, [])?.key).toBe('config.minItems');
    expect(validateValue({ type: 'string[]', validation: { max: 1 } }, ['a', 'b'])?.key).toBe('config.maxItems');
    expect(validateValue({ type: 'string[]', validation: { pattern: '^https?://' } }, ['ftp://x'])).toEqual({ key: 'config.itemPattern', params: { item: 'ftp://x', pattern: '^https?://' } });
    expect(validateValue({ type: 'string[]', validation: { options: ['a'] } }, ['b'])?.key).toBe('config.itemOneOf');
  });

  it('URLs must be absolute; empty is no URL', () => {
    expect(validateValue({ type: 'url' }, 'example.com')?.key).toBe('config.invalidUrl');
    expect(validateValue({ type: 'url' }, 'https://example.com/x')).toBeNull();
    expect(validateValue({ type: 'url' }, '')).toBeNull();
    expect(validateValue({ type: 'url', validation: { max: 10 } }, 'https://example.com')?.key).toBe('config.maxLength');
  });

  it('durations with min and max in milliseconds', () => {
    expect(validateValue({ type: 'duration' }, '10 minutes')?.key).toBe('config.invalidDuration');
    expect(validateValue({ type: 'duration', validation: { min: 60_000 } }, '30s')).toEqual({ key: 'config.min', params: { min: '1m' } });
    expect(validateValue({ type: 'duration', validation: { max: 3_600_000 } }, '2h')).toEqual({ key: 'config.max', params: { max: '1h' } });
    expect(validateValue({ type: 'duration' }, '15m')).toBeNull();
  });

  it('booleans and JSON have no rules beyond their type', () => {
    expect(validateValue({ type: 'boolean' }, true)).toBeNull();
    expect(validateValue({ type: 'json' }, { a: 1 })).toBeNull();
  });
});

describe('edits', () => {
  it('a reset sends null; a draft sends its value or its problem', () => {
    const e = entry({ type: 'number', value: 3, validation: { max: 5 } });
    expect(editChange(e, { kind: 'reset' })).toEqual({ value: null });
    expect(editChange(e, { kind: 'set', draft: '4' })).toEqual({ value: 4 });
    expect(editChange(e, { kind: 'set', draft: '9' })).toEqual({ problem: { key: 'config.max', params: { max: 5 } } });
    expect(editChange(e, { kind: 'value', value: 2 })).toEqual({ value: 2 });
  });

  it('a draft equal to the value is no change; a secret draft always is', () => {
    const e = entry({ type: 'string[]', value: ['a'] });
    expect(isChange(e, { kind: 'set', draft: ['a'] })).toBe(false);
    expect(isChange(e, { kind: 'set', draft: ['a', 'b'] })).toBe(true);
    expect(isChange(entry({ type: 'number', value: 1 }), { kind: 'set', draft: 'x' })).toBe(true);
    expect(isChange(entry({ type: 'secret', sensitive: true }), { kind: 'set', draft: '' })).toBe(true);
    expect(isChange(entry({ type: 'string', value: 'a', default: 'a' }), { kind: 'reset' })).toBe(false);
    expect(isChange(entry({ type: 'string', value: 'b', default: 'a' }), { kind: 'reset' })).toBe(true);
    expect(isChange(entry({ type: 'secret', sensitive: true, isSet: true }), { kind: 'reset' })).toBe(true);
    expect(isChange(entry({ type: 'secret', sensitive: true, isSet: false }), { kind: 'reset' })).toBe(false);
  });
});

describe('display and search', () => {
  it('shows values for the diff', () => {
    expect(displayValue(null)).toBe('—');
    expect(displayValue('')).toBe('""');
    expect(displayValue(['a', 'b'])).toBe('a, b');
    expect(displayValue([])).toBe('[]');
    expect(displayValue({ a: 1 })).toBe('{"a":1}');
    expect(displayValue(5)).toBe('5');
  });

  it('matches key, label and description, ignoring case', () => {
    const e = entry({ key: 'cors.origins', label: 'Allowed origins', description: 'Sites that may call the API' });
    expect(entryMatches(e, 'ORIGINS')).toBe(true);
    expect(entryMatches(e, 'allowed')).toBe(true);
    expect(entryMatches(e, 'call the')).toBe(true);
    expect(entryMatches(e, 'jobs')).toBe(false);
    expect(entryMatches(e, '  ')).toBe(true);
  });
});
