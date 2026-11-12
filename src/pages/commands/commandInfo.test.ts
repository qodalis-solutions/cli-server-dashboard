import { describe, expect, it } from 'vitest';
import { commandModule, documentationParagraphs, formatDefaultValue, hasCommandDetails, matchesCommandSearch } from './commandInfo';
import type { CommandDescriptor } from '../../types';

const cmd = (fields: Partial<CommandDescriptor>): CommandDescriptor => ({ command: 'weather', description: 'Shows weather', ...fields });

describe('commandModule', () => {
  it('prefers the descriptor field and falls back to metadata.module', () => {
    expect(commandModule(cmd({ module: 'weather', metadata: { module: 'old' } }))).toBe('weather');
    expect(commandModule(cmd({ metadata: { module: 'old' } }))).toBe('old');
    expect(commandModule(cmd({ metadata: { module: 3 } }))).toBeUndefined();
    expect(commandModule(cmd({}))).toBeUndefined();
  });
});

describe('hasCommandDetails', () => {
  it('is true with documentation, examples, parameters or sub-commands', () => {
    expect(hasCommandDetails(cmd({}))).toBe(false);
    expect(hasCommandDetails(cmd({ documentation: '  ' }))).toBe(false);
    expect(hasCommandDetails(cmd({ documentation: 'Help' }))).toBe(true);
    expect(hasCommandDetails(cmd({ examples: [{ command: 'weather London' }] }))).toBe(true);
    expect(hasCommandDetails(cmd({ processors: [cmd({ command: 'current' })] }))).toBe(true);
  });
});

describe('matchesCommandSearch', () => {
  it('finds commands by alias and module as well as name and description', () => {
    const forecast = cmd({ command: 'forecast', aliases: ['fc'], module: 'Weather' });
    expect(matchesCommandSearch(forecast, 'FC')).toBe(true);
    expect(matchesCommandSearch(forecast, 'weath')).toBe(true);
    expect(matchesCommandSearch(forecast, 'nothing')).toBe(false);
    expect(matchesCommandSearch(forecast, '  ')).toBe(true);
  });
});

describe('documentationParagraphs', () => {
  it('splits on blank lines', () => {
    expect(documentationParagraphs('First line\nsame paragraph\n\nSecond\r\n  \r\nThird')).toEqual([
      'First line\nsame paragraph', 'Second', 'Third',
    ]);
    expect(documentationParagraphs(undefined)).toEqual([]);
  });
});

describe('formatDefaultValue', () => {
  it('shows a dash for missing values and JSON for objects', () => {
    expect(formatDefaultValue(undefined)).toBe('—');
    expect(formatDefaultValue('')).toBe('—');
    expect(formatDefaultValue(false)).toBe('false');
    expect(formatDefaultValue(['a'])).toBe('["a"]');
  });
});
