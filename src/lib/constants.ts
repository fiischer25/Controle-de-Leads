import type {
  InteractionType,
  LeadCategory,
  ProjectStatus,
  StageKind,
  TaskPriority,
  TaskStatus,
} from './types';
import { PRIORITY_STYLE, PROJECT_STATUS_STYLE, TASK_STATUS_STYLE } from './status';

// Cores de status vêm do mapa semântico (src/lib/status.ts).
export const PROJECT_STATUS: Record<ProjectStatus, { label: string; dot: string; badge: string }> = PROJECT_STATUS_STYLE;
export const PROJECT_STATUS_ORDER: ProjectStatus[] = ['nao_iniciado', 'em_andamento', 'pausado', 'concluido', 'cancelado'];

export const TASK_STATUS: Record<TaskStatus, { label: string; dot: string; badge: string }> = TASK_STATUS_STYLE;
export const TASK_STATUS_ORDER: TaskStatus[] = ['todo', 'doing', 'review', 'paused', 'done'];

export const TASK_PRIORITY: Record<TaskPriority, { label: string; className: string; weight: number }> = {
  baixa: { label: 'Baixa', className: PRIORITY_STYLE.baixa.text, weight: 0 },
  media: { label: 'Média', className: PRIORITY_STYLE.media.text, weight: 1 },
  alta: { label: 'Alta', className: PRIORITY_STYLE.alta.text, weight: 2 },
  urgente: { label: 'Urgente', className: PRIORITY_STYLE.urgente.text, weight: 3 },
};
export const TASK_PRIORITY_ORDER: TaskPriority[] = ['baixa', 'media', 'alta', 'urgente'];

export const STAGE_KIND: Record<StageKind, string> = {
  open: 'Em andamento',
  won: 'Ganho',
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

/** Cores disponíveis para tipos de projeto: tons sóbrios, sem saturação. */
export const SWATCHES = [
  '#8f7c61', // bronze
  '#557589', // ardósia
  '#5d8263', // sálvia
  '#a0674a', // argila
  '#6e5f80', // ameixa
  '#6b655c', // pedra
  '#b5862f', // ocre
  '#3f5d45', // musgo
  '#3b5566', // petróleo
  '#76654e', // bronze escuro
]

export const LOST_REASONS = [
  'Preço / orçamento',
  'Escolheu outro escritório',
  'Adiou o projeto',
  'Sem retorno do cliente',
  'Fora do perfil do escritório',
  'Outro',
];
