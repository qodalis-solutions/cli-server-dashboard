import { ChipList } from '@qodalis/cli-server-dashboard-kit';
import type { CommandDescriptor, ParameterDescriptor } from '../../types';
import { useI18n } from '../../i18n';
import { documentationParagraphs, formatDefaultValue } from './commandInfo';

const SECTION_TITLE = 'text-[10px] text-subtle uppercase tracking-wider font-medium mb-1.5';
const TH = 'px-3 py-2 text-left text-[10px] text-subtle uppercase tracking-wide font-medium';

/** A command's other names, as chips next to its name: two, the others behind +N more. */
export function AliasChips({ command, aliases }: { command: string; aliases?: string[] }) {
  const { t } = useI18n();
  if (!aliases?.length) return null;
  return (
    <ChipList
      items={aliases.map(alias => ({ label: alias, title: t('commands.alias') }))}
      max={2}
      label={t('commands.aliases')}
      title={t('commands.aliasesOf', { command })}
      chipClassName="font-mono text-[11px] px-1.5 py-0.5 rounded bg-control text-muted border border-border/75"
    />
  );
}

/** The permissions a command declares itself, as small chips (two, the others behind +N more); `—` when it declares none. */
export function PermissionChips({ command, permissions }: { command: string; permissions?: string[] }) {
  const { t } = useI18n();
  if (!permissions?.length) return <span className="text-subtle" aria-label={t('commands.noPermissions')}>—</span>;
  return (
    <ChipList
      items={permissions}
      max={2}
      label={t('commands.colPermissions')}
      title={t('commands.permissionsOf', { command })}
      chipClassName="font-mono text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-accent border border-primary/25 whitespace-nowrap"
    />
  );
}

function ParamRow({ param }: { param: ParameterDescriptor }) {
  const { t } = useI18n();
  return (
    <tr className="border-b border-border/50 last:border-0 align-top">
      <td className="px-3 py-1.5 font-mono text-xs text-accent whitespace-nowrap">
        {param.name}
        {param.aliases?.length ? <span className="text-subtle"> ({param.aliases.join(', ')})</span> : null}
      </td>
      <td className="px-3 py-1.5 text-xs text-muted">{param.type}</td>
      <td className="px-3 py-1.5 text-xs text-muted">
        {param.description}
        {param.examples?.length ? (
          <span className="block mt-0.5 text-subtle">
            {t('commands.forExample')}{' '}
            {param.examples.map((value, i) => (
              <span key={`${value}-${i}`}>
                {i > 0 && ', '}
                <code className="font-mono text-[11px] text-accent">{value}</code>
              </span>
            ))}
          </span>
        ) : null}
      </td>
      <td className="px-3 py-1.5 text-xs">
        {param.required ? (
          <span className="text-error font-medium">{t('commands.yes')}</span>
        ) : (
          <span className="text-subtle">{t('commands.no')}</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-xs font-mono text-muted">{formatDefaultValue(param.defaultValue)}</td>
      <td className="px-3 py-1.5 text-xs">
        {param.allowedValues?.length ? (
          <span className="flex flex-wrap gap-1">
            {param.allowedValues.map(value => (
              <span key={value} className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-accent border border-primary/25">{value}</span>
            ))}
          </span>
        ) : (
          <span className="text-subtle">{t('commands.anyValue')}</span>
        )}
      </td>
    </tr>
  );
}

/** Documentation, examples and parameters of an expanded command (sub-commands are listed by the page). */
export default function CommandDetails({ cmd }: { cmd: CommandDescriptor }) {
  const { t } = useI18n();
  const paragraphs = documentationParagraphs(cmd.documentation);

  return (
    <>
      {paragraphs.length > 0 && (
        <div className="mb-3">
          <div className={SECTION_TITLE}>{t('commands.documentation')}</div>
          <div className="space-y-2 text-sm text-text max-w-3xl">
            {paragraphs.map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
          </div>
        </div>
      )}
      {cmd.examples && cmd.examples.length > 0 && (
        <div className="mb-3">
          <div className={SECTION_TITLE}>{t('commands.examples')}</div>
          <ul className="bg-surface/75 border border-border/75 rounded-lg divide-y divide-border/50">
            {cmd.examples.map((example, i) => (
              <li key={`${example.command}-${i}`} className="px-3 py-2 flex flex-col sm:flex-row sm:items-baseline gap-x-4 gap-y-0.5">
                <code className="font-mono text-xs text-accent whitespace-pre-wrap break-all">{example.command}</code>
                {example.description && <span className="text-xs text-muted">{example.description}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {cmd.parameters && cmd.parameters.length > 0 && (
        <div className="mb-3">
          <div className={SECTION_TITLE}>{t('commands.parameters')}</div>
          <div className="bg-surface/75 border border-border/75 rounded-lg overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/75">
                  <th className={TH}>{t('commands.colName')}</th>
                  <th className={TH}>{t('commands.colType')}</th>
                  <th className={TH}>{t('commands.colDescription')}</th>
                  <th className={TH}>{t('commands.colRequired')}</th>
                  <th className={TH}>{t('commands.colDefault')}</th>
                  <th className={TH}>{t('commands.colAllowed')}</th>
                </tr>
              </thead>
              <tbody>
                {cmd.parameters.map(p => <ParamRow key={p.name} param={p} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
