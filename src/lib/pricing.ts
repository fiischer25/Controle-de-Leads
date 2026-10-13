// Precificação de projeto pelos dias de trabalho, comparada com o preço por m².
//
// Custo do dia do escritório = custos fixos mensais ÷ dias úteis do mês.
// Custo da equipe = Σ etapas (dias × custo por dia de quem faz a etapa; custo por dia = custo/hora
//                   × horas por dia).
// Sem duplicidade: quando a equipe entra pelo custo de cada pessoa, salários e pró-labore saem dos
// custos fixos (o custo do dia fica só com aluguel, softwares, contador…).
// Custo do projeto = dias × custo do dia + custo da equipe + adicionais (visitas, presentes,
//                  terceirização…) + custos indiretos em R$.
// Preço = custo ÷ (1 − (indiretos em % + lucro %)): impostos e taxas incidem sobre o preço,
// e o lucro é a % do preço que sobra depois de tudo.
// Funções puras (sem React nem banco).

import type { Pricing, PricingData, PricingExtra, PricingFixedCost, PricingIndirect, PricingStage } from './types';
import { uid } from './utils';

const cents = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export interface PricingResult {
  days: number;
  /** Custos fixos que entram no custo do dia (sem os salários, quando a equipe está nas etapas). */
  fixedMonthly: number;
  /** Salários e pró-labore tirados dos custos fixos (já estão no custo da equipe). */
  fixedExcluded: number;
  /** Alguma etapa usa o custo de quem faz (custo/hora). */
  usesTeam: boolean;
  /** Custo de um dia de trabalho do escritório. */
  dayCost: number;
  /** Dias × custo do dia do escritório. */
  daysCost: number;
  /** Horas de trabalho num dia. */
  hoursPerDay: number;
  /** Custo de quem faz cada etapa (mesma ordem das etapas). */
  stageLabor: number[];
  /** Soma do custo da equipe nas etapas. */
  labor: number;
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
  const usesTeam = d.stages.some((s) => num(s.rate) > 0);
  const fixedExcluded = usesTeam ? cents(d.fixed.filter(isLaborCost).reduce((a, f) => a + num(f.value), 0)) : 0;
  const fixedMonthly = cents(d.fixed.reduce((a, f) => a + num(f.value), 0) - fixedExcluded);
  const dayCost = num(d.work_days) > 0 ? cents(fixedMonthly / d.work_days) : 0;
  const daysCost = cents(dayCost * days);
  const hoursPerDay = d.hours_per_day != null && d.hours_per_day > 0 ? d.hours_per_day : DEFAULT_HOURS_PER_DAY;
  const stageLabor = d.stages.map((s) => cents(num(s.days) * hoursPerDay * num(s.rate)));
  const labor = cents(stageLabor.reduce((a, v) => a + v, 0));
  const extras = cents(d.extras.reduce((a, x) => a + num(x.qty) * num(x.unit), 0));
  const indirectValue = cents(d.indirect.filter((i) => i.kind === 'valor').reduce((a, i) => a + num(i.value), 0));
  const indirectPct = d.indirect.filter((i) => i.kind === 'percent').reduce((a, i) => a + num(i.value), 0);
  const cost = cents(daysCost + labor + extras + indirectValue);
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
    fixedExcluded,
    usesTeam,
    dayCost,
    daysCost,
    hoursPerDay,
    stageLabor,
    labor,
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

export const DEFAULT_HOURS_PER_DAY = 8;
/** Dias úteis num mês (padrão do escritório para dividir salários e custos fixos). */
export const DEFAULT_WORK_DAYS = 21;

/**
 * Custo de uma pessoa: o escritório pensa por mês (salário + encargos), o sistema guarda por hora.
 * Custo por dia = custo do mês ÷ dias úteis; custo por hora = custo por dia ÷ horas por dia.
 */
export const hourlyFromMonthly = (monthly: number, workDays = DEFAULT_WORK_DAYS, hoursPerDay = DEFAULT_HOURS_PER_DAY) =>
  workDays > 0 && hoursPerDay > 0 ? monthly / (workDays * hoursPerDay) : 0;
export const monthlyFromHourly = (hourly: number, workDays = DEFAULT_WORK_DAYS, hoursPerDay = DEFAULT_HOURS_PER_DAY) =>
  Math.round(hourly * workDays * hoursPerDay * 100) / 100;

/** Arredonda para a centena de reais mais próxima (valor de proposta). */
export const roundPrice = (v: number) => Math.round(v / 100) * 100;

export const DEFAULT_STAGES = ['Levantamento', 'Estudo preliminar', 'Anteprojeto', 'Projeto executivo', 'Detalhamentos'];

const row = <T,>(r: Omit<T, 'id'>) => ({ id: uid(), ...r }) as T;

/** Precificação nova com os padrões do escritório (custos fixos e referência podem vir prontos). */
export function newPricingData(
  opts: { stages?: string[]; fixed?: FixedRow[]; refM2?: number | null; teamRate?: number | null } = {},
): PricingData {
  return {
    stages: (opts.stages?.length ? opts.stages : DEFAULT_STAGES).map((label) =>
      row<PricingStage>({ label, days: 0, assignee_id: null, rate: opts.teamRate ?? null }),
    ),
    fixed: (
      opts.fixed?.length
        ? opts.fixed
        : ([
            ['Salários e pró-labore', 0, true],
            ['Aluguel e condomínio', 0, false],
            ['Softwares e assinaturas', 0, false],
            ['Contabilidade', 0, false],
            ['Energia, internet e telefone', 0, false],
            ['Outros custos fixos', 0, false],
          ] as FixedRow[])
    ).map(([label, value, labor]) => row<PricingFixedCost>({ label, value, labor: !!labor })),
    work_days: 21,
    hours_per_day: DEFAULT_HOURS_PER_DAY,
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
/** Salários e pró-labore: entram pelo custo/hora de quem faz cada etapa, quando a equipe tem custo. */
export const LABOR_COST = /salári|salari|pró-labore|pro-labore|pro labore|folha|encargos|inss|fgts|13º|décimo terceiro|férias/i;

/** Custo fixo é salário / pró-labore? Marcado na linha ou, em precificações antigas, pelo nome. */
export const isLaborCost = (f: Pick<PricingFixedCost, 'label' | 'labor'>) => (f.labor != null ? f.labor : LABOR_COST.test(f.label));

/** Linha de custo fixo vinda do Financeiro: nome, valor por mês e se é salário / pró-labore. */
export type FixedRow = [label: string, value: number, labor: boolean];

/** Custo/hora médio da equipe (pessoas com custo cadastrado). */
export function teamAverageRate(costs: Array<{ hourly_cost: number }>): number | null {
  const valid = costs.map((c) => c.hourly_cost).filter((v) => v > 0);
  return valid.length ? cents(valid.reduce((a, v) => a + v, 0) / valid.length) : null;
}

type FinanceRow = {
  kind: string;
  description: string;
  amount: number;
  due_date: string;
  category_id: string | null;
  project_id?: string | null;
  series_id?: string | null;
};

const normDesc = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s*\(?\d+\s*\/\s*\d+\)?\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Custos fixos cadastrados no Financeiro: as despesas que repetem todo mês (lançadas com
 * "Todo mês", ou a mesma despesa em pelo menos 2 dos últimos 3 meses), com o valor do mês atual
 * (ou o último lançado). Despesas de projeto, impostos (entram em % sobre o preço) e retiradas
 * ficam de fora. Salários e pró-labore vêm marcados (`labor`): saem do custo do dia quando a
 * equipe entra pelo custo de cada pessoa nas etapas.
 */
export function recurringFixedCosts(entries: FinanceRow[], categoryName: (id: string | null) => string, today: string): FixedRow[] {
  const month = today.slice(0, 7);
  const [y, m] = today.split('-').map(Number);
  const back = (i: number) => new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7);
  const window = [back(0), back(1), back(2), back(3)];
  const groups = new Map<string, { label: string; byMonth: Map<string, number>; series: boolean; labor: boolean }>();
  for (const e of entries) {
    if (e.kind !== 'despesa' || e.project_id || !(e.amount > 0)) continue;
    const ym = e.due_date.slice(0, 7);
    if (!window.includes(ym)) continue;
    const cat = categoryName(e.category_id);
    if (NOT_FIXED.test(cat) || NOT_FIXED.test(e.description)) continue;
    const labor = LABOR_COST.test(cat) || LABOR_COST.test(e.description);
    const key = e.series_id ? `s:${e.series_id}` : `d:${normDesc(e.description)}|${e.category_id ?? ''}`;
    const g = groups.get(key) ?? { label: e.description.trim(), byMonth: new Map<string, number>(), series: !!e.series_id, labor };
    g.byMonth.set(ym, (g.byMonth.get(ym) ?? 0) + e.amount);
    groups.set(key, g);
  }
  const out = new Map<string, { value: number; labor: boolean }>();
  for (const g of groups.values()) {
    // Repete todo mês: série mensal ainda ativa, ou presente em 2 dos últimos 3 meses fechados
    const closed = window.slice(1).filter((k) => g.byMonth.has(k)).length;
    const recurring = g.series ? g.byMonth.has(month) || closed >= 1 : closed >= 2;
    if (!recurring) continue;
    const latest = window.find((k) => g.byMonth.has(k))!;
    const value = g.byMonth.get(month) ?? g.byMonth.get(latest)!;
    const label = g.label.replace(/\s*\(?\d+\s*\/\s*\d+\)?\s*$/, '');
    const prev = out.get(label);
    out.set(label, { value: cents((prev?.value ?? 0) + value), labor: (prev?.labor ?? false) || g.labor });
  }
  return [...out.entries()].map(([label, o]): FixedRow => [label, o.value, o.labor]).sort((a, b) => b[1] - a[1]);
}

/**
 * Custos fixos mensais pela média das despesas dos últimos `months` meses fechados, por categoria
 * (só as que tiveram valor). Impostos ficam de fora: entram como % sobre o preço.
 */
export function fixedCostsFromFinance(
  entries: Array<{ kind: string; amount: number; due_date: string; category_id: string | null; project_id?: string | null }>,
  categoryName: (id: string | null) => string,
  today: string,
  months = 3,
): FixedRow[] {
  const [y, m] = today.split('-').map(Number);
  const keys = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 2 - i, 1));
    return d.toISOString().slice(0, 7);
  });
  const sums = new Map<string, number>();
  for (const e of entries) {
    if (e.kind !== 'despesa' || e.project_id || !keys.includes(e.due_date.slice(0, 7))) continue;
    const name = categoryName(e.category_id);
    if (NOT_FIXED.test(name)) continue;
    sums.set(name, (sums.get(name) ?? 0) + e.amount);
  }
  return [...sums.entries()]
    .map(([name, total]): FixedRow => [name, cents(total / months), LABOR_COST.test(name)])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
}
