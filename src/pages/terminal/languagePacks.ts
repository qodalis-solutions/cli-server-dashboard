import { langDeModule } from '@qodalis/cli-lang-de';
import { langEsModule } from '@qodalis/cli-lang-es';
import { langFrModule } from '@qodalis/cli-lang-fr';
import { langItModule } from '@qodalis/cli-lang-it';
import { langJaModule } from '@qodalis/cli-lang-ja';
import { langKoModule } from '@qodalis/cli-lang-ko';
import { langPtModule } from '@qodalis/cli-lang-pt';
import { langRoModule } from '@qodalis/cli-lang-ro';
import { langRuModule } from '@qodalis/cli-lang-ru';
import { langZhModule } from '@qodalis/cli-lang-zh';

/**
 * The CLI's language packs, one for every dashboard language but English (built into the CLI): the embedded
 * terminal follows the dashboard's language. Adding a dashboard language means adding its pack here
 * (languagePacks.test.ts checks it).
 */
export const languagePacks = [
  langDeModule, langEsModule, langFrModule, langItModule, langJaModule,
  langKoModule, langPtModule, langRoModule, langRuModule, langZhModule,
];
