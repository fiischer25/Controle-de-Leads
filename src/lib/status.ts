// Mapa semântico de cores do AIROS (design system v1).
// Regra-mãe: só ganha cor o que pede ação. Todas as telas devem pedir as classes
// de estado a este módulo em vez de escolher cores por conta própria.
import type { LeadStage, ProjectStatus, TaskPriority, TaskStatus } from './types';
import { deadlineState, diffDays, formatDateShort, today, type DeadlineState } from './utils';

export type Tone = 'neutral' | 'danger' | 'warning' | 'info' | 'success' | 'brand';

/** Classes de fundo + texto para selos (Badge) de cada tom. */
export const TONE_BADGE: Record<Tone, string> = {
  neutral: 'bg-stone-100 text-stone-700',
  danger: 'bg-danger-bg text-danger-fg',
  warning: 'bg-warning-bg text-warning-fg',
  info: 'bg-info-bg text-info-fg',
  success: 'bg-success-bg text-success-fg',
  brand: 'bg-brand-100 text-brand-700',
};

/** Versão contorno do selo: borda 1px line + texto fg. */
export const TONE_OUTLINE: Record<Tone, string> = {
  neutral: 'border border-line text-stone-700',
  danger: 'border border-danger-line text-danger-fg',
  warning: 'border border-warning-line text-warning-fg',
  info: 'border border-info-line text-info-fg',
  success: 'border border-success-line text-success-fg',
  brand: 'border border-brand-200 text-brand-700',
};

/** Ponto de 6px (cor sólida) de cada tom. */
export const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-stone-400',
  danger: 'bg-danger-solid',
  warning: 'bg-warning-solid',
  info: 'bg-info-solid',
  success: 'bg-success-solid',
  brand: 'bg-brand-500',
};

/** Só o texto (prioridade, prazos, contadores). */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-muted',
  danger: 'text-danger-fg',
  warning: 'text-warning-fg',
  info: 'text-info-fg',
  success: 'text-success-fg',
  brand: 'text-brand-700',
};

/** Cores CSS (para style={{}} e SVG) que acompanham o tema claro/escuro. */
export const CSS_COLOR = {
  ink: 'rgb(var(--ink))',
  muted: 'rgb(var(--muted))',
  faint: 'rgb(var(--faint))',
  line: 'rgb(var(--line))',
  lineStrong: 'rgb(var(--line-strong))',
  accent: 'rgb(var(--accent))',
  danger: 'rgb(var(--danger-solid))',
  warning: 'rgb(var(--warning-solid))',
  info: 'rgb(var(--info-solid))',
  success: 'rgb(var(--success-solid))',
  stone: (n: number) => `rgb(var(--stone-${n}))`,
  brand: (n: number) => `rgb(var(--brand-${n}))`,
};

// ------------------------------------------------------------------ Tarefas
export interface StatusStyle {
  label: string;
  tone: Tone;
  /** Classes do selo. */
  badge: string;
  /** Classes do ponto de 6px (o "A fazer" é vazado). */
  dot: string;
  /** Ícone a exibir no selo, quando houver. */
  icon?: 'pause' | 'check';
  /** Cor sólida (CSS) para gráficos e barras do cronograma. */
  color: string;
}

export const TASK_STATUS_STYLE: Record<TaskStatus, StatusStyle> = {
  todo: { label: 'A fazer', tone: 'neutral', badge: TONE_BADGE.neutral, dot: 'border border-stone-500 bg-transparent', color: CSS_COLOR.stone(400) },
  doing: { label: 'Em andamento', tone: 'info', badge: TONE_BADGE.info, dot: TONE_DOT.info, color: CSS_COLOR.info },
  review: { label: 'Em revisão', tone: 'brand', badge: TONE_BADGE.brand, dot: TONE_DOT.brand, color: CSS_COLOR.brand(500) },
  paused: { label: 'Pausada', tone: 'neutral', badge: TONE_BADGE.neutral, dot: 'bg-stone-400', icon: 'pause', color: CSS_COLOR.stone(500) },
  done: { label: 'Concluída', tone: 'success', badge: TONE_BADGE.success, dot: TONE_DOT.success, icon: 'check', color: CSS_COLOR.success },
};

// ------------------------------------------------------------------ Projetos
export const PROJECT_STATUS_STYLE: Record<ProjectStatus, StatusStyle> = {
  nao_iniciado: { label: 'Não iniciado', tone: 'neutral', badge: TONE_BADGE.neutral, dot: 'border border-stone-500 bg-transparent', color: CSS_COLOR.stone(400) },
  em_andamento: { label: 'Em andamento', tone: 'info', badge: TONE_BADGE.info, dot: TONE_DOT.info, color: CSS_COLOR.info },
  pausado: { label: 'Pausado', tone: 'neutral', badge: TONE_BADGE.neutral, dot: 'bg-stone-400', icon: 'pause', color: CSS_COLOR.stone(500) },
  concluido: { label: 'Concluído', tone: 'success', badge: TONE_BADGE.success, dot: TONE_DOT.success, icon: 'check', color: CSS_COLOR.success },
  // Cancelado é um encerramento, não um alerta: neutro.
  cancelado: { label: 'Cancelado', tone: 'neutral', badge: 'bg-stone-100 text-stone-500', dot: 'bg-stone-300', color: CSS_COLOR.stone(300) },
};

// ------------------------------------------------------------------ Prioridade
/** Prioridade: só ícone Flag + texto, sem fundo. */
export const PRIORITY_STYLE: Record<TaskPriority, { label: string; text: string; tone: Tone }> = {
  urgente: { label: 'Urgente', text: TONE_TEXT.danger, tone: 'danger' },
  alta: { label: 'Alta', text: TONE_TEXT.danger, tone: 'danger' },
  media: { label: 'Média', text: TONE_TEXT.warning, tone: 'warning' },
  baixa: { label: 'Baixa', text: TONE_TEXT.neutral, tone: 'neutral' },
};

// ------------------------------------------------------------------ Prazos
/** Tom de um prazo: vencido = danger; hoje / dentro da janela = warning; fora dela = só texto. */
export function deadlineTone(state: DeadlineState): Tone | null {
  switch (state) {
    case 'overdue':
      return 'danger';
    case 'today':
    case 'soon':
      return 'warning';
    case 'done':
      return 'success';
    default:
      return null;
  }
}

/** Texto curto de prazo usado em listas: "venceu 1 out", "vence hoje", "em 5 dias", "21 out". */
export function deadlineText(due: string | null, done = false, soonDays = 7): string {
  if (!due) return 'Sem prazo';
  const state = deadlineState(due, done, soonDays);
  const d = diffDays(today(), due);
  if (state === 'done') return `Entregue · ${formatDateShort(due)}`;
  if (state === 'overdue') return d === -1 ? 'venceu ontem' : `venceu ${formatDateShort(due)}`;
  if (state === 'today') return 'vence hoje';
  if (state === 'soon') return d === 1 ? 'amanhã' : `em ${d} dias`;
  return formatDateShort(due);
}

/** Classe de texto para um prazo segundo a regra-mãe. */
export function deadlineTextClass(state: DeadlineState): string {
  const tone = deadlineTone(state);
  return tone ? TONE_TEXT[tone] : 'text-muted';
}

// ------------------------------------------------------------------ Funil
/** Escala bronze para as etapas abertas do funil, da primeira à última. */
const FUNNEL_SCALE = [200, 300, 400, 500, 600];

/**
 * Cor de uma etapa do funil: etapas abertas recebem a escala bronze pela ordem;
 * "ganho" usa success e "perdido" é neutro (nunca vermelho).
 */
export function stageColor(stage: Pick<LeadStage, 'id' | 'kind'> | null | undefined, stages: LeadStage[]): string {
  if (!stage) return CSS_COLOR.stone(300);
  if (stage.kind === 'won') return CSS_COLOR.success;
  if (stage.kind === 'lost') return CSS_COLOR.stone(400);
  const open = stages.filter((s) => s.kind === 'open').sort((a, b) => a.position - b.position);
  const i = Math.max(0, open.findIndex((s) => s.id === stage.id));
  // Funis com mais de 5 etapas abertas: distribui a escala proporcionalmente.
  const step = open.length <= FUNNEL_SCALE.length ? i : Math.round((i / Math.max(1, open.length - 1)) * (FUNNEL_SCALE.length - 1));
  return CSS_COLOR.brand(FUNNEL_SCALE[Math.min(step, FUNNEL_SCALE.length - 1)]);
}

/**
 * Etapas na ordem do funil: as em andamento pela posição e, sempre no fim, "Ganho" e
 * "Não ganho" (desfechos fixos do funil).
 */
export function funnelOrder<T extends Pick<LeadStage, 'kind' | 'position'>>(stages: T[]): T[] {
  const rank = (s: T) => (s.kind === 'open' ? 0 : s.kind === 'won' ? 1 : 2);
  return [...stages].sort((a, b) => rank(a) - rank(b) || a.position - b.position);
}

// ------------------------------------------------------------------ Avatares
export interface AvatarTone {
  name: 'slate' | 'sage' | 'clay' | 'plum' | 'stone';
  bg: string;
  fg: string;
}

const AVATAR_TONES: AvatarTone[] = [
  { name: 'slate', bg: '#dfe7ec', fg: '#3b5566' },
  { name: 'sage', bg: '#dde8de', fg: '#3f5d45' },
  { name: 'clay', bg: '#efe2d6', fg: '#7a4a30' },
  { name: 'plum', bg: '#e8e2ee', fg: '#5a4a6b' },
  { name: 'stone', bg: '#e9e6e1', fg: '#4f4a44' },
];

/** Tom estável por pessoa (hash do id): fundo claro + texto escuro. */
export function avatarTone(id: string | null | undefined): AvatarTone {
  if (!id) return AVATAR_TONES[4];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length];
}

/** Cor que representa a pessoa em gráficos e na agenda (o tom escuro do avatar). */
export function personColor(id: string | null | undefined): string {
  return id ? avatarTone(id).fg : CSS_COLOR.stone(400);
}
