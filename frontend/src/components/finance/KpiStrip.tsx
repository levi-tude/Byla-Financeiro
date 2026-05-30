import { KpiCard } from '../ui/KpiCard';

export type KpiStripItem = {
  label: string;
  value: string;
  helperText?: string;
  trend?: 'up' | 'down' | 'neutral';
  accentColor?: 'primary' | 'success' | 'danger';
  isLoading?: boolean;
  ctaTo?: string;
  ctaLabel?: string;
};

export function KpiStrip({ items }: { items: KpiStripItem[] }) {
  const safe = items.slice(0, 6);
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {safe.map((item) => (
        <KpiCard key={item.label} {...item} />
      ))}
    </section>
  );
}

