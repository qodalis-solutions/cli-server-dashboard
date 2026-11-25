import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useI18n, type MessageKey } from '../i18n';
import { THEME_CHOICES, useThemeChoice, type ThemeChoice } from '../theme';

const ICON = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const OPTIONS: Record<ThemeChoice, { label: MessageKey; icon: ReactNode }> = {
  system: {
    label: 'common.themeDevice',
    icon: <svg aria-hidden {...ICON}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>,
  },
  light: {
    label: 'common.themeLight',
    icon: (
      <svg aria-hidden {...ICON}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  dark: {
    label: 'common.themeDark',
    icon: <svg aria-hidden {...ICON}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>,
  },
};

/**
 * The viewer's color scheme: Device (follows the OS), Light or Dark, as a segmented radio group (arrow keys move and
 * choose). Next to the language selector; `touch`: 44px targets for the navigation drawer.
 */
export default function ThemePicker({ touch = false }: { touch?: boolean }) {
  const { t } = useI18n();
  const [choice, setChoice] = useThemeChoice();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const last = THEME_CHOICES.length - 1;
    const next = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowDown: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      ArrowUp: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setChoice(THEME_CHOICES[next]);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={t('common.theme')}
      className="inline-flex shrink-0 items-stretch rounded-lg border border-border/75 bg-control p-0.5 gap-0.5"
    >
      {THEME_CHOICES.map((value, index) => {
        const checked = value === choice;
        const label = t(OPTIONS[value].label);
        return (
          <button
            key={value}
            ref={el => { refs.current[index] = el; }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={label}
            title={label}
            tabIndex={checked ? 0 : -1}
            onClick={() => setChoice(value)}
            onKeyDown={e => onKeyDown(e, index)}
            className={`inline-flex items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              touch ? 'min-w-11 min-h-11' : 'w-6 h-6'
            } ${checked ? 'bg-primary/15 text-accent' : 'text-subtle hover:text-text hover:bg-control-hover'}`}
          >
            {OPTIONS[value].icon}
          </button>
        );
      })}
    </div>
  );
}
