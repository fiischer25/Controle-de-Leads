// Forma de pagamento (honorários): rascunho editável, validação e resumo.
// Usado no fechamento da oportunidade e no plano de honorários do projeto.

import { feePlan, splitByPercent, type FeePreset, type PlanRow } from './finance';
import { today } from './utils';

/** Rascunho da forma de pagamento: modelo, nº de parcelas (mensal), 1º vencimento e parcelas. */
export interface PlanDraft {
  preset: FeePreset;
  months: number;
  first: string;
  rows: PlanRow[];
}

export function newPlanDraft(first = today(), preset: FeePreset = '30-40-30', months = 6): PlanDraft {
  return { preset, months, first, rows: feePlan(preset, first, months) };
}

export function planPercentSum(rows: PlanRow[]): number {
  return Math.round(rows.reduce((a, r) => a + (Number(r.percent) || 0), 0) * 100) / 100;
}

/** Valores de cada parcela (vazio enquanto o total ou os percentuais não fecham). */
export function planAmounts(total: number | null, rows: PlanRow[]): number[] {
  return total && total > 0 && planPercentSum(rows) === 100 ? splitByPercent(total, rows.map((r) => Number(r.percent) || 0)) : [];
}

/** Mensagem de erro do plano, ou null se estiver pronto para lançar. */
export function validatePlan(total: number | null, rows: PlanRow[]): string | null {
  if (!total || total <= 0) return 'Informe o valor.';
  if (rows.length === 0) return 'Inclua ao menos uma parcela.';
  const sum = planPercentSum(rows);
  if (sum !== 100) return `Os percentuais somam ${sum}%: precisam somar 100%.`;
  if (rows.some((r) => !r.due_date)) return 'Informe a data de cada parcela.';
  return null;
}

/** Resumo de uma linha: "3 parcelas (30% · 40% · 30%), 1ª em 10/10/2026". */
export function planSummary(rows: PlanRow[]): string {
  if (!rows.length) return '';
  const [y, m, d] = rows[0].due_date.split('-');
  const first = `${d}/${m}/${y}`;
  if (rows.length === 1) return `à vista em ${first}`;
  const pct = rows.length <= 4 ? ` (${rows.map((r) => `${Number(r.percent).toLocaleString('pt-BR')}%`).join(' · ')})` : '';
  return `${rows.length} parcelas${pct}, 1ª em ${first}`;
}

