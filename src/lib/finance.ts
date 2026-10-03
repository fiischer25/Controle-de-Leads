// Regras do Financeiro: status dos lançamentos, saldos das contas, parcelas e repetições,
// planos de honorários e rentabilidade dos projetos. Funções puras (sem React nem banco).
// Valores em reais; as contas são feitas em centavos para não acumular erro de arredondamento.

import type { FinanceAccount, FinanceEntry, FinanceMemberCost, Task, TimeEntry } from './types';
import { entryMinutes } from './domain';
import { uid } from './utils';

export type EntryStatus = 'pago' | 'pendente' | 'vencido';

const cents = (v: number) => Math.round(v * 100);
const reais = (c: number) => c / 100;

export function entryStatus(e: Pick<FinanceEntry, 'paid_at' | 'due_date'>, today: string): EntryStatus {
  if (e.paid_at) return 'pago';
  return e.due_date < today ? 'vencido' : 'pendente';
}

/** Data efetiva do lançamento: pagamento quando pago, vencimento quando pendente. */
export function entryDate(e: Pick<FinanceEntry, 'paid_at' | 'due_date'>): string {
  return e.paid_at ?? e.due_date;
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** Soma `n` meses a uma data AAAA-MM-DD, mantendo o dia (ou o último dia do mês). */
export function addMonthsKey(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** Lista de meses (AAAA-MM) terminando em `last`, do mais antigo ao mais novo. */
export function monthsBack(last: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => monthKey(addMonthsKey(`${last}-01`, i - count + 1)));
}

/** Saldo de cada conta: saldo inicial + recebimentos − pagamentos ± transferências (só o que já foi pago). */
export function accountBalances(accounts: FinanceAccount[], entries: FinanceEntry[], upTo?: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of accounts) out[a.id] = cents(a.opening_balance || 0);
  for (const e of entries) {
    if (!e.paid_at || (upTo && e.paid_at > upTo)) continue;
    const v = cents(e.amount);
    if (e.kind === 'receita' && e.account_id && e.account_id in out) out[e.account_id] += v;
    if (e.kind === 'despesa' && e.account_id && e.account_id in out) out[e.account_id] -= v;
    if (e.kind === 'transferencia') {
      if (e.account_id && e.account_id in out) out[e.account_id] -= v;
      if (e.to_account_id && e.to_account_id in out) out[e.to_account_id] += v;
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, c]) => [k, reais(c)]));
}

export interface MonthTotals {
  /** Recebido no mês (receitas pagas com data de pagamento no mês). */
  inPaid: number;
  /** Pago no mês (despesas pagas com data de pagamento no mês). */
  outPaid: number;
  /** Previsto: receitas com vencimento no mês (pagas ou não). */
  inPlanned: number;
  /** Previsto: despesas com vencimento no mês (pagas ou não). */
  outPlanned: number;
  /** Ainda a receber / a pagar com vencimento no mês. */
  inOpen: number;
  outOpen: number;
}

export function monthTotals(entries: FinanceEntry[], month: string): MonthTotals {
  const t = { inPaid: 0, outPaid: 0, inPlanned: 0, outPlanned: 0, inOpen: 0, outOpen: 0 };
  for (const e of entries) {
    if (e.kind === 'transferencia') continue;
    const v = cents(e.amount);
    const inc = e.kind === 'receita';
    if (e.paid_at && monthKey(e.paid_at) === month) {
      if (inc) t.inPaid += v;
      else t.outPaid += v;
    }
    if (monthKey(e.due_date) === month) {
      if (inc) t.inPlanned += v;
      else t.outPlanned += v;
      if (!e.paid_at) {
        if (inc) t.inOpen += v;
        else t.outOpen += v;
      }
    }
  }
  return Object.fromEntries(Object.entries(t).map(([k, c]) => [k, reais(c)])) as unknown as MonthTotals;
}

/** Soma de valores em reais sem erro de arredondamento. */
export function sum(values: number[]): number {
  return reais(values.reduce((acc, v) => acc + cents(v), 0));
}

/** Divide um total em partes iguais (a diferença de centavos vai para a primeira). */
export function splitEqual(total: number, parts: number): number[] {
  const n = Math.max(1, Math.floor(parts));
  const c = cents(total);
  const base = Math.floor(c / n);
  return Array.from({ length: n }, (_, i) => reais(base + (i === 0 ? c - base * n : 0)));
}

/** Divide um total por percentuais (a diferença de centavos vai para a última parte). */
export function splitByPercent(total: number, percents: number[]): number[] {
  const c = cents(total);
  const parts = percents.map((p) => Math.round((c * p) / 100));
  if (parts.length) parts[parts.length - 1] += c - parts.reduce((a, b) => a + b, 0);
  return parts.map(reais);
}

export type RepeatMode = 'unica' | 'parcelas' | 'mensal';

export type EntryDraft = Omit<FinanceEntry, 'id' | 'series_id' | 'installment' | 'installments' | 'created_at' | 'updated_at'>;

/**
 * Gera os lançamentos de um cadastro:
 * - única: um lançamento;
 * - parcelas: divide o valor em N parcelas mensais;
 * - mensal: repete o mesmo valor por N meses (ex.: aluguel).
 * Se o rascunho vier pago, só a primeira parcela fica paga.
 */
export function buildSeries(draft: EntryDraft, mode: RepeatMode, count: number, now: string): FinanceEntry[] {
  const n = mode === 'unica' ? 1 : Math.min(120, Math.max(1, Math.floor(count)));
  const amounts = mode === 'parcelas' ? splitEqual(draft.amount, n) : Array.from({ length: n }, () => draft.amount);
  const seriesId = n > 1 ? uid() : null;
  return amounts.map((amount, i) => ({
    ...draft,
    id: uid(),
    amount,
    due_date: addMonthsKey(draft.due_date, i),
    paid_at: i === 0 ? draft.paid_at : null,
    series_id: seriesId,
    installment: n > 1 ? i + 1 : null,
    installments: n > 1 ? n : null,
    created_at: now,
    updated_at: now,
  }));
}

// ---------------------------------------------------------------- honorários
export interface PlanRow {
  label: string;
  percent: number;
  due_date: string;
}

export type FeePreset = 'avista' | '50-50' | '30-40-30' | 'mensal';

export const FEE_PRESETS: Array<{ id: FeePreset; label: string }> = [
  { id: '30-40-30', label: '30% · 40% · 30%' },
  { id: '50-50', label: '50% · 50%' },
  { id: 'avista', label: 'À vista' },
  { id: 'mensal', label: 'Parcelas mensais iguais' },
];

/** Plano de parcelas dos honorários a partir de um modelo (datas mês a mês a partir da primeira). */
export function feePlan(preset: FeePreset, firstDue: string, months = 3): PlanRow[] {
  const rows = (labels: string[], percents: number[]) =>
    labels.map((label, i) => ({ label, percent: percents[i], due_date: addMonthsKey(firstDue, i) }));
  switch (preset) {
    case 'avista':
      return rows(['Assinatura do contrato'], [100]);
    case '50-50':
      return rows(['Assinatura do contrato', 'Entrega do projeto'], [50, 50]);
    case '30-40-30':
      return rows(['Assinatura do contrato', 'Aprovação do anteprojeto', 'Entrega do projeto executivo'], [30, 40, 30]);
    case 'mensal': {
      const n = Math.min(36, Math.max(1, Math.floor(months)));
      const base = Math.floor((100 / n) * 100) / 100;
      return Array.from({ length: n }, (_, i) => ({
        label: `Parcela ${i + 1}`,
        percent: i === n - 1 ? Math.round((100 - base * (n - 1)) * 100) / 100 : base,
        due_date: addMonthsKey(firstDue, i),
      }));
    }
  }
}

// ---------------------------------------------------------------- rentabilidade
export interface ProjectFinance {
  /** Honorários lançados para o projeto (recebidos ou não). */
  contracted: number;
  received: number;
  receivable: number;
  /** Receitas vencidas e não recebidas. */
  overdue: number;
  expenses: number;
  minutes: number;
  hoursCost: number;
  /** Pessoas com horas no projeto e sem custo/hora cadastrado. */
  missingCost: string[];
  result: number;
  /** Resultado ÷ contrato (null sem contrato). */
  margin: number | null;
}

export function projectFinance(opts: {
  projectId: string;
  entries: FinanceEntry[];
  tasks: Pick<Task, 'id' | 'project_id'>[];
  timeEntries: TimeEntry[];
  costs: FinanceMemberCost[];
  today: string;
}): ProjectFinance {
  const { projectId, entries, today } = opts;
  const mine = entries.filter((e) => e.project_id === projectId);
  const income = mine.filter((e) => e.kind === 'receita');
  const contracted = sum(income.map((e) => e.amount));
  const received = sum(income.filter((e) => e.paid_at).map((e) => e.amount));
  const overdue = sum(income.filter((e) => !e.paid_at && e.due_date < today).map((e) => e.amount));
  const expenses = sum(mine.filter((e) => e.kind === 'despesa').map((e) => e.amount));

  const taskIds = new Set(opts.tasks.filter((t) => t.project_id === projectId).map((t) => t.id));
  const costOf = new Map(opts.costs.map((c) => [c.user_id, c.hourly_cost]));
  let minutes = 0;
  let costCents = 0;
  const missing = new Set<string>();
  for (const te of opts.timeEntries) {
    if (!taskIds.has(te.task_id)) continue;
    const m = entryMinutes(te);
    minutes += m;
    const rate = costOf.get(te.user_id);
    if (!rate) missing.add(te.user_id);
    else costCents += Math.round((m / 60) * rate * 100);
  }
  const hoursCost = reais(costCents);
  const result = reais(cents(contracted) - cents(expenses) - costCents);
  return {
    contracted,
    received,
    receivable: reais(cents(contracted) - cents(received)),
    overdue,
    expenses,
    minutes,
    hoursCost,
    missingCost: [...missing],
    result,
    margin: contracted > 0 ? result / contracted : null,
  };
}
