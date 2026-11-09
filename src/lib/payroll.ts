// Folha de pagamento: o salário de um mês (referência) é pago no mês seguinte, num dia fixo
// (ex.: salário de setembro pago em 05/10). Para cada pessoa com salário cadastrado, mostra se a
// folha do mês já foi lançada e paga. Funções puras.

import { addMonthsKey, monthKey } from './finance';
import type { FinanceEntry } from './types';

export const DEFAULT_PAYROLL_DAY = 5;

/** Categorias de salário (para a sugestão de referência e o aviso de folha lançada sem pessoa). */
export const SALARY_CATEGORY = /salári|salari|pró-labore|pro-labore|pro labore|folha/i;

/** Mês seguinte (AAAA-MM). */
export const nextMonth = (ref: string) => monthKey(addMonthsKey(`${ref}-01`, 1));
/** Mês anterior (AAAA-MM). */
export const prevMonth = (ref: string) => monthKey(addMonthsKey(`${ref}-01`, -1));

/** Dia do pagamento da folha do mês de referência: o dia escolhido do mês seguinte. */
export function payDate(ref: string, day = DEFAULT_PAYROLL_DAY): string {
  const d = Math.min(28, Math.max(1, Math.round(day || DEFAULT_PAYROLL_DAY)));
  return `${nextMonth(ref)}-${String(d).padStart(2, '0')}`;
}

export type PayrollStatus = 'nao_lancado' | 'a_pagar' | 'vencido' | 'pago';

export interface PayrollRow {
  memberId: string;
  /** Salário por mês (cadastro da pessoa); 0 = sem salário cadastrado. */
  salary: number;
  entry: FinanceEntry | null;
  status: PayrollStatus;
}

/** Salário lançado para a pessoa naquele mês de referência. */
export function payrollEntry(entries: FinanceEntry[], memberId: string, ref: string): FinanceEntry | null {
  return entries.find((e) => e.kind === 'despesa' && e.member_id === memberId && e.reference_month === ref) ?? null;
}

/**
 * Folha do mês de referência: uma linha por pessoa (as com salário cadastrado e as que já têm
 * salário lançado no mês), com a situação do pagamento.
 */
export function payrollRows(opts: {
  members: Array<{ id: string; salary: number }>;
  entries: FinanceEntry[];
  ref: string;
  today: string;
}): PayrollRow[] {
  const ids = new Set(opts.entries.filter((e) => e.kind === 'despesa' && e.member_id && e.reference_month === opts.ref).map((e) => e.member_id!));
  return opts.members
    .filter((m) => m.salary > 0 || ids.has(m.id))
    .map((m) => {
      const entry = payrollEntry(opts.entries, m.id, opts.ref);
      const status: PayrollStatus = !entry ? 'nao_lancado' : entry.paid_at ? 'pago' : entry.due_date < opts.today ? 'vencido' : 'a_pagar';
      return { memberId: m.id, salary: m.salary, entry, status };
    });
}

/** Totais da folha: lançado, pago, a pagar e o que falta lançar (pelo salário cadastrado). */
export function payrollTotals(rows: PayrollRow[]) {
  const cents = (v: number) => Math.round(v * 100);
  const sum = (list: number[]) => list.reduce((a, v) => a + cents(v), 0) / 100;
  return {
    total: sum(rows.map((r) => r.entry?.amount ?? r.salary)),
    paid: sum(rows.filter((r) => r.status === 'pago').map((r) => r.entry!.amount)),
    open: sum(rows.filter((r) => r.status === 'a_pagar' || r.status === 'vencido').map((r) => r.entry!.amount)),
    missing: sum(rows.filter((r) => r.status === 'nao_lancado').map((r) => r.salary)),
    people: rows.length,
  };
}

/**
 * Salários lançados sem pessoa (ex.: uma "Folha de pagamento" única) com vencimento no mês do
 * pagamento: lançar a folha por pessoa por cima disso duplicaria a despesa.
 */
export function genericPayroll(entries: FinanceEntry[], categoryName: (id: string | null) => string, ref: string): FinanceEntry[] {
  const pay = nextMonth(ref);
  return entries.filter(
    (e) => e.kind === 'despesa' && !e.member_id && monthKey(e.due_date) === pay && (SALARY_CATEGORY.test(categoryName(e.category_id)) || SALARY_CATEGORY.test(e.description)),
  );
}
