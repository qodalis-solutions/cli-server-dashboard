import { describe, expect, it } from 'vitest';
import { LOCALES } from '../../i18n';
import { languagePacks } from './languagePacks';

describe('terminal language packs', () => {
  it('has a CLI language pack for every dashboard language', () => {
    const packs = languagePacks.map(m => m.name.replace('@qodalis/cli-lang-', '')).sort();
    const languages = LOCALES.map(l => l.code).filter(code => code !== 'en').sort();
    expect(packs).toEqual(languages);
  });
});
