import { useEffect, useRef } from 'react';

// Polls `fn` every `ms`, but skips ticks while the tab is hidden and fires an
// immediate refresh when it becomes visible again. Replaces the bare
// setInterval pattern that kept hitting the API in backgrounded tabs.
export function usePolling(fn: () => void, ms: number, deps: unknown[] = []) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const run = () => fnRef.current();
    run();
    const t = setInterval(() => {
      if (!document.hidden) run();
    }, ms);
    const onVis = () => { if (!document.hidden) run(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps]);
}
