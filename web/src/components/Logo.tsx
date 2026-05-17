import { useState } from 'react';

// Drop your exact logo art (background removed) at web/public/logo.svg
// (or .png) and it's used automatically — no code change.
const ASSET = '/logo.svg';

export function LogoMark({ size = 44 }: { size?: number }) {
  const [useAsset, setUseAsset] = useState(true);
  if (useAsset) {
    return (
      <img src={ASSET} width={size} height={size} alt="Werkphone"
        style={{ display: 'block', objectFit: 'contain' }}
        onError={() => setUseAsset(false)} />
    );
  }
  // Built-in mark: lime tile, clean filled phone receiver, three signal waves.
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="2.5" y="2.5" width="59" height="59" rx="17"
        fill="var(--lime)" stroke="var(--ink)" strokeWidth="3" />
      <path
        d="M23 19.5c1.2 0 2.2.8 2.5 1.9l1.6 4.6c.3 1 0 2-.7 2.7l-1.9 1.8a17.5 17.5 0 0 0 7.9 7.9l1.8-1.9c.7-.7 1.7-1 2.7-.7l4.6 1.6c1.1.3 1.9 1.3 1.9 2.5v4.9a3.2 3.2 0 0 1-3.4 3.2A24 24 0 0 1 16.4 22.9a3.2 3.2 0 0 1 3.2-3.4H23z"
        fill="var(--ink)" />
      <g stroke="var(--ink)" strokeWidth="3.4" fill="none" strokeLinecap="round">
        <path d="M39.5 23a9 9 0 0 1 0 12.5" />
        <path d="M43.5 18.5a15 15 0 0 1 0 21.5" />
        <path d="M47.5 14a21 21 0 0 1 0 30.5" />
      </g>
    </svg>
  );
}

export function Logo({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const tile = size === 'lg' ? 60 : 44;
  const word = size === 'lg' ? 30 : 19;
  return (
    <div className="brand" style={{ flexDirection: size === 'lg' ? 'row' : 'column' }}>
      <LogoMark size={tile} />
      <div className="brand-word" style={{ fontSize: word }}>Werkphone</div>
    </div>
  );
}
