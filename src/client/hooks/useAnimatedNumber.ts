import { useEffect, useRef, useState } from 'react';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Eases toward `target` with an exponential approach (time constant `tau` ms). */
export function useAnimatedNumber(target: number, tau = 160): number {
  const [value, setValue] = useState(target);
  const state = useRef({ value: target, target, last: 0, raf: 0 });

  useEffect(() => {
    const s = state.current;
    s.target = target;
    if (reducedMotion()) {
      s.value = target;
      setValue(target);
      return;
    }
    if (s.raf) return;
    s.last = performance.now();
    const step = (now: number) => {
      const dt = now - s.last;
      s.last = now;
      s.value += (s.target - s.value) * (1 - Math.exp(-dt / tau));
      if (Math.abs(s.target - s.value) <= Math.max(0.001, Math.abs(s.target) * 0.0005)) {
        s.value = s.target;
        s.raf = 0;
        setValue(s.value);
        return;
      }
      setValue(s.value);
      s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
  }, [target, tau]);

  useEffect(() => () => cancelAnimationFrame(state.current.raf), []);
  return value;
}
