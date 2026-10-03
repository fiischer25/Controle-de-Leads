/** Barras mensais de uma única série: total em destaque, valor do mês ao passar o mouse. */
export function MonthBars({
  title,
  total,
  months,
  caption = 'em 12 meses',
  format = (n: number) => String(n),
}: {
  title: string;
  total: number;
  months: Array<{ key: string; label: string; value: number }>;
  caption?: string;
  /** Formatação do total, do texto acessível e da dica de cada mês (ex.: moeda). */
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...months.map((m) => m.value));
  const last = months[months.length - 1];
  return (
    <figure className="min-w-0">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] text-faint">{title}</span>
        <span className="text-[12.5px] text-faint">
          <span className="font-display text-[20px] leading-6 tracking-[-0.02em] tabular text-ink">{format(total)}</span> {caption}
        </span>
      </figcaption>
      <div className="mt-4 flex h-28 items-end gap-0.5 border-b border-line-strong" role="img" aria-label={`${title}: ${months.map((m) => `${m.label} ${format(m.value)}`).join(', ')}`}>
        {months.map((m) => (
          <div key={m.key} className="group relative flex h-full flex-1 items-end justify-center">
            <div
              className="w-full max-w-[18px] rounded-t-[4px] bg-stone-800 transition-colors group-hover:bg-ink"
              style={{ height: `${(m.value / max) * 100}%`, minHeight: m.value > 0 ? 3 : 0 }}
            />
            <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-xs bg-ink px-1.5 py-0.5 text-[11px] text-surface tabular group-hover:block">
              {m.label}: {format(m.value)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-0.5 text-[10.5px] text-faint">
        {months.map((m, i) => (
          <span key={m.key} className="flex-1 text-center">
            {i % 2 === months.length % 2 || m === last ? m.label : ''}
          </span>
        ))}
      </div>
    </figure>
  );
}
