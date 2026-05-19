import { useEffect, useState } from 'react';

// Sidebar "service" signal bars. Idle = the subtle slow lime glow (CSS).
// Every so often, at a RANDOM interval, a one-shot rainbow wave cascades
// up through the four bars, then it settles back to the idle glow.
export function ServiceBars() {
  const [rainbow, setRainbow] = useState(false);

  useEffect(() => {
    let killed = false;
    let onTimer: ReturnType<typeof setTimeout>;
    let offTimer: ReturnType<typeof setTimeout>;

    const WAVE_MS = 2400;            // length of one cascade
    const rand = (min: number, max: number) => min + Math.random() * (max - min);

    const schedule = () => {
      // Next burst somewhere between ~9s and ~28s out — feels organic, not loopy.
      onTimer = setTimeout(() => {
        if (killed) return;
        setRainbow(true);
        offTimer = setTimeout(() => {
          if (killed) return;
          setRainbow(false);
          schedule();
        }, WAVE_MS);
      }, rand(9000, 28000));
    };
    schedule();

    return () => { killed = true; clearTimeout(onTimer); clearTimeout(offTimer); };
  }, []);

  return (
    <div className={'bars' + (rainbow ? ' rainbow' : '')}>
      <i /><i /><i /><i />
    </div>
  );
}
