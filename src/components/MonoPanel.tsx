import ErrorBoundary from './ErrorBoundary';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';

interface Props {
  lines: string[];
  maxLines?: number;
  title?: string;
  className?: string;
}

function MonoPanelContent({ lines, maxLines = 500, title, className = '' }: Props) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  };

  const displayLines = lines.slice(-maxLines);

  return (
    <div className={`bg-surface border border-border rounded-xl overflow-hidden ${className}`}>
      {title && (
        <div className="px-4 py-3 border-b border-border/75 flex items-center justify-between">
          <span className="text-sm font-medium text-heading">{title}</span>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`text-[10px] px-2 py-0.5 rounded ${autoScroll ? 'bg-primary/20 text-accent' : 'bg-control text-muted'}`}
          >
            {autoScroll ? t('components.autoScrollOn') : t('components.autoScrollOff')}
          </button>
        </div>
      )}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="overflow-y-auto max-h-80 p-3 font-mono text-xs leading-5 text-text"
      >
        {displayLines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
        ))}
      </div>
    </div>
  );
}

/** A failing panel shows an inline error instead of breaking the page */
export default function MonoPanel(props: Props) {
  const { t } = useI18n();
  return (
    <ErrorBoundary label={props.title ?? t('common.panel')} resetKeys={[props.lines?.length]}>
      <MonoPanelContent {...props} />
    </ErrorBoundary>
  );
}
