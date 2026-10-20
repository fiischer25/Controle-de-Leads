// Orçamentos e Obras: cálculos do orçamento por partes, cronograma físico-financeiro, pagamentos e
// aprovações do cliente. Funções puras (sem React), usadas pelas telas e pelos testes unitários.

import type {
  ApprovalKind,
  ApprovalSnapshot,
  ApprovalState,
  ApprovalStatus,
  Budget,
  BudgetData,
  BudgetItem,
  BudgetSection,
  BudgetStatus,
  Obra,
  ObraApproval,
  ObraPayment,
  ObraPaymentCategory,
  ObraPaymentMethod,
  ObraStage,
  ObraStatus,
  ObraVisitKind,
} from './types';
import type { Tone } from './status';
import { addBusinessDays, addDays, diffDays, digitsOnly, nextBusinessDay, uid } from './utils';

export const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------- Rótulos
export const UNITS = ['un', 'm²', 'm', 'm³', 'vb', 'kg', 'h', 'dia', 'pç', 'cj', 'mês', 'l'];

export const BUDGET_STATUS: Record<BudgetStatus, { label: string; tone: Tone }> = {
  rascunho: { label: 'Rascunho', tone: 'neutral' },
  enviado: { label: 'Aguardando cliente', tone: 'warning' },
  aprovado: { label: 'Aprovado', tone: 'success' },
  recusado: { label: 'Recusado', tone: 'danger' },
};

export const OBRA_STATUS: Record<ObraStatus, { label: string; tone: Tone }> = {
  planejamento: { label: 'Planejamento', tone: 'neutral' },
  em_andamento: { label: 'Em andamento', tone: 'info' },
  pausada: { label: 'Pausada', tone: 'warning' },
  concluida: { label: 'Concluída', tone: 'success' },
  cancelada: { label: 'Cancelada', tone: 'neutral' },
};
export const OBRA_STATUS_ORDER: ObraStatus[] = ['planejamento', 'em_andamento', 'pausada', 'concluida', 'cancelada'];

export const PAYMENT_CATEGORY: Record<ObraPaymentCategory, string> = {
  material: 'Material',
  mao_de_obra: 'Mão de obra',
  servico: 'Serviço',
  equipamento: 'Equipamento',
  taxa: 'Taxas e licenças',
  outro: 'Outro',
};

export const PAYMENT_METHOD: Record<ObraPaymentMethod, string> = {
  pix: 'Pix',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  cartao: 'Cartão',
  dinheiro: 'Dinheiro',
  outro: 'Outro',
};

export const APPROVAL_KIND: Record<ApprovalKind, string> = {
  orcamento: 'Orçamento',
  pagamento: 'Pagamento',
  aditivo: 'Aditivo (serviço extra)',
  material: 'Escolha de material',
  projeto: 'Projeto / detalhe',
  medicao: 'Medição',
  outro: 'Outro',
};

export const APPROVAL_STATUS: Record<ApprovalStatus, { label: string; tone: Tone }> = {
  pendente: { label: 'Aguardando cliente', tone: 'warning' },
  aprovado: { label: 'Aprovado', tone: 'success' },
  recusado: { label: 'Recusado', tone: 'danger' },
  cancelado: { label: 'Cancelado', tone: 'neutral' },
};

export const PAYMENT_APPROVAL: Record<ApprovalState, { label: string; tone: Tone }> = {
  nao_requer: { label: 'Sem aprovação', tone: 'neutral' },
  pendente: { label: 'Aguardando cliente', tone: 'warning' },
  aprovado: { label: 'Aprovado', tone: 'success' },
  recusado: { label: 'Recusado', tone: 'danger' },
};

export const VISIT_KIND: Record<ObraVisitKind, string> = {
  visita: 'Visita',
  vistoria: 'Vistoria',
  reuniao: 'Reunião na obra',
  medicao: 'Medição',
  entrega: 'Entrega',
};

export const WEATHER = ['Ensolarado', 'Nublado', 'Chuvoso', 'Chuva forte'];

/**
 * Partes mais comuns de uma obra/reforma, com itens de partida (sem preço: cada escritório tem o seu).
 * O orçamento começa escolhendo as partes; os preços usados ficam como sugestão nos próximos.
 */
export const SECTION_PRESETS: Array<{ name: string; items: Array<[string, string]> }> = [
  { name: 'Serviços preliminares', items: [['Proteção de piso e esquadrias', 'm²'], ['Caçamba para entulho', 'un'], ['Instalações provisórias', 'vb']] },
  { name: 'Demolição e retirada', items: [['Demolição de alvenaria', 'm²'], ['Retirada de revestimento cerâmico', 'm²'], ['Retirada de louças e metais', 'un']] },
  { name: 'Alvenaria e drywall', items: [['Parede em drywall', 'm²'], ['Alvenaria de vedação', 'm²'], ['Reboco', 'm²']] },
  { name: 'Elétrica', items: [['Ponto de tomada', 'un'], ['Ponto de iluminação', 'un'], ['Quadro de distribuição', 'un'], ['Cabeamento', 'm']] },
  { name: 'Hidráulica', items: [['Ponto de água fria/quente', 'un'], ['Ponto de esgoto', 'un'], ['Registro', 'un']] },
  { name: 'Impermeabilização', items: [['Impermeabilização de área molhada', 'm²']] },
  { name: 'Gesso e forro', items: [['Forro de gesso', 'm²'], ['Sanca', 'm'], ['Tabica', 'm']] },
  { name: 'Pisos e revestimentos', items: [['Contrapiso', 'm²'], ['Assentamento de porcelanato', 'm²'], ['Revestimento de parede', 'm²'], ['Rodapé', 'm']] },
  { name: 'Pintura', items: [['Massa corrida', 'm²'], ['Pintura látex paredes (2 demãos)', 'm²'], ['Pintura de teto', 'm²'], ['Pintura de esquadrias', 'un']] },
  { name: 'Marcenaria', items: [['Armário de cozinha', 'm'], ['Painel ripado', 'm²'], ['Guarda-roupa', 'm']] },
  { name: 'Marmoraria', items: [['Bancada em granito/quartzo', 'm'], ['Soleira e peitoril', 'm']] },
  { name: 'Vidraçaria e serralheria', items: [['Box de vidro temperado', 'un'], ['Espelho', 'm²'], ['Guarda-corpo', 'm']] },
  { name: 'Louças, metais e acessórios', items: [['Bacia sanitária', 'un'], ['Cuba', 'un'], ['Torneira/misturador', 'un']] },
  { name: 'Iluminação', items: [['Luminária embutida', 'un'], ['Perfil de LED', 'm'], ['Pendente', 'un']] },
  { name: 'Ar-condicionado', items: [['Infraestrutura de ar-condicionado', 'un'], ['Instalação de split', 'un']] },
  { name: 'Limpeza final', items: [['Limpeza pós-obra', 'm²']] },
  { name: 'Administração da obra', items: [['Gerenciamento da obra', 'mês']] },
];

// ---------------------------------------------------------------- Orçamento
export function newBudgetItem(description = '', unit = 'un'): BudgetItem {
  return { id: uid(), description, unit, qty: 1, material: 0, labor: 0, notes: null };
}

export function newSection(name: string, withItems = true): BudgetSection {
  const preset = SECTION_PRESETS.find((p) => p.name === name);
  return { id: uid(), name, days: null, items: withItems && preset ? preset.items.map(([d, u]) => newBudgetItem(d, u)) : [newBudgetItem()] };
}

export function newBudgetData(base?: Partial<BudgetData>): BudgetData {
  return { sections: [], bdi: 0, discount: 0, validity_days: 15, payment_terms: '', notes: '', exclusions: '', ...base };
}

/** Custo unitário do item (material + mão de obra). */
export const itemUnitCost = (i: Pick<BudgetItem, 'material' | 'labor'>) => (Number(i.material) || 0) + (Number(i.labor) || 0);
export const itemCost = (i: BudgetItem) => round2((Number(i.qty) || 0) * itemUnitCost(i));

export interface SectionTotals {
  id: string;
  name: string;
  material: number;
  labor: number;
  cost: number;
  /** Com BDI (o que vai na proposta, antes do desconto). */
  price: number;
  /** Com BDI e a parte do desconto: soma exatamente o total do orçamento. */
  net: number;
  /** Participação no total (0 a 1). */
  share: number;
  days: number;
}

export interface BudgetTotals {
  material: number;
  labor: number;
  cost: number;
  bdi: number;
  bdiValue: number;
  /** Custo + BDI. */
  subtotal: number;
  discount: number;
  total: number;
  perM2: number | null;
  items: number;
  sections: SectionTotals[];
  /** Soma dos prazos das partes (dias úteis). */
  days: number;
}

export function sectionCost(s: BudgetSection) {
  let material = 0;
  let labor = 0;
  for (const i of s.items) {
    const q = Number(i.qty) || 0;
    material += q * (Number(i.material) || 0);
    labor += q * (Number(i.labor) || 0);
  }
  return { material: round2(material), labor: round2(labor), cost: round2(material + labor) };
}

export function budgetTotals(data: BudgetData, areaM2?: number | null): BudgetTotals {
  const bdi = Number(data.bdi) || 0;
  const factor = 1 + bdi / 100;
  const raw = data.sections.map((s) => ({ s, ...sectionCost(s) }));
  const material = round2(raw.reduce((a, r) => a + r.material, 0));
  const labor = round2(raw.reduce((a, r) => a + r.labor, 0));
  const cost = round2(material + labor);
  const subtotal = round2(cost * factor);
  const discount = Math.min(Math.max(0, Number(data.discount) || 0), subtotal);
  const total = round2(subtotal - discount);
  // O desconto é distribuído pelas partes na proporção do preço; o resto do arredondamento fica na maior
  const sections: SectionTotals[] = raw.map((r) => {
    const price = round2(r.cost * factor);
    return {
      id: r.s.id,
      name: r.s.name,
      material: r.material,
      labor: r.labor,
      cost: r.cost,
      price,
      net: subtotal > 0 ? round2(price - (discount * price) / subtotal) : 0,
      share: subtotal > 0 ? price / subtotal : 0,
      days: Math.max(0, Number(r.s.days) || 0),
    };
  });
  const drift = round2(total - sections.reduce((a, x) => a + x.net, 0));
  if (drift !== 0 && sections.length) {
    const biggest = sections.reduce((a, b) => (b.net > a.net ? b : a));
    biggest.net = round2(biggest.net + drift);
  }
  return {
    material,
    labor,
    cost,
    bdi,
    bdiValue: round2(subtotal - cost),
    subtotal,
    discount: round2(discount),
    total,
    perM2: areaM2 && areaM2 > 0 && total > 0 ? round2(total / areaM2) : null,
    items: data.sections.reduce((a, s) => a + s.items.filter((i) => i.description.trim()).length, 0),
    sections,
    days: sections.reduce((a, s) => a + s.days, 0),
  };
}

/** Preço unitário de venda (com BDI), o que aparece para o cliente. */
export const salePrice = (unitCost: number, bdi: number) => round2(unitCost * (1 + (Number(bdi) || 0) / 100));

/** Próximo código no ano: ORC-2026-001, OB-2026-001… */
export function nextCode(prefix: string, codes: string[], year = new Date().getFullYear()): string {
  const head = `${prefix}-${year}-`;
  const max = codes.filter((c) => c.startsWith(head)).reduce((m, c) => Math.max(m, Number(c.slice(head.length)) || 0), 0);
  return `${head}${String(max + 1).padStart(3, '0')}`;
}

export interface ItemSuggestion {
  description: string;
  unit: string;
  material: number;
  labor: number;
  section: string;
  /** Orçamento de onde veio o preço. */
  from: string;
}

/**
 * Banco de preços: cada item já orçado (o mais recente vence), para sugerir unidade e preços ao
 * digitar a descrição num orçamento novo.
 */
export function itemSuggestions(budgets: Budget[], exceptId?: string): ItemSuggestion[] {
  const seen = new Map<string, ItemSuggestion>();
  for (const b of [...budgets].sort((a, z) => z.updated_at.localeCompare(a.updated_at))) {
    if (b.id === exceptId) continue;
    for (const s of b.data?.sections ?? []) {
      for (const i of s.items) {
        const key = i.description.trim().toLowerCase();
        if (!key || seen.has(key) || itemUnitCost(i) <= 0) continue;
        seen.set(key, { description: i.description.trim(), unit: i.unit, material: Number(i.material) || 0, labor: Number(i.labor) || 0, section: s.name, from: b.code });
      }
    }
  }
  return [...seen.values()].sort((a, z) => a.description.localeCompare(z.description, 'pt-BR'));
}

// ---------------------------------------------------------------- Obra: cronograma
/**
 * Etapas da obra a partir das partes do orçamento: valor previsto (com BDI e desconto), itens e datas
 * em sequência pelos dias úteis de cada parte (partes sem prazo ficam sem datas).
 */
export function stagesFromBudget(budget: Pick<Budget, 'data' | 'area_m2'>, obraId: string, start: string | null, now: string): ObraStage[] {
  const totals = budgetTotals(budget.data, budget.area_m2);
  let cursor = start ? nextBusinessDay(start) : null;
  return budget.data.sections.map((s, i) => {
    const t = totals.sections[i];
    let start_date: string | null = null;
    let due_date: string | null = null;
    if (cursor && t.days > 0) {
      start_date = cursor;
      due_date = addBusinessDays(cursor, t.days - 1);
      cursor = nextBusinessDay(addDays(due_date, 1));
    }
    return {
      id: uid(),
      obra_id: obraId,
      name: s.name,
      position: i,
      start_date,
      due_date,
      progress: 0,
      budget: t.net,
      items: s.items.filter((x) => x.description.trim()).map((x) => ({ ...x })),
      notes: null,
      created_at: now,
      updated_at: now,
    };
  });
}

/** Avanço físico da obra: média das etapas pesada pelo valor (sem valores, média simples). */
export function obraProgress(stages: Pick<ObraStage, 'progress' | 'budget'>[]): number {
  if (!stages.length) return 0;
  const weight = stages.reduce((a, s) => a + Math.max(0, s.budget), 0);
  const v = weight > 0 ? stages.reduce((a, s) => a + (s.progress * Math.max(0, s.budget)) / weight, 0) : stages.reduce((a, s) => a + s.progress, 0) / stages.length;
  return Math.round(v);
}

/** Quanto a etapa já deveria estar feita hoje, pelas datas (linear). null = sem datas. */
export function expectedStageProgress(s: Pick<ObraStage, 'start_date' | 'due_date'>, today: string): number | null {
  if (!s.start_date || !s.due_date) return null;
  if (today < s.start_date) return 0;
  if (today >= s.due_date) return 100;
  const span = diffDays(s.start_date, s.due_date) + 1;
  return Math.round(((diffDays(s.start_date, today) + 1) / span) * 100);
}

/** Avanço previsto da obra hoje (só etapas com datas). null = nenhuma etapa com datas. */
export function obraExpectedProgress(stages: ObraStage[], today: string): number | null {
  const dated = stages.filter((s) => s.start_date && s.due_date);
  if (!dated.length) return null;
  return obraProgress(dated.map((s) => ({ budget: s.budget, progress: expectedStageProgress(s, today) ?? 0 })));
}

export type StageState = 'concluida' | 'atrasada' | 'em_andamento' | 'a_iniciar' | 'sem_datas';

export const STAGE_STATE: Record<StageState, { label: string; tone: Tone }> = {
  concluida: { label: 'Concluída', tone: 'success' },
  atrasada: { label: 'Atrasada', tone: 'danger' },
  em_andamento: { label: 'Em andamento', tone: 'info' },
  a_iniciar: { label: 'A iniciar', tone: 'neutral' },
  sem_datas: { label: 'Sem datas', tone: 'neutral' },
};

/** Situação da etapa: atrasada quando o avanço está 10 pontos abaixo do previsto ou passou do prazo. */
export function stageState(s: ObraStage, today: string): StageState {
  if (s.progress >= 100) return 'concluida';
  const expected = expectedStageProgress(s, today);
  if (expected == null) return s.progress > 0 ? 'em_andamento' : 'sem_datas';
  if ((s.due_date && today > s.due_date) || expected - s.progress >= 10) return 'atrasada';
  if (s.progress > 0 || (s.start_date && today >= s.start_date)) return 'em_andamento';
  return 'a_iniciar';
}

/** Datas da obra pelas etapas (início mais cedo e fim mais tarde). */
export function stageSpan(stages: ObraStage[]): { start: string | null; end: string | null } {
  const starts = stages.map((s) => s.start_date).filter(Boolean) as string[];
  const ends = stages.map((s) => s.due_date).filter(Boolean) as string[];
  return { start: starts.length ? starts.sort()[0] : null, end: ends.length ? ends.sort().reverse()[0] : null };
}

// ---------------------------------------------------------------- Obra: financeiro
export interface StageMoney {
  planned: number;
  paid: number;
  /** Lançado e ainda não pago (sem os recusados). */
  open: number;
}

export interface ObraMoney {
  budget: number;
  /** Aditivos aprovados pelo cliente. */
  additives: number;
  /** Orçado + aditivos. */
  contracted: number;
  paid: number;
  open: number;
  overdue: number;
  /** Valor dos pagamentos que esperam a aprovação do cliente. */
  awaiting: number;
  awaitingCount: number;
  /** Pago + em aberto: quanto já está comprometido. */
  committed: number;
  /** Saldo do orçamento: contratado − comprometido. */
  balance: number;
  byStage: Record<string, StageMoney>;
}

const payable = (p: ObraPayment) => p.approval !== 'recusado';

export function obraMoney(obra: Pick<Obra, 'contract_value'>, stages: ObraStage[], payments: ObraPayment[], approvals: ObraApproval[], today: string): ObraMoney {
  const budget = round2(obra.contract_value ?? stages.reduce((a, s) => a + s.budget, 0));
  const additives = round2(approvals.filter((a) => a.kind === 'aditivo' && a.status === 'aprovado').reduce((a, x) => a + (x.amount ?? 0), 0));
  const byStage: Record<string, StageMoney> = {};
  for (const s of stages) byStage[s.id] = { planned: s.budget, paid: 0, open: 0 };
  let paid = 0;
  let open = 0;
  let overdue = 0;
  let awaiting = 0;
  let awaitingCount = 0;
  for (const p of payments) {
    const key = p.stage_id && byStage[p.stage_id] ? p.stage_id : '';
    byStage[key] ??= { planned: 0, paid: 0, open: 0 };
    if (p.paid_at) {
      paid += p.amount;
      byStage[key].paid += p.amount;
    } else if (payable(p)) {
      open += p.amount;
      byStage[key].open += p.amount;
      if (p.due_date < today) overdue += p.amount;
    }
    if (!p.paid_at && p.approval === 'pendente') {
      awaiting += p.amount;
      awaitingCount += 1;
    }
  }
  for (const k of Object.keys(byStage)) byStage[k] = { planned: round2(byStage[k].planned), paid: round2(byStage[k].paid), open: round2(byStage[k].open) };
  const contracted = round2(budget + additives);
  const committed = round2(paid + open);
  return {
    budget,
    additives,
    contracted,
    paid: round2(paid),
    open: round2(open),
    overdue: round2(overdue),
    awaiting: round2(awaiting),
    awaitingCount,
    committed,
    balance: round2(contracted - committed),
    byStage,
  };
}

export type PaymentState = 'pago' | 'vencido' | 'aguardando' | 'recusado' | 'a_pagar';

export const PAYMENT_STATE: Record<PaymentState, { label: string; tone: Tone }> = {
  pago: { label: 'Pago', tone: 'success' },
  vencido: { label: 'Vencido', tone: 'danger' },
  aguardando: { label: 'Aguardando aprovação', tone: 'warning' },
  recusado: { label: 'Recusado', tone: 'neutral' },
  a_pagar: { label: 'A pagar', tone: 'info' },
};

export function paymentState(p: Pick<ObraPayment, 'paid_at' | 'approval' | 'due_date'>, today: string): PaymentState {
  if (p.paid_at) return 'pago';
  if (p.approval === 'recusado') return 'recusado';
  if (p.approval === 'pendente') return 'aguardando';
  if (p.due_date < today) return 'vencido';
  return 'a_pagar';
}

// ---------------------------------------------------------------- Aprovações
/** Chave aleatória do link público (32 caracteres, letras e números). */
export function approvalToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export function approvalUrl(token: string, origin = typeof window !== 'undefined' ? window.location.origin : ''): string {
  return `${origin}/aprovacao/${token}`;
}

/** Link do WhatsApp com a mensagem pronta (sem telefone: a pessoa escolhe o contato). */
export function whatsappLink(phone: string | null | undefined, text: string): string {
  let digits = digitsOnly(phone ?? '');
  if (digits && digits.length <= 11) digits = `55${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function approvalMessage(a: Pick<ObraApproval, 'title' | 'token' | 'client_name' | 'amount'>, office: string, money: (v: number) => string): string {
  const first = a.client_name?.trim().split(/\s+/)[0];
  return [
    `Olá${first ? `, ${first}` : ''}! Aqui é da ${office}.`,
    `Precisamos da sua aprovação: *${a.title}*${a.amount != null ? ` (${money(a.amount)})` : ''}.`,
    `Veja os detalhes e responda por aqui: ${approvalUrl(a.token)}`,
  ].join('\n');
}

/** Resumo do orçamento que vai no pedido de aprovação (o cliente vê as partes, os itens e o total). */
export function budgetSnapshot(b: Budget, detailed: boolean): ApprovalSnapshot {
  const t = budgetTotals(b.data, b.area_m2);
  const facts: ApprovalSnapshot['facts'] = [];
  if (b.address || b.city) facts.push({ label: 'Local', value: [b.address, b.city].filter(Boolean).join(' · ') });
  if (b.area_m2) facts.push({ label: 'Área', value: `${b.area_m2.toLocaleString('pt-BR')} m²` });
  if (t.days) facts.push({ label: 'Prazo estimado', value: `${t.days} dias úteis` });
  if (b.data.validity_days) facts.push({ label: 'Validade', value: `${b.data.validity_days} dias` });
  if (b.data.payment_terms.trim()) facts.push({ label: 'Pagamento', value: b.data.payment_terms.trim() });
  if (t.discount > 0) facts.push({ label: 'Desconto', value: t.discount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) });
  return {
    lines: b.data.sections.map((s, i) => ({
      label: s.name,
      value: t.sections[i].price,
      items: detailed
        ? s.items
            .filter((x) => x.description.trim())
            .map((x) => ({ description: x.description.trim(), unit: x.unit, qty: Number(x.qty) || 0, total: round2((Number(x.qty) || 0) * salePrice(itemUnitCost(x), t.bdi)) }))
        : undefined,
    })),
    facts,
    total: t.total,
    notes: [b.data.notes.trim(), b.data.exclusions.trim() ? `Não incluso: ${b.data.exclusions.trim()}` : ''].filter(Boolean).join('\n\n') || null,
  };
}

export function paymentSnapshot(p: ObraPayment, stageName: string | null): ApprovalSnapshot {
  const facts: ApprovalSnapshot['facts'] = [{ label: 'Tipo', value: PAYMENT_CATEGORY[p.category] }];
  if (p.supplier_name) facts.push({ label: 'Fornecedor', value: p.supplier_name });
  if (stageName) facts.push({ label: 'Etapa', value: stageName });
  facts.push({ label: 'Vencimento', value: p.due_date.split('-').reverse().join('/') });
  if (p.method) facts.push({ label: 'Forma', value: PAYMENT_METHOD[p.method] });
  if (p.document) facts.push({ label: 'Documento', value: p.document });
  return { facts, total: p.amount, notes: p.notes };
}

export function isObraActive(o: Pick<Obra, 'status'>): boolean {
  return o.status === 'planejamento' || o.status === 'em_andamento' || o.status === 'pausada';
}
