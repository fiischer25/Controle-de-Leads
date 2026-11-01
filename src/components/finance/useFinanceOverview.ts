import { useMemo } from 'react';
import { accountBalances, addMonthsKey, monthKey, monthsBack, monthTotals, sum } from '../../lib/finance';
import { addDays, MONTHS_FULL, today } from '../../lib/utils';
import type { CashMonth } from './FinanceOverviewParts';
import { useFinance } from './useFinance';

/**
 * Números do Financeiro usados na Visão geral e nos dashboards (mesma conta em todo lugar):
 * o mês (o atual ou outro escolhido, até meses antigos), saldo, vencidos, próximos 30 dias, a receber
 * por mês e fluxo de caixa. `flow`: quantos meses antes e depois do mês escolhido entram no fluxo.
 * Vencidos, próximos 30 dias e a receber por mês são sempre a partir de hoje.
 */
export function useFinanceOverview(flow: { back: number; ahead: number } = { back: 5, ahead: 6 }, selected?: string) {
  const fin = useFinance();
  const t = today();
  const current = monthKey(t);
  const month = selected && /^\d{4}-\d{2}$/.test(selected) ? selected : current;
  const { back, ahead } = flow;

  return useMemo(() => {
    const totals = monthTotals(fin.entries, month);
    const period: 'passado' | 'atual' | 'futuro' = month < current ? 'passado' : month > current ? 'futuro' : 'atual';
    const startOfMonth = `${month}-01`;
    const endOfMonth = addDays(addMonthsKey(startOfMonth, 1), -1);
    // Saldo das contas (ativas) num dia: só o que já foi pago até ele
    const active = fin.accounts.filter((a) => a.active);
    const balanceAt = (day: string) => {
      const b = accountBalances(fin.accounts, fin.entries, day);
      return Math.round(active.reduce((acc, a) => acc + (b[a.id] ?? 0) * 100, 0)) / 100;
    };
    const in30 = addDays(t, 30);
    const open = fin.entries.filter((e) => !e.paid_at && e.kind !== 'transferencia');
    const total = (kind: 'receita' | 'despesa', pick: (due: string) => boolean) =>
      sum(open.filter((e) => e.kind === kind && pick(e.due_date)).map((e) => e.amount));
    // Saldo previsto no fim do mês (atual ou futuro): saldo de hoje + a receber − a pagar até o fim do mês (inclui vencidos)
    const projected = fin.totalBalance + total('receita', (d) => d <= endOfMonth) - total('despesa', (d) => d <= endOfMonth);
    const upcoming = open.filter((e) => e.due_date <= in30).sort((a, b) => a.due_date.localeCompare(b.due_date));
    // A receber por mês (este e os próximos 11): cada parcela no mês do vencimento
    const aheadMonths = monthsBack(monthKey(addMonthsKey(`${current}-01`, 11)), 12)
      .map((key) => {
        const items = open
          .filter((e) => e.kind === 'receita' && monthKey(e.due_date) === key && e.due_date >= `${current}-01`)
          .sort((a, b) => a.due_date.localeCompare(b.due_date));
        return { key, items, total: sum(items.map((e) => e.amount)) };
      })
      .filter((m) => m.items.length > 0);
    // Entradas e saídas de um mês: realizado nos passados, realizado + em aberto no atual, em aberto nos próximos
    const flowOf = (key: string) => {
      const m = monthTotals(fin.entries, key);
      const pendingIn = sum(open.filter((e) => e.kind === 'receita' && monthKey(e.due_date) === key).map((e) => e.amount));
      const pendingOut = sum(open.filter((e) => e.kind === 'despesa' && monthKey(e.due_date) === key).map((e) => e.amount));
      if (key > current) return { in: pendingIn, out: pendingOut };
      if (key === current) return { in: m.inPaid + pendingIn, out: m.outPaid + pendingOut };
      return { in: m.inPaid, out: m.outPaid };
    };
    // Fluxo de caixa ao redor do mês escolhido: as entradas de cada mês pagam as contas do mesmo mês
    const flowMonths: CashMonth[] = monthsBack(monthKey(addMonthsKey(`${month}-01`, ahead)), back + 1 + ahead).map((key) => {
      const [, mm] = key.split('-').map(Number);
      const own = flowOf(key);
      return {
        key,
        label: MONTHS_FULL[mm - 1].slice(0, 3),
        in: own.in,
        out: own.out,
        forecast: key > current,
        current: key === month,
      };
    });
    const byCategory: Record<string, number> = {};
    for (const e of fin.entries) {
      if (e.kind !== 'despesa' || monthKey(e.due_date) !== month) continue;
      const k = e.category_id ?? 'none';
      byCategory[k] = (byCategory[k] ?? 0) + e.amount;
    }
    return {
      month,
      period,
      totals,
      // Até agora: recebido − pago no mês
      result: Math.round((totals.inPaid - totals.outPaid) * 100) / 100,
      // Sobra prevista do mês: entradas do mês − contas do mês (as entradas pagam as contas do mesmo mês)
      leftover: Math.round((totals.inPlanned - totals.outPlanned) * 100) / 100,
      balance: fin.totalBalance,
      projected: Math.round(projected * 100) / 100,
      // Saldo no início e no fim do mês escolhido (meses passados: o que de fato ficou nas contas)
      balanceStart: balanceAt(addDays(startOfMonth, -1)),
      balanceEnd: period === 'passado' ? balanceAt(endOfMonth) : Math.round(projected * 100) / 100,
      upcoming,
      ahead: aheadMonths,
      flow: flowMonths,
      categories: Object.entries(byCategory).sort((a, b) => b[1] - a[1]),
      overdueIn: total('receita', (d) => d < t),
      overdueOut: total('despesa', (d) => d < t),
      receive30: total('receita', (d) => d >= t && d <= in30),
      pay30: total('despesa', (d) => d >= t && d <= in30),
      receivable: total('receita', () => true),
    };
  }, [fin.entries, fin.accounts, fin.totalBalance, month, current, t, back, ahead]);
}

export type FinanceOverview = ReturnType<typeof useFinanceOverview>;
