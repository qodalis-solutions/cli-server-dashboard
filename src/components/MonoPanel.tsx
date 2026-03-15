import { useEffect, useRef, useState } from 'react';

interface Props {
  lines: string[];
  maxLines?: number;
  title?: string;
  className?: string;
}

export default function MonoPanel({ lines, maxLines = 500, title, className = '' }: Props) {
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
    <div className={`bg-white/[0.04] border border-white/[0.08] rounded-xl overflow-hidden ${className}`}>
      {title && (
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <span className="text-sm font-medium text-white">{title}</span>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`text-[10px] px-2 py-0.5 rounded ${autoScroll ? 'bg-primary/20 text-primary-light' : 'bg-white/[0.06] text-slate-400'}`}
          >
            {autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
          </button>
        </div>
      )}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="overflow-y-auto max-h-80 p-3 font-mono text-xs leading-5 text-slate-300"
      >
        {displayLines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
        ))}
      </div>
    </div>
  );
}
