import { useState } from 'react';
import { DEFAULT_ICON, getBranding } from '../branding';

/**
 * The dashboard's icon: the server's branding, or the Qodalis Solutions logo
 * (also when a custom icon fails to load).
 */
export default function AppLogo({ size }: { size: number }) {
  const custom = getBranding().icon;
  const [failed, setFailed] = useState(false);
  return (
    <img
      src={custom && !failed ? custom : DEFAULT_ICON}
      onError={() => setFailed(true)}
      alt=""
      width={size}
      height={size}
      className="flex-shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}
