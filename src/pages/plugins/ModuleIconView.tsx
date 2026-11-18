import { useState } from 'react';
import { fallbackPluginIcon, resolveModuleIcon } from './moduleIcon';

const BOX = 'h-8 w-8 shrink-0 rounded-lg flex items-center justify-center bg-control';

/**
 * A plugin's or module's icon (decorative: its name is shown next to it): the server's icon, else the built-in icon
 * of a known package or module (`names`: its id, name, ...), else the default. Same 32px box for every kind.
 */
export default function ModuleIconView({ icon, names }: { icon?: string | null; names: Array<string | null | undefined> }) {
  const [broken, setBroken] = useState<string | null>(null);
  const resolved = resolveModuleIcon(icon, ...names);

  if (resolved.kind === 'image' && broken !== resolved.src) {
    return (
      <span className={BOX} aria-hidden data-testid="module-icon">
        <img src={resolved.src} alt="" loading="lazy" className="h-6 w-6 object-contain" onError={() => setBroken(resolved.src)} />
      </span>
    );
  }
  // An image that failed to load: the icon the plugin would have without one
  const text = resolved.kind === 'text' ? resolved.text : fallbackPluginIcon(...names);
  return <span className={`${BOX} text-lg leading-none`} aria-hidden data-testid="module-icon">{text}</span>;
}
