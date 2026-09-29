// Modelo de dados do sistema AIROS.
// Os nomes dos campos seguem o padrão snake_case do banco (Supabase/Postgres)
// para que o mesmo objeto circule entre a interface e o backend sem conversões.

export type Role = 'admin' | 'member';

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
  description: string | null;
  duration_days: number;
  position: number;
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
  entity: 'lead' | 'client' | 'project' | 'task' | 'user' | 'settings';
  entity_id: string | null;
  action: string;
  description: string;
  created_at: string;
}

export interface AppSettings {
  id: string; // sempre 'office'
  office_name: string;
  calendar_embed_url: string | null;
  due_soon_days: number;
  lead_stale_days: number;
  project_code_prefix: string;
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
  notifications: Notification;
  activity_log: ActivityLog;
  app_settings: AppSettings;
}

export type TableName = keyof Tables;

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
  'notifications',
  'activity_log',
  'app_settings',
];
