import { NavLink } from 'react-router-dom';

// Tiny pill-tab strip used by sections that have nested subtabs.
// Each tab is a NavLink so the URL is the source of truth (deep-linkable,
// browser-back works, no lifted state). Visual style reuses the existing
// .seg-chip rules so it matches the rest of the app without new CSS.
export interface SubNavTab {
  to: string;
  label: string;
  end?: boolean;   // pass true for the "index" tab so it doesn't match deeper paths
}
export function SubNav({ tabs }: { tabs: SubNavTab[] }) {
  return (
    <div className="seg-chips" style={{ padding: '0 24px 6px' }}>
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end}
          className={({ isActive }) => 'seg-chip' + (isActive ? ' on' : '')}
          style={{ textDecoration: 'none' }}>
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
