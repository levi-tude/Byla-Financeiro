/**
 * NumberTicker — adaptado de Magic UI (https://magicui.design/docs/components/number-ticker),
 * fonte: github.com/magicuidesign/magicui (MIT License, Copyright (c) Magic UI).
 * Mudanças: formatação pt-BR/BRL via prop `format`, sem `cn`; animação curta (≤400 ms, linear-out);
 * o DOM sempre começa e termina com o valor FINAL (print/captura/slide fora da tela nunca mostram valor parcial);
 * desligada com `animar={false}` (apresentação), prefers-reduced-motion e durante impressão.
 */
import { useEffect, useRef, type ComponentPropsWithoutRef } from 'react';
import { animate, useInView, useReducedMotion } from 'motion/react';

interface NumberTickerProps extends Omit<ComponentPropsWithoutRef<'span'>, 'children'> {
  value: number;
  delay?: number;
  /** false = mostra o valor final direto (modo apresentação). */
  animar?: boolean;
  format: (n: number) => string;
}

export const NUMBER_TICKER_DURACAO_S = 0.4;

export function NumberTicker({ value, delay = 0, animar = true, format, className, ...props }: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const isInView = useInView(ref, { once: true, margin: '0px' });
  const ligado = animar && !reduce;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const final = () => {
      el.textContent = format(value);
    };
    final();
    if (!ligado || !isInView) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('print').matches) return;
    const ctrl = animate(0, value, {
      duration: NUMBER_TICKER_DURACAO_S,
      delay: Math.min(delay, 0.15),
      ease: 'easeOut',
      onUpdate: (n) => {
        el.textContent = format(Math.round(n * 100) / 100);
      },
      onComplete: final,
    });
    window.addEventListener('beforeprint', final);
    return () => {
      ctrl.stop();
      window.removeEventListener('beforeprint', final);
      final();
    };
  }, [ligado, isInView, value, delay, format]);

  return (
    <span ref={ref} className={`inline-block tabular-nums tracking-tight ${className ?? ''}`} {...props}>
      {format(value)}
    </span>
  );
}
