import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonthsKey, monthKey, monthLabel } from '../../lib/finance';
import { cn, MONTHS_FULL, today } from '../../lib/utils';
import { IconButton, Popover } from '../ui';

const shift = (key: string, n: number) => monthKey(addMonthsKey(`${key}-01`, n));

/**
 * Escolha do mês: setas para o anterior e o próximo e, clicando no nome, um calendário de meses
 * por ano para pular direto para meses antigos. `marked`: meses com lançamentos (ganham um ponto).
 */
export function MonthPicker({
  value,
  onChange,
  marked,
  disabled,
  className,
}: {
  value: string;
  onChange: (month: string) => void;
  marked?: Set<string>;
  disabled?: boolean;
  className?: string;
}) {
  const current = monthKey(today());
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  // Anos que o calendário mostra, até o ano que vem
  const years = useMemo(() => {
    const first = [...(marked ?? [])].sort()[0];
    // Até 10 anos para trás, mesmo sem lançamentos (ou desde o primeiro lançamento, se for antes)
    const min = Math.min(Number((first ?? current).slice(0, 4)), Number(value.slice(0, 4)), Number(current.slice(0, 4)) - 10);
    const max = Math.max(Number(current.slice(0, 4)) + 1, Number(value.slice(0, 4)));
    return { min, max };
  }, [marked, current, value]);
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', disabled && 'pointer-events-none opacity-40', className)}>
      <div className="flex items-center gap-1">
        <IconButton label="Mês anterior" onClick={() => onChange(shift(value, -1))} disabled={disabled}>
          <ChevronLeft className="h-4 w-4" />
        </IconButton>
        <Popover
          align="left"
          className="w-[288px] p-3"
          trigger={({ toggle }) => (
            <button
              type="button"
              onClick={() => {
                setYear(Number(value.slice(0, 4)));
                toggle();
              }}
              aria-label={`Escolher o mês: ${monthLabel(value)}`}
              data-month-picker={value}
              className="flex min-w-[170px] items-center justify-center gap-2 rounded-[8px] px-2 py-1 font-display text-[15px] font-semibold text-ink transition-colors hover:bg-ink/[0.05]"
            >
              <CalendarDays className="h-4 w-4 shrink-0 text-faint" strokeWidth={1.6} aria-hidden />
              {monthLabel(value)}
            </button>
          )}
        >
          {(close) => (
            <div role="dialog" aria-label="Escolher o mês">
              <div className="mb-2 flex items-center justify-between">
                <IconButton label="Ano anterior" size="xs" onClick={() => setYear((y) => y - 1)} disabled={year <= years.min}>
                  <ChevronLeft className="h-4 w-4" />
                </IconButton>
                <span className="font-display text-[15px] font-semibold tabular text-ink" data-picker-year>
                  {year}
                </span>
                <IconButton label="Próximo ano" size="xs" onClick={() => setYear((y) => y + 1)} disabled={year >= years.max}>
                  <ChevronRight className="h-4 w-4" />
                </IconButton>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {MONTHS_FULL.map((name, i) => {
                  const key = `${year}-${String(i + 1).padStart(2, '0')}`;
                  const selected = key === value;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-label={monthLabel(key)}
                      aria-pressed={selected}
                      onClick={() => {
                        close();
                        onChange(key);
                      }}
                      className={cn(
                        'relative flex h-9 items-center justify-center rounded-[8px] text-[13px] transition-colors',
                        selected ? 'bg-ink font-medium text-surface' : key === current ? 'font-medium text-ink ring-1 ring-line-strong hover:bg-canvas' : 'text-stone-700 hover:bg-canvas',
                      )}
                    >
                      {name.slice(0, 3)}
                      {marked?.has(key) && (
                        <span className={cn('absolute bottom-1 h-1 w-1 rounded-full', selected ? 'bg-surface' : 'bg-accent')} aria-hidden />
                      )}
                    </button>
                  );
                })}
              </div>
              {value !== current && (
                <button
                  type="button"
                  onClick={() => {
                    close();
                    onChange(current);
                  }}
                  className="mt-2 w-full rounded-[8px] py-1.5 text-[12.5px] text-muted hover:bg-canvas hover:text-ink"
                >
                  Ir para o mês atual
                </button>
              )}
            </div>
          )}
        </Popover>
        <IconButton label="Próximo mês" onClick={() => onChange(shift(value, 1))} disabled={disabled}>
          <ChevronRight className="h-4 w-4" />
        </IconButton>
      </div>
      {value !== current && !disabled && (
        <button type="button" onClick={() => onChange(current)} className="text-[13px] text-faint hover:text-ink">
          Mês atual
        </button>
      )}
    </div>
  );
}
