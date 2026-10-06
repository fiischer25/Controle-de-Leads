import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, Scale, Wallet } from 'lucide-react';
import { useData } from '../../context/DataContext';
import type { FinanceEntry } from '../../lib/types';
import { cn, formatCurrency, formatDateShort, formatMoney, MONTHS_FULL, today } from '../../lib/utils';
import { ActionLink, SectionHeader } from '../ui';
import { EntryFormModal } from '../finance/EntryFormModal';
import { CashFlowChart, KpiCard } from '../finance/FinanceOverviewParts';
import { useFinance } from '../finance/useFinance';
import { useFinanceOverview } from '../finance/useFinanceOverview';

/**
 * Financeiro nos dashboards (Escritório e Meu painel), com os mesmos números da tela Financeiro:
 * saldo, entradas, saídas e resultado do mês, a receber/pagar em 30 dias, vencidos, fluxo de caixa
 * (no Escritório) e a lista do que venceu e vence nos próximos 30 dias.
 */
export function FinanceSnapshot({ variant }: { variant: 'office' | 'personal' }) {
  const data = useFinanceOverview({ back: 2, ahead: 3 });
  const [editing, setEditing] = useState<FinanceEntry | null>(null);
  const [y, m] = data.month.split('-').map(Number);
  const office = variant === 'office';

  const chips: Array<{ label: string; value: number; tone: 'success' | 'danger' | 'neutral' }> = [
    { label: 'A receber em 30 dias', value: data.receive30, tone: 'success' },
    { label: 'A pagar em 30 dias', value: data.pay30, tone: 'neutral' },
    ...(data.overdueIn > 0 ? [{ label: 'A receber vencido', value: data.overdueIn, tone: 'danger' as const }] : []),
    ...(data.overdueOut > 0 ? [{ label: 'A pagar vencido', value: data.overdueOut, tone: 'danger' as const }] : []),
  ];

  return (
    <section aria-labelledby={`fin-${variant}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id={`fin-${variant}`} className="text-[12px] font-medium uppercase tracking-[0.08em] text-faint">
          Financeiro · {MONTHS_FULL[m - 1].toLowerCase()} de {y}
        </h2>
        <ActionLink to="/financeiro" muted>
          Abrir Financeiro
        </ActionLink>
      </div>
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
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
          value={`${data.result < 0 ? '−' : ''}${formatCurrency(Math.abs(data.result))}`}
          tone={data.result < 0 ? 'danger' : data.result > 0 ? 'success' : 'neutral'}
          icon={<Scale className="h-4 w-4" strokeWidth={1.6} />}
          sub="recebido − pago"
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
        {chips.map((c) => (
          <Link
            key={c.label}
            to="/financeiro?aba=lancamentos"
            className={cn(
              'rounded-full border px-3 py-1.5 hover:brightness-95',
              c.tone === 'success'
                ? 'border-success-line bg-success-bg text-success-fg'
                : c.tone === 'danger'
                  ? 'border-danger-line bg-danger-bg text-danger-fg'
                  : 'border-line bg-surface text-muted',
            )}
          >
            {c.label}: <b className="font-semibold tabular">{formatMoney(c.value)}</b>
          </Link>
        ))}
      </div>

      <div className={cn('mt-6 grid items-start gap-6 md:gap-8', office && 'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]')}>
        {office && (
          <section aria-labelledby="dash-fluxo" className="panel min-w-0">
            <SectionHeader id="dash-fluxo" title="Fluxo de caixa" aside={<span className="text-[12.5px] text-faint">realizado · previsto</span>} />
            <CashFlowChart months={data.flow} />
          </section>
        )}
        <section aria-labelledby={`dash-venc-${variant}`} className="panel min-w-0">
          <SectionHeader
            id={`dash-venc-${variant}`}
            title="Vencidos e próximos 30 dias"
            aside={
              <ActionLink to="/financeiro?aba=lancamentos" muted>
                Lançamentos
              </ActionLink>
            }
          />
          <DueList entries={data.upcoming} limit={office ? 7 : 5} onOpen={setEditing} />
        </section>
      </div>
      {editing && <EntryFormModal entry={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

/** Lista curta de vencimentos: data, descrição (cliente/projeto · parcela) e valor (+ entrada, − saída). */
function DueList({ entries, limit, onOpen }: { entries: FinanceEntry[]; limit: number; onOpen: (e: FinanceEntry) => void }) {
  const { maps } = useData();
  const fin = useFinance();
  const t = today();
  if (entries.length === 0) return <p className="border-t border-hairline py-4 text-[13px] text-faint">Nada vencido nem vencendo nos próximos 30 dias.</p>;
  return (
    <ul>
      {entries.slice(0, limit).map((e) => {
        const late = e.due_date < t;
        const receita = e.kind === 'receita';
        const who = (e.project_id && maps.projects[e.project_id]?.name) || (e.client_id && maps.clients[e.client_id]?.name) || (e.category_id && fin.categoryMap[e.category_id]?.name) || '';
        return (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onOpen(e)}
              className="grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 border-t border-hairline py-2.5 text-left transition-colors hover:bg-ink/[0.025]"
            >
              <span className={cn('text-[12.5px] tabular', late ? 'text-danger-fg' : 'text-muted')}>{formatDateShort(e.due_date)}</span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] text-ink">{e.description}</span>
                <span className="flex min-w-0 gap-1 text-[12.5px] text-faint">
                  <span className="truncate">{late ? 'vencido' : receita ? 'a receber' : 'a pagar'}{who && ` · ${who}`}</span>
                  {e.installments ? <span className="shrink-0 tabular">· {e.installment}/{e.installments}</span> : null}
                </span>
              </span>
              <span className={cn('whitespace-nowrap text-right text-[13.5px] font-medium tabular', receita ? 'text-success-fg' : 'text-ink')}>
                {receita ? '+' : '−'}
                {formatMoney(e.amount)}
              </span>
            </button>
          </li>
        );
      })}
      {entries.length > limit && (
        <li className="border-t border-hairline pt-3 text-[12.5px] text-faint">
          e mais {entries.length - limit} ·{' '}
          <ActionLink to="/financeiro?aba=lancamentos" muted>
            ver todos
          </ActionLink>
        </li>
      )}
    </ul>
  );
}
