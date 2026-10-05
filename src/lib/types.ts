// Modelo de dados do sistema AIROS.
// Os nomes dos campos seguem o padrão snake_case do banco (Supabase/Postgres)
// para que o mesmo objeto circule entre a interface e o backend sem conversões.

export type Role = 'admin' | 'member';

/**
 * Módulos que o administrador libera para cada pessoa. O Meu painel (com a
 * agenda) e as próprias tarefas são de todos; administradores têm acesso a tudo.
 */
export type ModuleKey = 'projetos' | 'comercial' | 'relatorios' | 'equipe' | 'configuracoes' | 'financeiro';

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: Role;
  job_title: string | null;
  phone: string | null;
  color: string;
  active: boolean;
  calendar_embed_url: string | null;
  /** Módulos liberados (ignorado para administradores). Ausente = acessos padrão. */
  permissions?: ModuleKey[] | null;
  /** Recebe o resumo diário no WhatsApp (padrão: sim). */
  wa_alerts?: boolean;
  created_at: string;
}

/** Etapa do funil de oportunidades (colunas do kanban). */
export type StageKind = 'open' | 'won' | 'lost';
export interface LeadStage {
  id: string;
  name: string;
  kind: StageKind;
  color: string;
  position: number;
}

export interface LeadSource {
  id: string;
  name: string;
  active: boolean;
  position: number;
}

/** Tipo de projeto (ex.: Arquitetura, Interiores, Arquitetura e Interiores). */
export interface ProjectType {
  id: string;
  name: string;
  description: string | null;
  color: string;
  active: boolean;
  position: number;
}

/** Tarefa modelo cadastrada nas configurações para cada tipo de projeto. */
export interface TaskTemplate {
  id: string;
  project_type_id: string;
  phase: string;
  title: string;
  /** Observações, copiadas para a tarefa. */
  description: string | null;
  duration_days: number;
  position: number;
  // Migração 20261008 (opcionais para funcionar antes dela):
  /** Itens do checklist, copiados para a tarefa (desmarcados). */
  checklist?: string[];
  /** Quem fica à frente; vazio = responsável do projeto. */
  assignee_id?: string | null;
  priority?: TaskPriority;
  estimated_hours?: number | null;
  /** Começa no mesmo dia da tarefa anterior (em paralelo). */
  start_with_previous?: boolean;
}

/** Forma de pagamento combinada ao ganhar a oportunidade. */
export interface LeadPaymentPlan {
  total: number;
  rows: Array<{ label: string; percent: number; due_date: string }>;
  account_id: string | null;
  preset: string;
  defined_at: string;
}

export type LeadCategory = 'Residencial' | 'Comercial' | 'Corporativo' | 'Institucional' | 'Outro';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string;
  state: string | null;
  area_m2: number | null;
  category: LeadCategory | null;
  project_type_id: string | null;
  source_id: string | null;
  referred_by: string | null;
  proposal_value: number | null;
  /** Forma de pagamento combinada no fechamento (migração 20261009). */
  payment_plan?: LeadPaymentPlan | null;
  stage_id: string;
  owner_id: string | null;
  position: number;
  next_contact_date: string | null;
  expected_close_date: string | null;
  lost_reason: string | null;
  notes: string | null;
  stage_changed_at: string;
  closed_at: string | null;
  client_id: string | null;
  converted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type InteractionType = 'nota' | 'ligacao' | 'whatsapp' | 'email' | 'reuniao' | 'visita' | 'proposta';

export interface LeadInteraction {
  id: string;
  lead_id: string;
  user_id: string | null;
  type: InteractionType;
  description: string;
  happened_at: string;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  document: string; // CPF ou CNPJ
  rg: string | null;
  birth_date: string | null;
  email: string;
  phone: string;
  profession: string | null;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  notes: string | null;
  lead_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectStatus = 'nao_iniciado' | 'em_andamento' | 'pausado' | 'concluido' | 'cancelado';

export interface ProjectLink {
  id: string;
  label: string;
  url: string;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  client_id: string;
  project_type_id: string;
  status: ProjectStatus;
  manager_id: string | null;
  member_ids: string[];
  start_date: string;
  due_date: string | null;
  area_m2: number | null;
  site_address: string | null;
  site_city: string | null;
  description: string | null;
  notes: string | null;
  links: ProjectLink[];
  lead_id: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type TaskStatus = 'todo' | 'doing' | 'review' | 'paused' | 'done';
export type TaskPriority = 'baixa' | 'media' | 'alta' | 'urgente';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Task {
  id: string;
  project_id: string | null;
  phase: string | null;
  title: string;
  description: string | null;
  assignee_id: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  start_date: string | null;
  due_date: string | null;
  estimated_hours: number | null;
  position: number;
  checklist: ChecklistItem[];
  /** Tarefa de 0 dia (migração 20261010): acontece no dia sem ocupar duração. */
  zero_days?: boolean | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimeEntry {
  id: string;
  task_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null; // null = cronômetro rodando
  minutes: number;
  note: string | null;
  created_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
  created_at: string;
}

/** Reunião / compromisso na agenda do escritório. */
export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  starts_at: string; // ISO
  ends_at: string | null; // ISO
  all_day: boolean;
  location: string | null;
  participant_ids: string[];
  project_id: string | null;
  lead_id: string | null;
  google_event_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string | null;
  entity: 'lead' | 'client' | 'project' | 'task' | 'event' | 'user' | 'settings';
  entity_id: string | null;
  action: string;
  description: string;
  created_at: string;
}

export interface AppSettings {
  id: string; // sempre 'office'
  office_name: string;
  /** Logo do escritório (data URL de imagem). Substitui o nome na interface. */
  logo_url: string | null;
  calendar_embed_url: string | null;
  due_soon_days: number;
  lead_stale_days: number;
  project_code_prefix: string;
  /** Resumo diário no WhatsApp (migração 20261005000000). */
  wa_alerts_enabled?: boolean;
  wa_alerts_hour?: number;
  wa_alerts_tasks?: boolean;
  wa_alerts_projects?: boolean;
  wa_alerts_leads?: boolean;
  wa_alerts_weekends?: boolean;
  updated_at: string;
}

// ---------------------------------------------------------------- Financeiro
export type FinanceAccountKind = 'banco' | 'caixa' | 'cartao' | 'investimento' | 'outro';
export type FinanceKind = 'receita' | 'despesa' | 'transferencia';

export interface FinanceAccount {
  id: string;
  name: string;
  kind: FinanceAccountKind;
  opening_balance: number;
  color: string;
  active: boolean;
  position: number;
  created_at: string;
}

export interface FinanceCategory {
  id: string;
  name: string;
  kind: 'receita' | 'despesa';
  color: string;
  active: boolean;
  position: number;
  created_at: string;
}

/** Comprovante, boleto ou nota anexados a um lançamento (arquivo no Storage). */
export interface FinanceAttachment {
  id: string;
  name: string;
  /** Caminho no bucket finance-docs. */
  path: string;
  size: number;
  type: string;
  uploaded_at: string;
}

/** Lançamento: conta a receber, conta a pagar ou transferência entre contas. */
export interface FinanceEntry {
  id: string;
  kind: FinanceKind;
  description: string;
  amount: number;
  due_date: string;
  /** Data do pagamento/recebimento; null = pendente. */
  paid_at: string | null;
  account_id: string | null;
  /** Transferências: conta de destino. */
  to_account_id: string | null;
  category_id: string | null;
  client_id: string | null;
  project_id: string | null;
  /** Parcelas/repetições do mesmo lançamento. */
  series_id: string | null;
  installment: number | null;
  installments: number | null;
  document: string | null;
  notes: string | null;
  /** Identificador da transação no extrato importado (evita importar duas vezes). Migração 20261007. */
  bank_ref?: string | null;
  /** Oportunidade que originou a parcela (fechamento com forma de pagamento). Migração 20261009. */
  lead_id?: string | null;
  /** Comprovantes e notas. Migração 20261007. */
  attachments?: FinanceAttachment[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Custo por hora de cada pessoa (rentabilidade dos projetos). */
export interface FinanceMemberCost {
  id: string;
  user_id: string;
  hourly_cost: number;
  updated_at: string;
}

/** Mapa tabela → tipo de linha. Usado pela camada de dados genérica. */
export interface Tables {
  profiles: Profile;
  lead_stages: LeadStage;
  lead_sources: LeadSource;
  project_types: ProjectType;
  task_templates: TaskTemplate;
  leads: Lead;
  lead_interactions: LeadInteraction;
  clients: Client;
  projects: Project;
  tasks: Task;
  time_entries: TimeEntry;
  task_comments: TaskComment;
  events: CalendarEvent;
  notifications: Notification;
  activity_log: ActivityLog;
  app_settings: AppSettings;
  finance_accounts: FinanceAccount;
  finance_categories: FinanceCategory;
  finance_entries: FinanceEntry;
  finance_member_costs: FinanceMemberCost;
}

export type TableName = keyof Tables;

/** Tabelas que podem ainda não existir no banco (migração não executada): carregam vazias. */
export const OPTIONAL_TABLES: TableName[] = ['finance_accounts', 'finance_categories', 'finance_entries', 'finance_member_costs'];

export const TABLES: TableName[] = [
  'profiles',
  'lead_stages',
  'lead_sources',
  'project_types',
  'task_templates',
  'leads',
  'lead_interactions',
  'clients',
  'projects',
  'tasks',
  'time_entries',
  'task_comments',
  'events',
  'notifications',
  'activity_log',
  'app_settings',
  'finance_accounts',
  'finance_categories',
  'finance_entries',
  'finance_member_costs',
];
