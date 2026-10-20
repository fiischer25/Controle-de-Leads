// Painel das Oportunidades: resultado (ganhas × não ganhas), taxa de conversão, valores em
// aberto, fechados e não fechados, perfil dos leads, localidades e de onde vêm. Funções puras.

import type { Lead, LeadSource, LeadStage, ProjectType } from './types';

export interface Bucket {
  key: string;
  label: string;
  total: number;
  open: number;
  won: number;
  lost: number;
  /** Valor das propostas ganhas. */
  wonValue: number;
  /** Ganhas ÷ decididas (ganhas + não ganhas); null sem decisão. */
  conversion: number | null;
}

export interface MonthRow {
  /** AAAA-MM */
  key: string;
  /** Oportunidades que entraram no mês. */
  entered: number;
  /** Fechadas (ganhas) e não ganhas no mês da decisão. */
  won: number;
  lost: number;
  wonValue: number;
  lostValue: number;
}

export interface LeadDashboard {
  total: number;
  open: number;
  won: number;
  lost: number;
  conversion: number | null;
  /** Propostas em negociação (soma das que têm valor). */
  openValue: number;
  /** Em negociação sem valor de proposta. */
  openNoValue: number;
  wonValue: number;
  lostValue: number;
  /** Valor médio dos negócios ganhos (só os com valor). */
  avgTicket: number | null;
  /** Dias médios da entrada ao fechamento (ganhas). */
  avgDaysToClose: number | null;
  stages: Array<{ id: string; name: string; count: number; value: number }>;
  sources: Bucket[];
  categories: Bucket[];
  types: Bucket[];
  areas: Bucket[];
  cities: Bucket[];
  states: Bucket[];
  lostReasons: Array<{ reason: string; count: number; value: number }>;
  months: MonthRow[];
}

/** Sem acento, minúsculas e espaços simples (agrupa "São Paulo" e "sao paulo"). */
export const placeKey = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Faixas de área do imóvel. */
export const AREA_RANGES: Array<{ key: string; label: string; max: number }> = [
  { key: 'a80', label: 'Até 80 m²', max: 80 },
  { key: 'a150', label: '80 a 150 m²', max: 150 },
  { key: 'a300', label: '150 a 300 m²', max: 300 },
  { key: 'a300p', label: 'Acima de 300 m²', max: Infinity },
];

export function areaRange(area: number | null): { key: string; label: string } {
  if (!area || area <= 0) return { key: 'none', label: 'Área não informada' };
  return AREA_RANGES.find((r) => area <= r.max)!;
}

const monthKey = (iso: string) => iso.slice(0, 7);

/** Últimos `n` meses (AAAA-MM), do mais antigo ao atual. */
export function lastMonths(today: string, n: number): string[] {
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

function group(leads: Lead[], kindOf: (l: Lead) => string | undefined, keyOf: (l: Lead) => { key: string; label: string }): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const l of leads) {
    const { key, label } = keyOf(l);
    const b = map.get(key) ?? { key, label, total: 0, open: 0, won: 0, lost: 0, wonValue: 0, conversion: null };
    const k = kindOf(l);
    b.total += 1;
    if (k === 'won') {
      b.won += 1;
      b.wonValue += l.proposal_value ?? 0;
    } else if (k === 'lost') b.lost += 1;
    else b.open += 1;
    map.set(key, b);
  }
  return [...map.values()]
    .map((b) => ({ ...b, conversion: b.won + b.lost ? b.won / (b.won + b.lost) : null }))
    .sort((a, b) => b.total - a.total || b.wonValue - a.wonValue || a.label.localeCompare(b.label));
}

/** Junta o que passa de `max` linhas em "Outras". */
export function topWithOthers(buckets: Bucket[], max: number, label = 'Outras'): Bucket[] {
  if (buckets.length <= max) return buckets;
  const rest = buckets.slice(max - 1);
  const o = rest.reduce(
    (a, b) => ({ ...a, total: a.total + b.total, open: a.open + b.open, won: a.won + b.won, lost: a.lost + b.lost, wonValue: a.wonValue + b.wonValue }),
    { key: 'outras', label: `${label} (${rest.length})`, total: 0, open: 0, won: 0, lost: 0, wonValue: 0, conversion: null as number | null },
  );
  o.conversion = o.won + o.lost ? o.won / (o.won + o.lost) : null;
  return [...buckets.slice(0, max - 1), o];
}

export function leadDashboard(opts: {
  leads: Lead[];
  stages: LeadStage[];
  sources: LeadSource[];
  types: ProjectType[];
  today: string;
  months?: number;
}): LeadDashboard {
  const { leads } = opts;
  const stageById = new Map(opts.stages.map((s) => [s.id, s]));
  const sourceById = new Map(opts.sources.map((s) => [s.id, s]));
  const typeById = new Map(opts.types.map((t) => [t.id, t]));
  const kindOf = (l: Lead) => stageById.get(l.stage_id)?.kind;
  const value = (l: Lead) => l.proposal_value ?? 0;

  const open = leads.filter((l) => kindOf(l) !== 'won' && kindOf(l) !== 'lost');
  const won = leads.filter((l) => kindOf(l) === 'won');
  const lost = leads.filter((l) => kindOf(l) === 'lost');
  const wonWithValue = won.filter((l) => value(l) > 0);
  const closeDays = won
    .filter((l) => l.closed_at)
    .map((l) => Math.max(0, Math.round((Date.parse(l.closed_at!) - Date.parse(l.created_at)) / 864e5)));

  // Funil: em negociação por etapa (na ordem das etapas)
  const stages = [...opts.stages]
    .filter((s) => s.kind === 'open')
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      const mine = open.filter((l) => l.stage_id === s.id);
      return { id: s.id, name: s.name, count: mine.length, value: mine.reduce((a, l) => a + value(l), 0) };
    });

  // Cidade: agrupa grafias diferentes; mostra a forma mais comum, com a UF
  const cityNames = new Map<string, Map<string, number>>();
  for (const l of leads) {
    const k = placeKey(l.city || '');
    if (!k) continue;
    const forms = cityNames.get(k) ?? new Map<string, number>();
    const label = `${l.city.trim()}${l.state ? ` · ${l.state.trim().toUpperCase()}` : ''}`;
    forms.set(label, (forms.get(label) ?? 0) + 1);
    cityNames.set(k, forms);
  }
  const cityLabel = (k: string) => [...(cityNames.get(k) ?? new Map()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? k;

  const lostReasons = new Map<string, { reason: string; count: number; value: number }>();
  for (const l of lost) {
    const reason = l.lost_reason?.trim() || 'Sem motivo informado';
    const r = lostReasons.get(placeKey(reason)) ?? { reason, count: 0, value: 0 };
    r.count += 1;
    r.value += value(l);
    lostReasons.set(placeKey(reason), r);
  }

  const months = lastMonths(opts.today, opts.months ?? 6).map<MonthRow>((key) => {
    const decided = (k: 'won' | 'lost') => (k === 'won' ? won : lost).filter((l) => l.closed_at && monthKey(l.closed_at) === key);
    return {
      key,
      entered: leads.filter((l) => monthKey(l.created_at) === key).length,
      won: decided('won').length,
      lost: decided('lost').length,
      wonValue: decided('won').reduce((a, l) => a + value(l), 0),
      lostValue: decided('lost').reduce((a, l) => a + value(l), 0),
    };
  });

  return {
    total: leads.length,
    open: open.length,
    won: won.length,
    lost: lost.length,
    conversion: won.length + lost.length ? won.length / (won.length + lost.length) : null,
    openValue: open.reduce((a, l) => a + value(l), 0),
    openNoValue: open.filter((l) => !(value(l) > 0)).length,
    wonValue: won.reduce((a, l) => a + value(l), 0),
    lostValue: lost.reduce((a, l) => a + value(l), 0),
    avgTicket: wonWithValue.length ? wonWithValue.reduce((a, l) => a + value(l), 0) / wonWithValue.length : null,
    avgDaysToClose: closeDays.length ? Math.round(closeDays.reduce((a, d) => a + d, 0) / closeDays.length) : null,
    stages,
    sources: group(leads, kindOf, (l) => {
      const s = l.source_id ? sourceById.get(l.source_id) : null;
      return s ? { key: s.id, label: s.name } : { key: 'none', label: 'Não informada' };
    }),
    categories: group(leads, kindOf, (l) => (l.category ? { key: l.category, label: l.category } : { key: 'none', label: 'Não informado' })),
    types: group(leads, kindOf, (l) => {
      const t = l.project_type_id ? typeById.get(l.project_type_id) : null;
      return t ? { key: t.id, label: t.name } : { key: 'none', label: 'Não informado' };
    }),
    areas: group(leads, kindOf, (l) => areaRange(l.area_m2)).sort((a, b) => {
      const order = [...AREA_RANGES.map((r) => r.key), 'none'];
      return order.indexOf(a.key) - order.indexOf(b.key);
    }),
    cities: group(leads, kindOf, (l) => {
      const k = placeKey(l.city || '');
      return k ? { key: k, label: cityLabel(k) } : { key: 'none', label: 'Cidade não informada' };
    }),
    states: group(leads, kindOf, (l) => {
      const uf = (l.state ?? '').trim().toUpperCase();
      return uf ? { key: uf, label: uf } : { key: 'none', label: 'UF não informada' };
    }),
    lostReasons: [...lostReasons.values()].sort((a, b) => b.count - a.count || b.value - a.value),
    months,
  };
}
