import { useId, useRef, type KeyboardEvent } from 'react';
import CodeView from './CodeView';
import { SAMPLE_HIGHLIGHT, samplesFor, type SampleLang } from './codeSamples';
import type { Operation } from './openapi';
import { useReferenceState } from './ReferenceState';

/**
 * The operation's code samples as tabs (cURL, JavaScript, Python, C#, PHP, Go, Java, then the host's other
 * languages). The language picked here is picked on every operation.
 */
export default function SampleTabs({ operation, serverUrl }: { operation: Operation; serverUrl: string }) {
  const { lang, setLang } = useReferenceState();
  const samples = samplesFor(operation, serverUrl);
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, samples.findIndex(s => s.lang === lang));
  const current = samples[index];

  const onKey = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    const target = e.key === 'Home' ? 0 : e.key === 'End' ? samples.length - 1 : step ? (index + step + samples.length) % samples.length : -1;
    if (target < 0) return;
    e.preventDefault();
    setLang(samples[target].lang);
    tabs.current[target]?.focus();
  };

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-surface">
      <div
        role="tablist"
        aria-label="Code samples"
        onKeyDown={onKey}
        className="flex overflow-x-auto border-b border-border px-1 [scrollbar-width:thin]"
      >
        {samples.map((sample, i) => (
          <button
            key={`${sample.lang}-${i}`}
            ref={el => { tabs.current[i] = el; }}
            id={`${id}-tab-${i}`}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-controls={`${id}-panel`}
            tabIndex={i === index ? 0 : -1}
            onClick={() => setLang(sample.lang)}
            className={`shrink-0 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
              i === index ? 'border-primary text-heading' : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {sample.label}
          </button>
        ))}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${index}`} className="qp-samples">
        <CodeView code={current.source} language={SAMPLE_HIGHLIGHT[current.lang as SampleLang] ?? current.lang} />
      </div>
    </div>
  );
}
