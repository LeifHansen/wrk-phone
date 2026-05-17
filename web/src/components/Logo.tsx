import { useState } from 'react';

// Drop your exact logo art (background removed) at web/public/logo.svg
// (or .png) and it's used automatically — no code change.
const ASSET = '/logo.svg';

export function LogoMark({ size = 44 }: { size?: number }) {
  const [useAsset, setUseAsset] = useState(true);
  if (useAsset) {
    return (
      <img src={ASSET} width={size} height={size} alt="WrkPhn"
        style={{ display: 'block', objectFit: 'contain' }}
        onError={() => setUseAsset(false)} />
    );
  }
  // Built-in mark: lime tile, clean filled phone receiver, three signal waves.
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="2.5" y="2.5" width="59" height="59" rx="17"
        fill="var(--lime)" stroke="var(--ink)" strokeWidth="3" />
      {/* compact handset, kept to the left ~half so it never touches the waves */}
      <path
        d="M17 17.5c.9 0 1.7.6 2 1.5l1.2 3.6c.25.8.05 1.6-.55 2.2l-1.5 1.45a13.5 13.5 0 0 0 6.05 6.05l1.45-1.5c.6-.6 1.4-.8 2.2-.55l3.6 1.2c.9.3 1.5 1.1 1.5 2v3.8a2.6 2.6 0 0 1-2.8 2.6A18.5 18.5 0 0 1 14.4 20.3 2.6 2.6 0 0 1 17 17.5z"
        fill="var(--ink)" />
      {/* signal waves on the right, clear gap from the handset */}
      <g stroke="var(--ink)" strokeWidth="3.2" fill="none" strokeLinecap="round">
        <path d="M40 25a7 7 0 0 1 0 14" />
        <path d="M45 20a13 13 0 0 1 0 24" />
        <path d="M50 15a19 19 0 0 1 0 34" />
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
      <div className="brand-word" style={{ fontSize: word }}>WrkPhn</div>
    </div>
  );
}
