import type {
  InteractionType,
  LeadCategory,
  ProjectStatus,
  StageKind,
  TaskPriority,
  TaskStatus,
} from './types';

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; dot: string; badge: string }> = {
  nao_iniciado: { label: 'Não iniciado', dot: 'bg-stone-400', badge: 'bg-stone-100 text-stone-700 ring-stone-200' },
  em_andamento: { label: 'Em andamento', dot: 'bg-sky-500', badge: 'bg-sky-50 text-sky-800 ring-sky-200' },
  pausado: { label: 'Pausado', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-800 ring-amber-200' },
  concluido: { label: 'Concluído', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  cancelado: { label: 'Cancelado', dot: 'bg-rose-400', badge: 'bg-rose-50 text-rose-700 ring-rose-200' },
};
export const PROJECT_STATUS_ORDER: ProjectStatus[] = ['nao_iniciado', 'em_andamento', 'pausado', 'concluido', 'cancelado'];

export const TASK_STATUS: Record<TaskStatus, { label: string; dot: string; badge: string }> = {
  todo: { label: 'A fazer', dot: 'bg-stone-400', badge: 'bg-stone-100 text-stone-700 ring-stone-200' },
  doing: { label: 'Em andamento', dot: 'bg-sky-500', badge: 'bg-sky-50 text-sky-800 ring-sky-200' },
  review: { label: 'Em revisão', dot: 'bg-violet-500', badge: 'bg-violet-50 text-violet-800 ring-violet-200' },
  paused: { label: 'Pausada', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-800 ring-amber-200' },
  done: { label: 'Concluída', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
};
export const TASK_STATUS_ORDER: TaskStatus[] = ['todo', 'doing', 'review', 'paused', 'done'];

export const TASK_PRIORITY: Record<TaskPriority, { label: string; className: string; weight: number }> = {
  baixa: { label: 'Baixa', className: 'text-stone-500', weight: 0 },
  media: { label: 'Média', className: 'text-sky-700', weight: 1 },
  alta: { label: 'Alta', className: 'text-amber-700', weight: 2 },
  urgente: { label: 'Urgente', className: 'text-rose-700', weight: 3 },
};
export const TASK_PRIORITY_ORDER: TaskPriority[] = ['baixa', 'media', 'alta', 'urgente'];

export const STAGE_KIND: Record<StageKind, string> = {
  open: 'Em andamento',
  won: 'Fechado (ganho)',
  lost: 'Perdido',
};

export const LEAD_CATEGORIES: LeadCategory[] = ['Residencial', 'Comercial', 'Corporativo', 'Institucional', 'Outro'];

export const INTERACTION_TYPES: Record<InteractionType, string> = {
  nota: 'Anotação',
  ligacao: 'Ligação',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  reuniao: 'Reunião',
  visita: 'Visita técnica',
  proposta: 'Proposta',
};

export const BR_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

/** Cores disponíveis para membros, etapas e tipos de projeto. */
export const SWATCHES = [
  '#9a5b3f', // terracota
  '#2a78d6', // azul
  '#1baf7a', // água
  '#7c6f64', // taupe
  '#4a3aa7', // violeta
  '#eb6834', // laranja
  '#008300', // verde
  '#e87ba4', // magenta
  '#c98500', // mostarda
  '#e34948', // vermelho
  '#0f766e', // petróleo
  '#57534e', // grafite
];

export const LOST_REASONS = [
  'Preço / orçamento',
  'Escolheu outro escritório',
  'Adiou o projeto',
  'Sem retorno do cliente',
  'Fora do perfil do escritório',
  'Outro',
];
