// Wrk.Phone brand mark: lime rounded tile with a phone + signal glyph,
// wordmark "Wrk" (mono) · purple dot · "Phone" (flowy script).
export function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="3" y="3" width="58" height="58" rx="15"
        fill="var(--lime)" stroke="var(--ink)" strokeWidth="4" />
      {/* phone receiver — blocky rounded handset */}
      <path
        d="M20 22c0-2.2 1.8-4 4-4h6c2.2 0 4 1.8 4 4v20c0 2.2-1.8 4-4 4h-6c-2.2 0-4-1.8-4-4V22z
           M24 27h6"
        fill="var(--ink)" />
      <rect x="20" y="25" width="14" height="14" rx="3" fill="var(--lime)" />
      {/* signal arcs */}
      <path d="M40 24c4 3 4 13 0 16" stroke="var(--ink)" strokeWidth="4"
        fill="none" strokeLinecap="round" />
      <path d="M45 20c7 5 7 19 0 24" stroke="var(--ink)" strokeWidth="4"
        fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const tile = size === 'lg' ? 64 : 40;
  const word = size === 'lg' ? 30 : 18;
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
