import { useState, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, ChevronDown, ChevronRight, Scale, Wallet } from 'lucide-react';
import type { FinanceEntry } from '../../lib/types';
import { cn, formatCurrency, formatMoney, MONTHS_FULL } from '../../lib/utils';
import { useCashMode } from './cashMode';
import type { FinanceOverview } from './useFinanceOverview';
import { ActionLink, FitText } from '../ui';
import { EntryList } from './EntryList';

/** Cartão de indicador: rótulo, valor em destaque, detalhe e barra de progresso opcional. */
export function KpiCard({
  label,
  value,
  sub,
  tone = 'neutral',
  progress,
  icon,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: 'neutral' | 'success' | 'danger';
  /** Ex.: recebido / previsto no mês. */
  progress?: { value: number; max: number; tone: 'success' | 'danger' | 'neutral' };
  icon?: ReactNode;
}) {
  const pct = progress && progress.max > 0 ? Math.min(100, Math.round((progress.value / progress.max) * 100)) : 0;
  return (
    <div className="metric-tile md:px-5">
      <div className="flex items-center justify-between gap-2 text-[12.5px] font-medium text-muted">
        {label}
        {icon && <span className="text-faint">{icon}</span>}
      </div>
      <FitText
        className={cn(
          'mt-1.5 font-display text-[22px] font-semibold leading-7 tabular tracking-[-0.015em] md:mt-2 md:text-[28px] md:leading-8',
          tone === 'success' ? 'text-success-fg' : tone === 'danger' ? 'text-danger-fg' : 'text-ink',
        )}
      >
        {value}
      </FitText>
      {progress && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-100" aria-hidden>
          <div
            className={cn('h-full rounded-full', progress.tone === 'success' ? 'bg-success-solid' : progress.tone === 'danger' ? 'bg-danger-solid' : 'bg-stone-500')}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {sub && <div className="mt-2 text-[12.5px] text-muted">{sub}</div>}
    </div>
  );
}

export interface CashMonth {
  key: string;
  label: string;
  in: number;
  out: number;
  /** Mês futuro (previsto pelos vencimentos em aberto). */
  forecast: boolean;
  current: boolean;
}

/**
 * Fluxo de caixa: entradas e saídas por mês, realizadas nos meses passados e previstas nos
 * próximos (pelos vencimentos em aberto), com o resultado de cada mês.
 */
export function CashFlowChart({ months }: { months: CashMonth[] }) {
  const [mode] = useCashMode();
  const inLabel = mode === 'seguinte' ? 'Recebido no mês anterior' : 'Entradas';
  const outLabel = mode === 'seguinte' ? 'Contas do mês' : 'Saídas';
  const max = Math.max(1, ...months.flatMap((m) => [m.in, m.out]));
  return (
    <div>
      <div className="flex items-center gap-5 pb-4 text-[12.5px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-success-solid" aria-hidden /> {inLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-danger-solid" aria-hidden /> {outLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-stone-400" aria-hidden /> Previsto
        </span>
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
        {months.map((m) => {
          const result = Math.round((m.in - m.out) * 100) / 100;
          return (
            <div key={m.key} className={cn('flex flex-col items-center rounded-lg px-1 pb-2 pt-3', m.current && 'bg-subtle ring-1 ring-line')}>
              <div className="flex h-40 w-full items-end justify-center gap-1">
                {(['in', 'out'] as const).map((k) => (
                  <div
                    key={k}
                    title={`${k === 'in' ? inLabel : outLabel}${m.forecast ? ' (previsto)' : ''} · ${m.label}: ${formatMoney(m[k])}`}
                    className={cn(
                      'w-1/3 max-w-[18px] rounded-t-[3px]',
                      k === 'in' ? 'bg-success-solid' : 'bg-danger-solid',
                      m.forecast && 'opacity-40 outline-dashed outline-1 outline-offset-0',
                    )}
                    style={{ height: `${Math.max(m[k] > 0 ? 3 : 0, (m[k] / max) * 100)}%` }}
                  />
                ))}
              </div>
              <div className={cn('mt-2 text-[12px]', m.current ? 'font-semibold text-ink' : 'text-faint')}>{m.label}</div>
              <div className={cn('text-[11.5px] tabular', result < 0 ? 'text-danger-fg' : result > 0 ? 'text-success-fg' : 'text-faint')} title={formatMoney(result)}>
                {result === 0 ? '—' : `${result > 0 ? '+' : '−'}${formatCurrency(Math.abs(result)).replace('R$', '').trim()}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A receber por mês: tabela com parcelas e valor de cada mês; clique para ver as parcelas. */
export function ReceivablesByMonth({
  months,
  onOpen,
  monthLabel,
}: {
  months: Array<{ key: string; items: FinanceEntry[]; total: number }>;
  onOpen: (e: FinanceEntry) => void;
  monthLabel: (key: string) => string;
}) {
  const [open, setOpen] = useState<string | null>(months[0]?.key ?? null);
  const max = Math.max(1, ...months.map((m) => m.total));
  if (months.length === 0) return <p className="border-t border-hairline py-4 text-[13px] text-faint">Nenhuma receita em aberto nos próximos 12 meses.</p>;
  return (
    <div className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-card">
      <div className="grid grid-cols-[minmax(0,1fr)_90px_140px_minmax(0,1.2fr)_90px] gap-4 border-b border-line bg-subtle px-4 py-2.5 text-[12px] font-medium text-faint">
        <span>Mês</span>
        <span className="text-right">Parcelas</span>
        <span className="text-right">A receber</span>
        <span />
        <span />
      </div>
      {months.map((m) => {
        const isOpen = open === m.key;
        return (
          <div key={m.key} className="border-b border-line/70 last:border-b-0">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : m.key)}
              aria-expanded={isOpen}
              className="grid w-full grid-cols-[minmax(0,1fr)_90px_140px_minmax(0,1.2fr)_90px] items-center gap-4 px-4 py-3 text-left hover:bg-subtle"
            >
              <span className="flex items-center gap-2 text-[14px] font-medium text-ink">
                {isOpen ? <ChevronDown className="h-4 w-4 text-faint" /> : <ChevronRight className="h-4 w-4 text-faint" />}
                {monthLabel(m.key)}
              </span>
              <span className="text-right text-[13.5px] tabular text-muted">{m.items.length}</span>
              <span className="text-right text-[14px] font-semibold tabular text-success-fg">{formatMoney(m.total)}</span>
              <span className="h-2 overflow-hidden rounded-full bg-stone-100" aria-hidden>
                <span className="block h-full rounded-full bg-success-solid/70" style={{ width: `${(m.total / max) * 100}%` }} />
              </span>
              <span className="text-right" onClick={(e) => e.stopPropagation()}>
                <ActionLink to={`/financeiro?aba=lancamentos&mes=${m.key}`} muted>
                  Ver mês
                </ActionLink>
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-line/70 bg-subtle/50 px-4 pb-2">
                <EntryList entries={m.items} onOpen={onOpen} compact />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const monthName = (key: string) => MONTHS_FULL[Number(key.split('-')[1]) - 1].toLowerCase();
const signed = (v: number) => `${v < 0 ? '−' : ''}${formatCurrency(Math.abs(v))}`;

/** Seletor de como o caixa é organizado (o que entra paga o mês seguinte ou o próprio mês). */
export function CashModeSwitch() {
  const [mode, setMode] = useCashMode();
  const opt = (m: typeof mode, label: string, title: string) => (
    <button
      type="button"
      aria-pressed={mode === m}
      title={title}
      onClick={() => setMode(m)}
      className={cn('rounded-full px-3 py-1 transition-colors', mode === m ? 'bg-ink text-surface' : 'text-muted hover:text-ink')}
    >
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="Organização do caixa" className="inline-flex items-center gap-0.5 rounded-full border border-line bg-surface p-0.5 text-[12.5px]">
      {opt('seguinte', 'Entradas pagam o mês seguinte', 'O que entra num mês paga as contas do mês seguinte')}
      {opt('mesmo', 'Mesmo mês', 'Entradas e contas do mesmo mês')}
    </div>
  );
}

/**
 * Cartões do mês. No caixa do "mês seguinte": saldo, recebido no mês anterior, contas deste mês e a
 * sobra; abaixo, o que está entrando agora para as contas do próximo mês. No "mesmo mês": entradas,
 * saídas e resultado do mês.
 */
export function MonthCards({ data }: { data: FinanceOverview }) {
  const saldo = (
    <KpiCard
      label="Saldo em contas"
      value={formatCurrency(data.balance)}
      tone={data.balance < 0 ? 'danger' : 'neutral'}
      icon={<Wallet className="h-4 w-4" strokeWidth={1.6} />}
      sub={
        <>
          Previsto no fim do mês: <b className="font-medium text-ink">{formatCurrency(data.projected)}</b>
        </>
      }
    />
  );
  if (data.mode === 'mesmo') {
    return (
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {saldo}
        <KpiCard
          label="Entradas do mês"
          value={formatCurrency(data.totals.inPaid)}
          tone="success"
          icon={<ArrowDownLeft className="h-4 w-4" strokeWidth={1.6} />}
          progress={{ value: data.totals.inPaid, max: data.totals.inPlanned, tone: 'success' }}
          sub={`recebido de ${formatCurrency(data.totals.inPlanned)} previsto`}
        />
        <KpiCard
          label="Saídas do mês"
          value={formatCurrency(data.totals.outPaid)}
          tone="danger"
          icon={<ArrowUpRight className="h-4 w-4" strokeWidth={1.6} />}
          progress={{ value: data.totals.outPaid, max: data.totals.outPlanned, tone: 'danger' }}
          sub={`pago de ${formatCurrency(data.totals.outPlanned)} previsto`}
        />
        <KpiCard
          label="Resultado do mês"
          value={signed(data.result)}
          tone={data.result < 0 ? 'danger' : data.result > 0 ? 'success' : 'neutral'}
          icon={<Scale className="h-4 w-4" strokeWidth={1.6} />}
          sub="recebido − pago"
        />
      </div>
    );
  }
  const c = data.cycle;
  const prev = monthName(c.prevMonth);
  const cur = monthName(data.month);
  const next = monthName(c.nextMonth);
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {saldo}
        <KpiCard
          label={`Recebido em ${prev}`}
          value={formatCurrency(c.receivedPrev)}
          tone="success"
          icon={<ArrowDownLeft className="h-4 w-4" strokeWidth={1.6} />}
          sub={`para pagar as contas de ${cur}`}
        />
        <KpiCard
          label={`Contas de ${cur}`}
          value={formatCurrency(c.bills)}
          tone="danger"
          icon={<ArrowUpRight className="h-4 w-4" strokeWidth={1.6} />}
          progress={{ value: c.billsPaid, max: c.bills, tone: 'danger' }}
          sub={`pago ${formatCurrency(c.billsPaid)} · falta ${formatCurrency(Math.max(0, c.bills - c.billsPaid))}`}
        />
        <KpiCard
          label={`Sobra de ${cur}`}
          value={signed(c.leftover)}
          tone={c.leftover < 0 ? 'danger' : c.leftover > 0 ? 'success' : 'neutral'}
          icon={<Scale className="h-4 w-4" strokeWidth={1.6} />}
          sub={`recebido em ${prev} − contas de ${cur}`}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[14px] border border-line bg-surface px-4 py-3 text-[13px] text-muted" data-next-cycle>
        <span>
          Entrando em {cur}: <b className="font-semibold tabular text-success-fg">{formatMoney(c.receivedNow)}</b> recebido de{' '}
          <b className="font-medium tabular text-ink">{formatMoney(c.receivingNow)}</b> previsto
        </span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />
        <span>
          contas de {next}: <b className="font-medium tabular text-ink">{formatMoney(c.nextBills)}</b>
        </span>
        <span className="text-faint">·</span>
        <span>
          sobra prevista: <b className={cn('font-semibold tabular', c.nextLeftover < 0 ? 'text-danger-fg' : 'text-success-fg')}>{formatMoney(c.nextLeftover)}</b>
        </span>
      </div>
    </div>
  );
}
