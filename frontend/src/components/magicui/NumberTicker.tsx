/**
 * NumberTicker — adaptado de Magic UI (https://magicui.design/docs/components/number-ticker),
 * fonte: github.com/magicuidesign/magicui (MIT License, Copyright (c) Magic UI).
 * Mudanças: formatação pt-BR/BRL via prop `format`, sem `cn`, respeita prefers-reduced-motion.
 */
import { useEffect, useRef, type ComponentPropsWithoutRef } from 'react';
import { useInView, useMotionValue, useReducedMotion, useSpring } from 'motion/react';

interface NumberTickerProps extends Omit<ComponentPropsWithoutRef<'span'>, 'children'> {
  value: number;
  delay?: number;
  format: (n: number) => string;
}

export function NumberTicker({ value, delay = 0, format, className, ...props }: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const motionValue = useMotionValue(reduce ? value : 0);
  const springValue = useSpring(motionValue, { damping: 60, stiffness: 100 });
  const isInView = useInView(ref, { once: true, margin: '0px' });

  useEffect(() => {
    if (!isInView) return;
    const t = setTimeout(() => motionValue.set(value), delay * 1000);
    return () => clearTimeout(t);
  }, [motionValue, isInView, delay, value]);

  useEffect(
    () =>
      springValue.on('change', (latest) => {
        if (ref.current) ref.current.textContent = format(Math.round(latest * 100) / 100);
      }),
    [springValue, format],
  );

  return (
    <span ref={ref} className={`inline-block tabular-nums tracking-tight ${className ?? ''}`} {...props}>
      {format(reduce ? value : 0)}
    </span>
  );
}
