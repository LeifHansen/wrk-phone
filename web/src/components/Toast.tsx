import { useEffect, useState } from 'react';

type T = { id: number; msg: string; kind: 'ok' | 'err' | 'info' };
let push: (t: Omit<T, 'id'>) => void = () => {};
let n = 0;

export function toast(msg: string, kind: T['kind'] = 'ok') { push({ msg, kind }); }

export function Toaster() {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    push = (t) => {
      const id = ++n;
      setItems((s) => [...s, { ...t, id }]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 3200);
    };
    return () => { push = () => {}; };
  }, []);
  return (
    <div className="toaster">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>{t.msg}</div>
      ))}
    </div>
  );
}
