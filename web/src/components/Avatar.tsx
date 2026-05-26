import { useState } from 'react';
import { COLOR_BG, COLOR_FG } from '../lib/api';
import { NameAvatar } from './NameAvatar';

// One avatar everywhere: shows the generated image when present, else
// (in priority order) the supplied icon → a name-seeded NameAvatar →
// the legacy emoji/letter swatch. Used for agents + account.
export function Avatar({
  url, emoji, label, name, icon, color = 'lime', size = 44, round = false,
}: {
  url?: string | null;
  emoji?: string | null;
  label?: string | null;
  name?: string | null;          // when set + no url/icon, used for the gradient fallback
  icon?: React.ReactNode;
  color?: string;
  size?: number;
  round?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const radius = round ? '50%' : Math.max(6, size * 0.18);
  const base: React.CSSProperties = {
    width: size, height: size, borderRadius: radius,
    border: 'var(--border)', boxShadow: 'var(--shadow-sm)', flexShrink: 0, display: 'block',
  };
  if (url && !broken) {
    return <img src={url} alt="" style={{ ...base, objectFit: 'cover' }}
      onError={() => setBroken(true)} />;
  }
  const tile: React.CSSProperties = {
    ...base, background: COLOR_BG[color] || 'var(--surface-2)',
    color: COLOR_FG[color] || 'var(--ink)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  // Preferred fallback: a stroked app icon so agents read like the rest of
  // the UI's icon set instead of a multicolor emoji.
  if (icon) {
    return (
      <div style={tile}>
        <span style={{ width: size * 0.52, height: size * 0.52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      </div>
    );
  }
  // Auto-generated avatar from the name — same look as the dedicated
  // NameAvatar component so list rows and detail screens match exactly.
  if (name && name.trim()) {
    return <NameAvatar name={name} size={size} round={round} />;
  }
  const fallback = emoji || (label || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '#';
  return (
    <div style={{ ...tile, fontSize: size * 0.46, fontWeight: 800 }}>{fallback}</div>
  );
}
