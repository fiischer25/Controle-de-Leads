// Previsto × realizado: a precificação (dias por etapa, custo da equipe e do escritório, lucro)
// comparada com o que o projeto está consumindo (horas lançadas por etapa, custo/hora de quem
// lançou, despesas e honorários). Também calcula o histórico de dias por m² de cada etapa, que
// a Precificação usa para sugerir os dias dos próximos projetos. Funções puras.

import { entryMinutes, orderedPhases } from './domain';
import { hasPackages, packageData, pricingResult } from './pricing';
import type { FinanceEntry, FinanceMemberCost, Pricing, Project, Task, TimeEntry } from './types';

const cents = (v: number) => Math.round(v * 100) / 100;

/** Nome da etapa para comparar: sem acento, maiúsculas, espaços e o código ("EP - Estudo" = "estudo"). */
export function phaseKey(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^[a-z0-9]{1,5}(\s+[-–—]\s+|\s*:\s+)/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type StageState = 'nao_iniciada' | 'no_ritmo' | 'atencao' | 'estourou' | 'sem_previsao';

export interface StageCompare {
  label: string;
  plannedDays: number;
  plannedHours: number;
  /** Equipe (custo/hora × horas) + escritório (custo do dia × dias). */
  plannedCost: number;
  actualHours: number;
  actualCost: number;
  /** Tarefas concluídas ÷ tarefas da etapa (null: etapa sem tarefas no projeto). */
  progress: number | null;
  /** Horas no fim da etapa, no ritmo atual. */
  projectedHours: number;
  state: StageState;
}

export interface PlannedActual {
  stages: StageCompare[];
  hoursPerDay: number;
  plannedHours: number;
  actualHours: number;
  projectedHours: number;
  plannedCost: number;
  actualCost: number;
  projectedCost: number;
  /** Tarefas concluídas ÷ total. */
  progress: number;
  /** Preço da precificação. */
  price: number;
  /** Honorários lançados no Financeiro (0 se ainda não há parcelas). */
  fees: number;
  plannedProfit: number;
  /** Honorários − indiretos − despesas (ou adicionais previstos) − custo projetado. */
  projectedProfit: number;
  /** Pessoas com horas no projeto e sem custo/hora. */
  missingCost: string[];
}

function stageState(planned: number, actual: number, projected: number, progress: number | null): StageState {
  if (planned <= 0) return actual > 0 ? 'sem_previsao' : 'nao_iniciada';
  if (actual <= 0 && !progress) return 'nao_iniciada';
  const ratio = projected / planned;
  return ratio <= 1.05 ? 'no_ritmo' : ratio <= 1.25 ? 'atencao' : 'estourou';
}

/** Projeção ao fim: horas ÷ andamento (com um mínimo de 15% de andamento para não exagerar no começo). */
function project(actual: number, progress: number | null): number {
  if (progress == null || progress >= 1 || actual <= 0) return actual;
  return actual / Math.max(progress, 0.15);
}

export function plannedVsActual(opts: {
  pricing: Pricing;
  project: Pick<Project, 'id'>;
  tasks: Task[];
  timeEntries: TimeEntry[];
  costs: FinanceMemberCost[];
  entries: FinanceEntry[];
}): PlannedActual {
  const { pricing } = opts;
  // Compara com o pacote vendido: Basic (só arquitetura) ou Premium (tudo)
  const view = { area_m2: pricing.area_m2, data: hasPackages(pricing.data) ? packageData(pricing.data, pricing.data.package ?? 'premium') : pricing.data };
  const r = pricingResult(view);
  const hpd = r.hoursPerDay;
  const tasks = opts.tasks.filter((t) => t.project_id === opts.project.id);
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const rate = new Map(opts.costs.map((c) => [c.user_id, c.hourly_cost]));
  const missing = new Set<string>();

  // Horas e custo lançados por etapa (fase da tarefa)
  const byPhase = new Map<string, { label: string; minutes: number; cost: number }>();
  for (const te of opts.timeEntries) {
    const t = taskById.get(te.task_id);
    if (!t) continue;
    const label = t.phase || 'Geral';
    const key = phaseKey(label);
    const m = entryMinutes(te);
    const hourly = rate.get(te.user_id) ?? 0;
    if (!hourly) missing.add(te.user_id);
    const g = byPhase.get(key) ?? { label, minutes: 0, cost: 0 };
    g.minutes += m;
    g.cost += (m / 60) * hourly;
    byPhase.set(key, g);
  }
  const progressOf = (key: string): number | null => {
    const mine = tasks.filter((t) => phaseKey(t.phase || 'Geral') === key);
    return mine.length ? mine.filter((t) => t.status === 'done').length / mine.length : null;
  };

  const used = new Set<string>();
  const stages: StageCompare[] = view.data.stages.map((s, i) => {
    const key = phaseKey(s.label);
    used.add(key);
    const g = byPhase.get(key);
    const plannedHours = (s.days || 0) * hpd;
    const plannedCost = cents(r.stageLabor[i] + (s.days || 0) * r.dayCost);
    const actualHours = (g?.minutes ?? 0) / 60;
    const progress = progressOf(key);
    const projectedHours = project(actualHours, progress);
    const officeActual = (actualHours / hpd) * r.dayCost;
    return {
      label: s.label,
      plannedDays: s.days || 0,
      plannedHours,
      plannedCost,
      actualHours,
      actualCost: cents((g?.cost ?? 0) + officeActual),
      progress,
      projectedHours,
      state: stageState(plannedHours, actualHours, projectedHours, progress),
    };
  });
  // Etapas do projeto com horas e sem previsão na precificação
  for (const label of orderedPhases(tasks)) {
    const key = phaseKey(label);
    const g = byPhase.get(key);
    if (used.has(key) || !g) continue;
    used.add(key);
    const actualHours = g.minutes / 60;
    stages.push({
      label,
      plannedDays: 0,
      plannedHours: 0,
      plannedCost: 0,
      actualHours,
      actualCost: cents(g.cost + (actualHours / hpd) * r.dayCost),
      progress: progressOf(key),
      projectedHours: actualHours,
      state: 'sem_previsao',
    });
  }

  const plannedHours = stages.reduce((a, s) => a + s.plannedHours, 0);
  const actualHours = stages.reduce((a, s) => a + s.actualHours, 0);
  const projectedHours = stages.reduce((a, s) => a + Math.max(s.projectedHours, s.state === 'nao_iniciada' ? s.plannedHours : 0), 0);
  const plannedCost = cents(stages.reduce((a, s) => a + s.plannedCost, 0));
  const actualCost = cents(stages.reduce((a, s) => a + s.actualCost, 0));
  // Custo ao fim: o que já foi gasto, mais o que falta de cada etapa no ritmo atual (ou o previsto, se não começou)
  const projectedCost = cents(
    stages.reduce((a, s) => {
      if (s.state === 'nao_iniciada') return a + s.plannedCost;
      return a + (s.actualHours > 0 ? s.actualCost * (s.projectedHours / s.actualHours) : s.actualCost);
    }, 0),
  );

  const mine = opts.entries.filter((e) => e.project_id === opts.project.id);
  const fees = cents(mine.filter((e) => e.kind === 'receita').reduce((a, e) => a + e.amount, 0));
  const expenses = mine.filter((e) => e.kind === 'despesa').reduce((a, e) => a + e.amount, 0);
  const price = r.price ?? 0;
  const base = fees > 0 ? fees : price;
  const projectedProfit = cents(base - (base * r.indirectPct) / 100 - r.indirectValue - Math.max(expenses, r.extras) - projectedCost);

  return {
    stages,
    hoursPerDay: hpd,
    plannedHours,
    actualHours,
    projectedHours,
    plannedCost,
    actualCost,
    projectedCost,
    progress: tasks.length ? tasks.filter((t) => t.status === 'done').length / tasks.length : 0,
    price,
    fees,
    plannedProfit: r.profit ?? 0,
    projectedProfit,
    missingCost: [...missing],
  };
}

/** Precificação do projeto: a vinculada a ele, ou a da oportunidade que virou o projeto (a mais recente). */
export function pricingForProject(pricings: Pricing[], project: Pick<Project, 'id' | 'lead_id'>): Pricing | null {
  const recent = [...pricings].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return recent.find((p) => p.data.project_id === project.id) ?? (project.lead_id ? recent.find((p) => p.lead_id === project.lead_id && !p.data.project_id) : null) ?? null;
}

export interface StageHistory {
  /** Dias por m² (média dos projetos em que a etapa foi concluída). */
  daysPerM2: number;
  projects: number;
}

/**
 * Quanto cada etapa levou de verdade, em dias por m², nos projetos do mesmo tipo com área: só
 * etapas com todas as tarefas concluídas e horas lançadas.
 */
export function stageHistory(opts: {
  projects: Array<Pick<Project, 'id' | 'project_type_id' | 'area_m2'>>;
  tasks: Task[];
  timeEntries: TimeEntry[];
  typeId: string;
  hoursPerDay: number;
}): Map<string, StageHistory> {
  const sums = new Map<string, { total: number; n: number }>();
  for (const p of opts.projects) {
    if (p.project_type_id !== opts.typeId || !p.area_m2 || p.area_m2 <= 0) continue;
    const tasks = opts.tasks.filter((t) => t.project_id === p.id);
    if (!tasks.length) continue;
    const ids = new Map(tasks.map((t) => [t.id, phaseKey(t.phase || 'Geral')]));
    const minutes = new Map<string, number>();
    for (const te of opts.timeEntries) {
      const key = ids.get(te.task_id);
      if (key) minutes.set(key, (minutes.get(key) ?? 0) + entryMinutes(te));
    }
    for (const [key, m] of minutes) {
      const phaseTasks = tasks.filter((t) => phaseKey(t.phase || 'Geral') === key);
      if (m <= 0 || phaseTasks.some((t) => t.status !== 'done')) continue;
      const s = sums.get(key) ?? { total: 0, n: 0 };
      s.total += m / 60 / opts.hoursPerDay / p.area_m2;
      s.n += 1;
      sums.set(key, s);
    }
  }
  return new Map([...sums].map(([k, s]) => [k, { daysPerM2: s.total / s.n, projects: s.n }]));
}
