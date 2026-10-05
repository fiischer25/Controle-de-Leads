// Forma de pagamento (honorários): rascunho editável, validação e resumo.
// Usado no fechamento da oportunidade e no plano de honorários do projeto.

import { feePlan, type FeePreset, type PlanRow } from './finance';
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

const toCents = (v: number) => Math.round(v * 100);
const round2 = (v: number) => Math.round(v * 100) / 100;
const isFixed = (r: PlanRow) => r.amount != null && Number.isFinite(r.amount);

/** Percentual de cada parcela: digitado, ou calculado do valor em R$ (quando o valor é fixo). */
export function rowPercent(total: number | null, r: PlanRow): number {
  if (isFixed(r)) return total && total > 0 ? round2((r.amount! / total) * 100) : 0;
  return Number(r.percent) || 0;
}

export function planPercentSum(rows: PlanRow[], total: number | null = null): number {
  return round2(rows.reduce((a, r) => a + rowPercent(total, r), 0));
}

/**
 * Valores de cada parcela: os digitados em R$ ficam como estão e os demais saem do percentual
 * (a última parcela por percentual absorve os centavos do arredondamento). Vazio enquanto o
 * total ou a soma não fecham.
 */
export function planAmounts(total: number | null, rows: PlanRow[]): number[] {
  if (!total || total <= 0 || rows.length === 0) return [];
  const c = toCents(total);
  const parts = rows.map((r) => (isFixed(r) ? toCents(r.amount!) : Math.round((c * (Number(r.percent) || 0)) / 100)));
  const diff = c - parts.reduce((x, y) => x + y, 0);
  const byPercent = rows.map((r, i) => (isFixed(r) ? -1 : i)).filter((i) => i >= 0);
  if (diff !== 0) {
    // Só aceita diferença de arredondamento (até 1 centavo por parcela calculada)
    if (!byPercent.length || Math.abs(diff) > byPercent.length) return [];
    parts[byPercent[byPercent.length - 1]] += diff;
  }
  return parts.map((x) => x / 100);
}

/** Soma das parcelas em R$ (mesmo quando ainda não fecha com o total). */
export function planTotal(total: number | null, rows: PlanRow[]): number {
  const c = total && total > 0 ? toCents(total) : 0;
  return rows.reduce((a, r) => a + (isFixed(r) ? toCents(r.amount!) : Math.round((c * (Number(r.percent) || 0)) / 100)), 0) / 100;
}

/** Mensagem de erro do plano, ou null se estiver pronto para lançar. */
export function validatePlan(total: number | null, rows: PlanRow[]): string | null {
  if (!total || total <= 0) return 'Informe o valor.';
  if (rows.length === 0) return 'Inclua ao menos uma parcela.';
  if (rows.some((r) => isFixed(r) && r.amount! <= 0)) return 'O valor de cada parcela precisa ser maior que zero.';
  if (!planAmounts(total, rows).length) {
    const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return `As parcelas somam ${fmt(planTotal(total, rows))} (${planPercentSum(rows, total).toLocaleString('pt-BR')}%): precisam somar ${fmt(total)} (100%).`;
  }
  if (rows.some((r) => !r.due_date)) return 'Informe a data de cada parcela.';
  return null;
}

/** Parcelas prontas para gravar: percentual calculado e valor final de cada uma. */
export function finalizeRows(total: number, rows: PlanRow[]): PlanRow[] {
  const values = planAmounts(total, rows);
  return rows.map((r, i) => ({
    label: r.label.trim(),
    percent: rowPercent(total, r),
    due_date: r.due_date,
    amount: isFixed(r) ? r.amount : null,
    value: values[i],
  }));
}

/** Resumo de uma linha: "3 parcelas (30% · 40% · 30%), 1ª em 10/10/2026". */
export function planSummary(rows: PlanRow[]): string {
  if (!rows.length) return '';
  const [y, m, d] = rows[0].due_date.split('-');
  const first = `${d}/${m}/${y}`;
  if (rows.length === 1) return `à vista em ${first}`;
  const pct = rows.length <= 4 ? ` (${rows.map((r) => `${round2(Number(r.percent)).toLocaleString('pt-BR')}%`).join(' · ')})` : '';
  return `${rows.length} parcelas${pct}, 1ª em ${first}`;
}

