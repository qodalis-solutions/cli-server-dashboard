import { useState } from 'react';
import { resolveModuleIcon, tintOf, moduleInitial } from './moduleIcon';

/** Letter avatar tints: theme colors at low opacity, so they work in light and dark. */
const TINTS = [
  'bg-primary/15 text-primary',
  'bg-accent/15 text-accent',
  'bg-info/15 text-info',
  'bg-success/15 text-success',
  'bg-warning/15 text-warning',
];

const BOX = 'h-8 w-8 shrink-0 rounded-lg flex items-center justify-center';

/** A module's icon (decorative: the module's name is shown next to it). Same 32px box for every kind. */
export default function ModuleIconView({ icon, name, fallback }: { icon?: string | null; name: string; fallback?: string | null }) {
  const [broken, setBroken] = useState<string | null>(null);
  const resolved = resolveModuleIcon(icon, name, fallback);

  if (resolved.kind === 'image' && broken !== resolved.src) {
    return (
      <span className={`${BOX} bg-control`} aria-hidden data-testid="module-icon">
        <img src={resolved.src} alt="" loading="lazy" className="h-6 w-6 object-contain" onError={() => setBroken(resolved.src)} />
      </span>
    );
  }
  if (resolved.kind === 'text') {
    return <span className={`${BOX} bg-control text-lg leading-none`} aria-hidden data-testid="module-icon">{resolved.text}</span>;
  }
  // No icon, or an image that failed to load
  const letter = resolved.kind === 'letter' ? resolved.letter : moduleInitial(name);
  const tint = resolved.kind === 'letter' ? resolved.tint : tintOf(name);
  return (
    <span className={`${BOX} rounded-full text-sm font-semibold ${TINTS[tint]}`} aria-hidden data-testid="module-icon">
      {letter}
    </span>
  );
}
