import { useEffect, useRef, useState } from 'react';

/** Contagem suave ate ao valor alvo (painel / KPIs). */
export function useAnimatedNumber(target: number, durationMs = 1100, replayKey = 0): { value: number; animating: boolean } {
  const safe = Number.isFinite(target) ? Math.max(0, Math.round(target)) : 0;
  const [display, setDisplay] = useState(0);
  const [animating, setAnimating] = useState(false);
  const prevTarget = useRef(0);

  useEffect(() => {
    const from = prevTarget.current;
    prevTarget.current = safe;
    setAnimating(true);
    const start = performance.now();
    let frame = 0;

    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(Math.round(from + (safe - from) * eased));
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setDisplay(safe);
        setAnimating(false);
      }
    }

    setDisplay(from);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      setAnimating(false);
    };
  }, [safe, durationMs, replayKey]);

  return { value: display, animating };
}
