/**
 * A small spinning ring in the current text color. Decorative by default (inside a busy button,
 * next to a label); pass `label` to announce it as a loading status on its own.
 */
export default function Spinner({ size = 14, label, className = '' }: { size?: number; label?: string; className?: string }) {
  const ring = (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" className={`animate-spin motion-reduce:animate-none ${className}`}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
  if (!label) return ring;
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center">
      {ring}
      <span className="sr-only">{label}</span>
    </span>
  );
}
