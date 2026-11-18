import type { ReactNode } from 'react';

export type ButtonGroupTone = 'default' | 'primary' | 'success' | 'warning' | 'danger';

export interface ButtonGroupItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Text color of the segment; `danger` for destructive actions. */
  tone?: ButtonGroupTone;
  disabled?: boolean;
  /** The segment's action is in progress: a spinner instead of the icon, and the segment is disabled. */
  loading?: boolean;
}

/** When the labels are shown next to the icons; otherwise only the icon, with the label as tooltip and accessible name. */
export type ButtonGroupLabels = 'always' | 'sm' | 'xl' | 'never';

interface Props {
  items: ButtonGroupItem[];
  /** Accessible name of the group, e.g. "Actions for health-check". */
  label: string;
  labels?: ButtonGroupLabels;
  className?: string;
}

const TONES: Record<ButtonGroupTone, string> = {
  default: 'text-text hover:bg-control-hover',
  primary: 'text-accent hover:bg-primary/15',
  success: 'text-success hover:bg-success/15',
  warning: 'text-warning hover:bg-warning/15',
  danger: 'text-error hover:bg-error/15',
};

/** Label visibility per mode (full class names, so Tailwind keeps them). */
const LABEL_CLASS: Record<ButtonGroupLabels, string> = {
  always: '',
  sm: 'sr-only sm:not-sr-only',
  xl: 'sr-only xl:not-sr-only',
  never: 'sr-only',
};

/**
 * Related actions as one segmented control: joined borders, rounded only at the outer ends, a divider between
 * segments. Each segment is 44px tall on phones (touch) and compact from `sm` up.
 */
export default function ButtonGroup({ items, label, labels = 'always', className = '' }: Props) {
  if (items.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex items-stretch rounded-lg border border-border/75 bg-control divide-x divide-border/75 overflow-hidden ${className}`}
    >
      {items.map(item => {
        const disabled = item.disabled || item.loading;
        return (
          <button
            key={item.key}
            type="button"
            onClick={item.onClick}
            disabled={disabled}
            aria-busy={item.loading || undefined}
            aria-label={labels === 'always' ? undefined : item.label}
            title={labels === 'always' ? undefined : item.label}
            className={`inline-flex items-center justify-center gap-1.5 min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 px-2.5 text-xs font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed ${TONES[item.tone ?? 'default']}`}
          >
            {item.loading ? <Spinner /> : item.icon && <span aria-hidden className="inline-flex">{item.icon}</span>}
            <span className={LABEL_CLASS[labels]}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Spinner() {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" className="animate-spin motion-reduce:animate-none">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
