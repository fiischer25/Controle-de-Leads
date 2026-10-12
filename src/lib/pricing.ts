// Precificação de projeto pelos dias de trabalho, comparada com o preço por m².
//
// Custo do dia do escritório = custos fixos mensais ÷ dias úteis do mês.
// Custo do projeto = dias × custo do dia + adicionais (visitas, presentes, terceirização…)
//                  + custos indiretos em R$.
// Preço = custo ÷ (1 − (indiretos em % + lucro %)): impostos e taxas incidem sobre o preço,
// e o lucro é a % do preço que sobra depois de tudo.
// Funções puras (sem React nem banco).

import type { Pricing, PricingData, PricingExtra, PricingFixedCost, PricingIndirect, PricingStage } from './types';
import { uid } from './utils';

const cents = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export interface PricingResult {
  days: number;
  fixedMonthly: number;
  /** Custo de um dia de trabalho do escritório. */
  dayCost: number;
  /** Dias × custo do dia. */
  daysCost: number;
  extras: number;
  indirectValue: number;
  /** Soma dos indiretos em % do preço. */
  indirectPct: number;
  /** Custo total do projeto antes dos indiretos em % e do lucro. */
  cost: number;
  /** Preço sugerido para ter o lucro desejado; null se % de indiretos + lucro chegar a 100. */
  suggested: number | null;
  /** Preço usado: o valor da proposta ou o sugerido. */
  price: number | null;
  /** Impostos e taxas em % aplicados ao preço. */
  indirectPctValue: number;
  profit: number | null;
  /** Lucro real em % do preço (muda se o valor da proposta for diferente do sugerido). */
  profitPct: number | null;
  perM2: number | null;
  perDay: number | null;
  /** Preço pelo m² de referência (área × R$/m²). */
  refPrice: number | null;
  /** Preço pelos dias − preço pelo m² de referência. */
  diff: number | null;
  diffPct: number | null;
}

export function pricingResult(p: Pick<Pricing, 'area_m2' | 'data'>): PricingResult {
  const d = p.data;
  const days = d.stages.reduce((a, s) => a + num(s.days), 0);
  const fixedMonthly = cents(d.fixed.reduce((a, f) => a + num(f.value), 0));
  const dayCost = num(d.work_days) > 0 ? cents(fixedMonthly / d.work_days) : 0;
  const daysCost = cents(dayCost * days);
  const extras = cents(d.extras.reduce((a, x) => a + num(x.qty) * num(x.unit), 0));
  const indirectValue = cents(d.indirect.filter((i) => i.kind === 'valor').reduce((a, i) => a + num(i.value), 0));
  const indirectPct = d.indirect.filter((i) => i.kind === 'percent').reduce((a, i) => a + num(i.value), 0);
  const cost = cents(daysCost + extras + indirectValue);
  const pct = indirectPct + num(d.margin);
  const suggested = pct < 100 ? cents(cost / (1 - pct / 100)) : null;
  const price = d.final_price != null && d.final_price > 0 ? d.final_price : suggested;
  const indirectPctValue = price != null ? cents((price * indirectPct) / 100) : 0;
  const profit = price != null ? cents(price - cost - indirectPctValue) : null;
  const area = num(p.area_m2);
  const refPrice = d.ref_m2 && area > 0 ? cents(d.ref_m2 * area) : null;
  const diff = price != null && refPrice != null ? cents(price - refPrice) : null;
  return {
    days,
    fixedMonthly,
    dayCost,
    daysCost,
    extras,
    indirectValue,
    indirectPct,
    cost,
    suggested,
    price,
    indirectPctValue,
    profit,
    profitPct: price && profit != null ? Math.round((profit / price) * 1000) / 10 : null,
    perM2: price != null && area > 0 ? cents(price / area) : null,
    perDay: price != null && days > 0 ? cents(price / days) : null,
    refPrice,
    diff,
    diffPct: diff != null && refPrice ? Math.round((diff / refPrice) * 1000) / 10 : null,
  };
}

/** Arredonda para a centena de reais mais próxima (valor de proposta). */
export const roundPrice = (v: number) => Math.round(v / 100) * 100;

export const DEFAULT_STAGES = ['Levantamento', 'Estudo preliminar', 'Anteprojeto', 'Projeto executivo', 'Detalhamentos'];

const row = <T,>(r: Omit<T, 'id'>) => ({ id: uid(), ...r }) as T;

/** Precificação nova com os padrões do escritório (custos fixos e referência podem vir prontos). */
export function newPricingData(opts: { stages?: string[]; fixed?: Array<[string, number]>; refM2?: number | null } = {}): PricingData {
  return {
    stages: (opts.stages?.length ? opts.stages : DEFAULT_STAGES).map((label) => row<PricingStage>({ label, days: 0 })),
    fixed: (
      opts.fixed?.length
        ? opts.fixed
        : ([
            ['Salários e pró-labore', 0],
            ['Aluguel e condomínio', 0],
            ['Softwares e assinaturas', 0],
            ['Contabilidade', 0],
            ['Energia, internet e telefone', 0],
            ['Outros custos fixos', 0],
          ] as Array<[string, number]>)
    ).map(([label, value]) => row<PricingFixedCost>({ label, value })),
    work_days: 21,
    indirect: [
      row<PricingIndirect>({ label: 'Impostos sobre a nota', kind: 'percent', value: 6 }),
      row<PricingIndirect>({ label: 'Reserva para imprevistos', kind: 'percent', value: 5 }),
    ],
    extras: [
      row<PricingExtra>({ label: 'Visitas técnicas', qty: 0, unit: 150 }),
      row<PricingExtra>({ label: 'Presentes ao cliente', qty: 0, unit: 0 }),
      row<PricingExtra>({ label: 'Terceirização (projetos complementares)', qty: 0, unit: 0 }),
      row<PricingExtra>({ label: 'Deslocamentos', qty: 0, unit: 0 }),
      row<PricingExtra>({ label: 'Plotagens e impressões', qty: 0, unit: 0 }),
    ],
    margin: 20,
    ref_m2: opts.refM2 ?? null,
    final_price: null,
    notes: '',
  };
}

/** Categorias de despesa que não são custo fixo de operação (fora da média mensal). */
const NOT_FIXED = /distribui|reserva|investiment|emprést|emprest|financiament|imposto/i;

/**
 * Custos fixos mensais pela média das despesas dos últimos `months` meses fechados, por categoria
 * (só as que tiveram valor). Impostos ficam de fora: entram como % sobre o preço.
 */
export function fixedCostsFromFinance(
  entries: Array<{ kind: string; amount: number; due_date: string; category_id: string | null }>,
  categoryName: (id: string | null) => string,
  today: string,
  months = 3,
): Array<[string, number]> {
  const [y, m] = today.split('-').map(Number);
  const keys = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 2 - i, 1));
    return d.toISOString().slice(0, 7);
  });
  const sums = new Map<string, number>();
  for (const e of entries) {
    if (e.kind !== 'despesa' || !keys.includes(e.due_date.slice(0, 7))) continue;
    const name = categoryName(e.category_id);
    if (NOT_FIXED.test(name)) continue;
    sums.set(name, (sums.get(name) ?? 0) + e.amount);
  }
  return [...sums.entries()]
    .map(([name, total]) => [name, cents(total / months)] as [string, number])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
}
