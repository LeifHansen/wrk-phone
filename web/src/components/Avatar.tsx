import { useState } from 'react';
import { COLOR_BG, COLOR_FG } from '../lib/api';

// One avatar everywhere: shows the generated image when present, else a
// colored tile with the emoji or first letter. Used for agents + account.
export function Avatar({
  url, emoji, label, color = 'lime', size = 44, round = false,
}: {
  url?: string | null;
  emoji?: string | null;
  label?: string | null;
  color?: string;
  size?: number;
  round?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const radius = round ? '50%' : Math.max(6, size * 0.18);
  const base: React.CSSProperties = {
    width: size, height: size, borderRadius: radius,
    border: 'var(--border)', flexShrink: 0, display: 'block',
  };
  if (url && !broken) {
    return <img src={url} alt="" style={{ ...base, objectFit: 'cover' }}
      onError={() => setBroken(true)} />;
  }
  const fallback = emoji || (label || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '#';
  return (
    <div style={{
      ...base, background: COLOR_BG[color] || 'var(--surface-2)',
      color: COLOR_FG[color] || 'var(--ink)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.5, fontWeight: 800,
    }}>{fallback}</div>
  );
}
