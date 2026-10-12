import { useMemo } from 'react';
import { addMonthsKey, monthKey, monthsBack, monthTotals, sum } from '../../lib/finance';
import { addDays, MONTHS_FULL, today } from '../../lib/utils';
import type { CashMonth } from './FinanceOverviewParts';
import { useFinance } from './useFinance';
import { useCashMode } from './cashMode';

/**
 * Números do Financeiro usados na Visão geral e nos dashboards (mesma conta em todo lugar):
 * mês atual, saldo previsto, vencidos, próximos 30 dias, a receber por mês e fluxo de caixa.
 * `flow`: quantos meses realizados antes do atual e quantos previstos depois.
 */
export function useFinanceOverview(flow: { back: number; ahead: number } = { back: 5, ahead: 6 }) {
  const fin = useFinance();
  const [mode] = useCashMode();
  const t = today();
  const month = monthKey(t);
  const { back, ahead } = flow;

  return useMemo(() => {
    const totals = monthTotals(fin.entries, month);
    const endOfMonth = addDays(addMonthsKey(`${month}-01`, 1), -1);
    const in30 = addDays(t, 30);
    const open = fin.entries.filter((e) => !e.paid_at && e.kind !== 'transferencia');
    const total = (kind: 'receita' | 'despesa', pick: (due: string) => boolean) =>
      sum(open.filter((e) => e.kind === kind && pick(e.due_date)).map((e) => e.amount));
    // Saldo previsto no fim do mês: saldo atual + a receber − a pagar até o fim do mês (inclui vencidos)
    const projected = fin.totalBalance + total('receita', (d) => d <= endOfMonth) - total('despesa', (d) => d <= endOfMonth);
    const upcoming = open.filter((e) => e.due_date <= in30).sort((a, b) => a.due_date.localeCompare(b.due_date));
    // A receber por mês (este e os próximos 11): cada parcela no mês do vencimento
    const aheadMonths = monthsBack(monthKey(addMonthsKey(`${month}-01`, 11)), 12)
      .map((key) => {
        const items = open
          .filter((e) => e.kind === 'receita' && monthKey(e.due_date) === key && e.due_date >= `${month}-01`)
          .sort((a, b) => a.due_date.localeCompare(b.due_date));
        return { key, items, total: sum(items.map((e) => e.amount)) };
      })
      .filter((m) => m.items.length > 0);
    // Entradas e saídas de um mês: realizado nos passados, realizado + em aberto no atual, em aberto nos próximos
    const flowOf = (key: string) => {
      const m = monthTotals(fin.entries, key);
      const pendingIn = sum(open.filter((e) => e.kind === 'receita' && monthKey(e.due_date) === key).map((e) => e.amount));
      const pendingOut = sum(open.filter((e) => e.kind === 'despesa' && monthKey(e.due_date) === key).map((e) => e.amount));
      if (key > month) return { in: pendingIn, out: pendingOut };
      if (key === month) return { in: m.inPaid + pendingIn, out: m.outPaid + pendingOut };
      return { in: m.inPaid, out: m.outPaid };
    };
    const prevOf = (key: string) => monthKey(addMonthsKey(`${key}-01`, -1));
    // Fluxo de caixa. No caixa do "mês seguinte", cada mês compara o que entrou no mês anterior com as contas do mês
    const flowMonths: CashMonth[] = monthsBack(monthKey(addMonthsKey(`${month}-01`, ahead)), back + 1 + ahead).map((key) => {
      const [, mm] = key.split('-').map(Number);
      const own = flowOf(key);
      return {
        key,
        label: MONTHS_FULL[mm - 1].slice(0, 3),
        in: mode === 'seguinte' ? flowOf(prevOf(key)).in : own.in,
        out: own.out,
        forecast: key > month,
        current: key === month,
      };
    });
    // Caixa do mês seguinte: recebido no mês passado x contas deste mês; e o que entra agora x contas do próximo
    const prevMonth = prevOf(month);
    const nextMonth = monthKey(addMonthsKey(`${month}-01`, 1));
    const prevTotals = monthTotals(fin.entries, prevMonth);
    const nextTotals = monthTotals(fin.entries, nextMonth);
    const receivingNow = Math.round((totals.inPaid + totals.inOpen) * 100) / 100;
    const cycle = {
      prevMonth,
      nextMonth,
      receivedPrev: prevTotals.inPaid,
      bills: totals.outPlanned,
      billsPaid: totals.outPaid,
      leftover: Math.round((prevTotals.inPaid - totals.outPlanned) * 100) / 100,
      receivedNow: totals.inPaid,
      receivingNow,
      nextBills: nextTotals.outPlanned,
      nextLeftover: Math.round((receivingNow - nextTotals.outPlanned) * 100) / 100,
    };
    const byCategory: Record<string, number> = {};
    for (const e of fin.entries) {
      if (e.kind !== 'despesa' || monthKey(e.due_date) !== month) continue;
      const k = e.category_id ?? 'none';
      byCategory[k] = (byCategory[k] ?? 0) + e.amount;
    }
    return {
      month,
      mode,
      cycle,
      totals,
      result: Math.round((totals.inPaid - totals.outPaid) * 100) / 100,
      balance: fin.totalBalance,
      projected: Math.round(projected * 100) / 100,
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
  }, [fin.entries, fin.totalBalance, month, t, back, ahead, mode]);
}

export type FinanceOverview = ReturnType<typeof useFinanceOverview>;
