import { useState } from 'react';
import { useI18n } from '../../i18n';

/** A module's enable/disable switch; disabled while the change is sent. */
export default function PluginToggle({ enabled, onToggle, className = '' }: {
  enabled: boolean;
  onToggle: () => Promise<void>;
  className?: string;
}) {
  const [toggling, setToggling] = useState(false);
  const { t } = useI18n();

  async function handleClick(e: React.MouseEvent) {
    // Never the card's link: the switch sits on the card
    e.preventDefault();
    e.stopPropagation();
    setToggling(true);
    try {
      await onToggle();
    } finally {
      setToggling(false);
    }
  }

  const label = enabled ? t('plugins.disablePlugin') : t('plugins.enablePlugin');
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={handleClick}
      disabled={toggling}
      className={`inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50 ${
        enabled ? 'bg-primary' : 'bg-subtle'
      } ${className}`}
      title={label}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-on-primary transition-transform ${
          enabled ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
