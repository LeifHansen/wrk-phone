// Deterministic fallback avatar — used everywhere a user/agent has no
// uploaded or AI-generated image yet. The background hue is seeded from
// the name (same name → same color forever) and the foreground shows
// the first letter of the first two words. Pure CSS, no network calls.

type Props = {
  name?: string | null;
  size?: number;
  round?: boolean;       // circle (Settings/account) vs rounded-rect (agents)
  title?: string;
};

// Fast string hash → 0..n. djb2 — good enough for picking a hue.
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return h >>> 0;
}

function initials(name: string): string {
  const cleaned = name.trim().replace(/[^\p{L}\p{N}\s'-]/gu, '');
  if (!cleaned) return '?';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function NameAvatar({ name, size = 64, round = false, title }: Props) {
  const safeName = (name || '').trim() || 'WP';
  const h = hash(safeName.toLowerCase());
  // Two hues 40° apart give a subtle gradient that still reads as one color.
  // Locked S+L so contrast against white text is consistent across names.
  const hue = h % 360;
  const bg = `linear-gradient(135deg, hsl(${hue} 70% 48%), hsl(${(hue + 40) % 360} 75% 38%))`;
  const fontSize = Math.round(size * 0.42);
  return (
    <div
      title={title || safeName}
      aria-label={title || safeName}
      style={{
        width: size,
        height: size,
        borderRadius: round ? '50%' : Math.max(8, Math.round(size * 0.18)),
        background: bg,
        color: '#fff',
        fontWeight: 800,
        fontSize,
        letterSpacing: 0.5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'var(--border)',
        userSelect: 'none',
        flex: '0 0 auto',
        textShadow: '0 1px 2px rgba(0,0,0,0.25)',
      }}
    >
      {initials(safeName)}
    </div>
  );
}
