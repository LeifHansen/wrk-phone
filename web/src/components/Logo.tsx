import { useState } from 'react';

// Drop your exact logo art (background removed) at one of these paths in
// web/public and it's used automatically — no code change:
//   web/public/logo.svg   (preferred)  or   web/public/logo.png
const ASSET = '/logo.svg';

export function LogoMark({ size = 44 }: { size?: number }) {
  const [useAsset, setUseAsset] = useState(true);
  if (useAsset) {
    return (
      <img
        src={ASSET}
        width={size}
        height={size}
        alt="Wrk.Phone"
        style={{ display: 'block', objectFit: 'contain' }}
        onError={() => setUseAsset(false)}
      />
    );
  }
  // Fallback mark until the asset is added: lime tile + phone receiver + waves.
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="3" y="3" width="58" height="58" rx="16"
        fill="var(--lime)" stroke="var(--ink)" strokeWidth="3.5" />
      <path
        d="M22.5 18c1.1 0 2 .7 2.4 1.8l1.5 4.2c.3.9.1 1.9-.6 2.6l-1.7 1.6a16 16 0 0 0 7.1 7.1l1.6-1.7c.7-.7 1.7-.9 2.6-.6l4.2 1.5c1.1.4 1.8 1.3 1.8 2.4v4.6a3 3 0 0 1-3.2 3A22 22 0 0 1 16 21.2a3 3 0 0 1 3-3.2h3.5z"
        fill="var(--ink)" />
      <path d="M41 22a10 10 0 0 1 0 14" stroke="var(--ink)" strokeWidth="3.5"
        fill="none" strokeLinecap="round" />
      <path d="M46 17a17 17 0 0 1 0 24" stroke="var(--ink)" strokeWidth="3.5"
        fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const tile = size === 'lg' ? 60 : 42;
  const word = size === 'lg' ? 28 : 17;
  return (
    <div className="brand" style={{ flexDirection: size === 'lg' ? 'row' : 'column' }}>
      <LogoMark size={tile} />
      <div className="brand-word" style={{ fontSize: word }}>
        <span className="bw-wrk">Wrk</span>
        <span className="bw-dot">.</span>
        <span className="bw-phone">Phone</span>
      </div>
    </div>
  );
}
