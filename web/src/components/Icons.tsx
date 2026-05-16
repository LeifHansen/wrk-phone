// One consistent icon system: every icon is a 24×24 stroked glyph,
// currentColor, same weight/caps — so the nav reads as a uniform set.
type P = { size?: number };
const base = (size = 26) => ({
  width: size, height: size, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor', strokeWidth: 2.2,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
});

export const IconPhone = ({ size }: P) => (
  <svg {...base(size)}><path d="M6.5 3.5c.6 0 1.1.4 1.3 1l1 3a1.4 1.4 0 0 1-.4 1.5L7 10.5a12 12 0 0 0 6.5 6.5l1.5-1.4a1.4 1.4 0 0 1 1.5-.4l3 1c.6.2 1 .7 1 1.3v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3.5 6.5a2 2 0 0 1 2-2z"/></svg>
);
export const IconMessage = ({ size }: P) => (
  <svg {...base(size)}><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L4 20l1.2-4A8.5 8.5 0 1 1 21 11.5z"/><path d="M8.5 11h7M8.5 14h4"/></svg>
);
export const IconContacts = ({ size }: P) => (
  <svg {...base(size)}><circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 6.5a3 3 0 0 1 0 6M16.5 19a5.5 5.5 0 0 0-2.2-4.4"/></svg>
);
export const IconBlast = ({ size }: P) => (
  <svg {...base(size)}><path d="M3.5 10.5 20 4l-3 16-5.5-5.5z"/><path d="M11.5 14.5 9 21"/></svg>
);
export const IconAgent = ({ size }: P) => (
  <svg {...base(size)}><rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 5v3M9 13h.01M15 13h.01M9.5 16.5h5"/><path d="M3.5 12v3M20.5 12v3"/></svg>
);
export const IconStats = ({ size }: P) => (
  <svg {...base(size)}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2.5"/></svg>
);
export const IconTrash = ({ size }: P) => (
  <svg {...base(size)}><path d="M4 6.5h16M9.5 6.5V4.5h5v2M6.5 6.5 7.5 20h9l1-13.5M10 10v6M14 10v6"/></svg>
);
export const IconPencil = ({ size }: P) => (
  <svg {...base(size)}><path d="M14.5 5.5l4 4M4 20l1-4L16 5a2 2 0 0 1 3 3L8 19l-4 1z"/></svg>
);
export const IconGear = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M19.4 13a7.6 7.6 0 0 0 0-2l1.9-1.5-1.9-3.3-2.3.9a7.6 7.6 0 0 0-1.7-1l-.4-2.4H10.9l-.4 2.4a7.6 7.6 0 0 0-1.7 1l-2.3-.9-1.9 3.3L4.6 11a7.6 7.6 0 0 0 0 2l-1.9 1.5 1.9 3.3 2.3-.9a7.6 7.6 0 0 0 1.7 1l.4 2.4h3.8l.4-2.4a7.6 7.6 0 0 0 1.7-1l2.3.9 1.9-3.3L19.4 13z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);
