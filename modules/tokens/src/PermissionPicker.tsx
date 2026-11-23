import { useId } from 'react';
import type { CliPermission } from './api';
import { useI18n } from './i18n';
import { groupPermissions } from './tokenInfo';

const INPUT = 'w-full px-3 py-2 text-sm bg-control border border-border rounded-lg text-text placeholder:text-subtle focus:outline-none focus:border-primary/50';

interface Props {
  /** The server's catalog (empty when the server does not list it: only the other field is shown). */
  entries: CliPermission[];
  checked: ReadonlySet<string>;
  onToggle: (name: string) => void;
  /** Permissions typed by hand (not in the catalog, e.g. a command's own permission). */
  other: string;
  onOtherChange: (value: string) => void;
}

/** Checkboxes for the server's permissions, grouped as the server groups them, and a field for the others. */
export default function PermissionPicker({ entries, checked, onToggle, other, onOtherChange }: Props) {
  const { t } = useI18n();
  const id = useId();
  const groups = groupPermissions(entries);

  return (
    <div className="space-y-3">
      {groups.length > 0 && (
        <div className="max-h-64 overflow-y-auto space-y-3 p-3 rounded-lg border border-border bg-surface">
          {groups.map(({ group, entries: list }) => (
            <section key={group}>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5">{group}</h4>
              <ul className="space-y-1.5">
                {list.map(entry => {
                  const inputId = `${id}-${entry.name}`;
                  return (
                    <li key={entry.name} className="flex items-start gap-2">
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={checked.has(entry.name)}
                        onChange={() => onToggle(entry.name)}
                        aria-describedby={`${inputId}-description`}
                        className="mt-0.5 accent-primary"
                      />
                      <div className="min-w-0">
                        <label htmlFor={inputId} className="block font-mono text-xs text-text break-all cursor-pointer">{entry.name}</label>
                        <p id={`${inputId}-description`} className="text-[11px] text-subtle">{entry.description}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      <div>
        <label htmlFor={`${id}-other`} className="block text-xs text-muted mb-1">{t('tokens.otherPermissions')}</label>
        <textarea
          id={`${id}-other`}
          value={other}
          onChange={e => onOtherChange(e.target.value)}
          placeholder="deploy:run"
          rows={2}
          spellCheck={false}
          autoCapitalize="off"
          className={`${INPUT} font-mono text-xs resize-y`}
        />
        <p className="mt-1 text-[11px] text-subtle">{t('tokens.otherHint')}</p>
      </div>
    </div>
  );
}
