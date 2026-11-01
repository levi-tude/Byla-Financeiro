/**
 * BorderBeam — adaptado de Magic UI (https://magicui.design/docs/components/border-beam),
 * fonte: github.com/magicuidesign/magicui (MIT License, Copyright (c) Magic UI).
 * Mudanças: classes Tailwind v4 trocadas por estilos inline (o app usa Tailwind 3); some com prefers-reduced-motion.
 */
import { motion, useReducedMotion } from 'motion/react';

export function BorderBeam({
  size = 80,
  duration = 8,
  delay = 0,
  colorFrom = '#f43f5e',
  colorTo = '#818cf8',
  borderWidth = 1.5,
}: {
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  borderWidth?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-[inherit]"
      style={{
        padding: borderWidth,
        WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
        WebkitMaskComposite: 'xor',
        mask: 'linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)',
      }}
    >
      <motion.div
        className="absolute aspect-square"
        style={{
          width: size,
          offsetPath: `rect(0 auto auto 0 round ${size}px)`,
          background: `linear-gradient(to left, ${colorFrom}, ${colorTo}, transparent)`,
        }}
        initial={{ offsetDistance: '0%' }}
        animate={{ offsetDistance: '100%' }}
        transition={{ repeat: Infinity, ease: 'linear', duration, delay: -delay }}
      />
    </div>
  );
}
