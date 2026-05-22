import { useEffect, useState } from 'react';

/** Contagem suave ate ao valor alvo (painel / KPIs). */
export function useAnimatedNumber(target: number, durationMs = 480): number {
  const safe = Number.isFinite(target) ? Math.max(0, Math.round(target)) : 0;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const from = 0;
    const start = performance.now();
    let frame = 0;

    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(Math.round(from + (safe - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [safe, durationMs]);

  return display;
}
