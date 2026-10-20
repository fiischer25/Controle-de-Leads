// Modelo de dados do sistema AIROS.
// Os nomes dos campos seguem o padrão snake_case do banco (Supabase/Postgres)
// para que o mesmo objeto circule entre a interface e o backend sem conversões.

export type Role = 'admin' | 'member';

/**
 * Módulos que o administrador libera para cada pessoa. O Meu painel (com a
 * agenda) e as próprias tarefas são de todos; administradores têm acesso a tudo.
 */
export type ModuleKey = 'projetos' | 'comercial' | 'obras' | 'relatorios' | 'equipe' | 'configuracoes' | 'financeiro';

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
  /** amount: valor digitado em R$ (fixo); value: valor final gravado ao salvar. */
  rows: Array<{ label: string; percent: number; due_date: string; amount?: number | null; value?: number }>;
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
  /** Recebe os lembretes de cobrança no WhatsApp (migração 20261021; padrão sim). */
  billing_reminders?: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectStatus = 'nao_iniciado' | 'em_andamento' | 'obra' | 'pausado' | 'concluido' | 'cancelado';

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
  /** Definido à mão (ex.: Obra): as tarefas não mudam mais o status. Falso = automático. */
  status_manual?: boolean;
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
  /** Documentos do projeto (contrato assinado, plantas, memoriais...). */
  attachments?: FileAttachment[];
  lead_id: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** meeting = reunião agendada com o cliente (migração 20261023000000). */
export type TaskStatus = 'todo' | 'doing' | 'meeting' | 'review' | 'paused' | 'done';
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
  /** PDFs e outros arquivos da tarefa (contrato, planta, orçamento...). */
  attachments?: FileAttachment[];
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
  entity: 'lead' | 'client' | 'project' | 'task' | 'event' | 'user' | 'settings' | 'budget' | 'obra';
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
  /** Lembretes de cobrança no WhatsApp (migração 20261021000000). */
  billing_enabled?: boolean;
  billing_days_before?: number;
  billing_on_due?: boolean;
  billing_days_after?: number;
  billing_hour?: number;
  billing_payment_info?: string | null;
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
/** Arquivo guardado no Storage (comprovante do Financeiro, PDF anexado a uma tarefa...). */
export interface FileAttachment {
  id: string;
  name: string;
  /** Caminho no bucket (finance-docs ou task-files). */
  path: string;
  size: number;
  type: string;
  uploaded_at: string;
  /** Quem anexou (anexos de tarefas). */
  uploaded_by?: string | null;
}

export type FinanceAttachment = FileAttachment;

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

// ---------------------------------------------------------------- Precificação
/** Etapa do projeto, quantos dias de trabalho ela leva e quem faz. */
export interface PricingStage {
  id: string;
  label: string;
  days: number;
  /** Quem faz a etapa; null = equipe (custo/hora médio). */
  assignee_id?: string | null;
  /** Custo/hora usado na etapa (da pessoa, ou a média da equipe), guardado ao escolher. */
  rate?: number | null;
  /** Arquitetura (entra no Basic e no Premium) ou Interiores (só no Premium). Sem valor: pelo nome. */
  scope?: PricingScope;
}
/** Parte do projeto: o pacote Basic é só arquitetura; o Premium soma arquitetura e interiores. */
export type PricingScope = 'arquitetura' | 'interiores';
export type PricingPackage = 'basic' | 'premium';
/** Custo fixo mensal do escritório (aluguel, salários, softwares…). */
export interface PricingFixedCost {
  id: string;
  label: string;
  value: number;
  /** Salário / pró-labore: sai do custo do dia quando a equipe entra pelo custo de cada pessoa nas etapas. */
  labor?: boolean;
}
/** Custo indireto: % sobre o preço (impostos, taxas) ou valor fixo no projeto. */
export interface PricingIndirect {
  id: string;
  label: string;
  kind: 'percent' | 'valor';
  value: number;
}
/** Adicional do projeto: visitas, presentes, terceirização… (quantidade × valor). */
export interface PricingExtra {
  id: string;
  label: string;
  qty: number;
  unit: number;
  /** Arquitetura: entra nos dois pacotes; Interiores: só no Premium. */
  scope?: PricingScope;
}
export interface PricingData {
  stages: PricingStage[];
  fixed: PricingFixedCost[];
  /** Dias úteis de trabalho por mês (divide os custos fixos). */
  work_days: number;
  /** Horas de trabalho num dia (dias da etapa × horas × custo/hora da pessoa). */
  hours_per_day?: number;
  indirect: PricingIndirect[];
  extras: PricingExtra[];
  /** Lucro desejado, em % do preço. */
  margin: number;
  /** R$/m² de referência, para comparar com o preço pelos dias. */
  ref_m2: number | null;
  /** Valor que vai na proposta (ex.: arredondado); vazio = preço sugerido. */
  final_price: number | null;
  notes: string;
  /** Projeto que segue esta precificação (previsto × realizado). Sem ele, vale a da oportunidade. */
  project_id?: string | null;
  /** Valor da proposta do pacote Basic (só arquitetura); `final_price` é o do Premium (tudo). */
  final_price_basic?: number | null;
  /** Pacote que vai para a oportunidade (padrão: Premium). */
  package?: PricingPackage;
}
/** Precificação de um projeto: pelos dias de trabalho, comparada com o m². */
export interface Pricing {
  id: string;
  name: string;
  client_name: string | null;
  lead_id: string | null;
  project_type_id: string | null;
  area_m2: number | null;
  data: PricingData;
  /** Valor da proposta (ou o sugerido), para listar e ordenar. */
  total: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Lembrete de cobrança enviado (automático pela função whatsapp-alerts ou à mão). */
export interface BillingReminderLog {
  id: string;
  entry_id: string;
  kind: 'antes' | 'no_dia' | 'depois' | 'manual';
  due_date: string;
  status: 'pendente' | 'enviado' | 'erro' | 'manual';
  detail: string | null;
  phone: string | null;
  sent_by: string | null;
  created_at: string;
}


// ---------------------------------------------------------------- Obras
/** Item do orçamento: quantidade × (material + mão de obra) por unidade. */
export interface BudgetItem {
  id: string;
  description: string;
  /** un, m², m, m³, vb (verba), kg, h, dia, pç, cj… */
  unit: string;
  qty: number;
  /** Custo unitário de material. */
  material: number;
  /** Custo unitário de mão de obra. */
  labor: number;
  notes?: string | null;
}

/** Parte da obra (Pintura, Elétrica, Hidráulica…), que vira etapa ao converter em obra. */
export interface BudgetSection {
  id: string;
  name: string;
  items: BudgetItem[];
  /** Prazo estimado da parte, em dias úteis (monta o cronograma da obra). */
  days?: number | null;
}

export interface BudgetData {
  sections: BudgetSection[];
  /** BDI: administração, lucro e impostos, em % sobre o custo. */
  bdi: number;
  /** Desconto em R$ sobre o total. */
  discount: number;
  /** Validade da proposta, em dias. */
  validity_days: number;
  payment_terms: string;
  /** Escopo e observações que vão na proposta. */
  notes: string;
  /** O que não está incluso. */
  exclusions: string;
}

export type BudgetStatus = 'rascunho' | 'enviado' | 'aprovado' | 'recusado';

/** Orçamento prévio da obra, por partes. Aprovado, vira obra. */
export interface Budget {
  id: string;
  code: string;
  name: string;
  client_id: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  lead_id: string | null;
  project_id: string | null;
  address: string | null;
  city: string | null;
  area_m2: number | null;
  status: BudgetStatus;
  data: BudgetData;
  /** Valor final (com BDI e desconto), para listar e ordenar. */
  total: number;
  /** Obra criada a partir deste orçamento. */
  obra_id: string | null;
  sent_at: string | null;
  answered_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ObraStatus = 'planejamento' | 'em_andamento' | 'pausada' | 'concluida' | 'cancelada';

export interface Obra {
  id: string;
  code: string;
  name: string;
  client_id: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  budget_id: string | null;
  /** Projeto de arquitetura/interiores que deu origem à obra. */
  project_id: string | null;
  manager_id: string | null;
  member_ids: string[];
  status: ObraStatus;
  address: string | null;
  city: string | null;
  area_m2: number | null;
  start_date: string | null;
  due_date: string | null;
  /** Valor orçado/contratado (sem os aditivos aprovados, que somam à parte). */
  contract_value: number | null;
  notes: string | null;
  /** Documentos da obra (contrato, ART/RRT, alvará, projetos…). */
  attachments: FileAttachment[];
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Etapa do cronograma físico-financeiro da obra. */
export interface ObraStage {
  id: string;
  obra_id: string;
  name: string;
  position: number;
  start_date: string | null;
  due_date: string | null;
  /** Avanço físico, 0 a 100. */
  progress: number;
  /** Valor previsto da etapa (do orçamento). */
  budget: number;
  /** Itens orçados (cópia do orçamento). */
  items: BudgetItem[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Foto da obra: arquivo no Storage com legenda e etapa. */
export interface ObraPhoto extends FileAttachment {
  caption?: string | null;
  stage_id?: string | null;
}

export type ObraVisitKind = 'visita' | 'vistoria' | 'reuniao' | 'medicao' | 'entrega';

/** Visita à obra (diário de obra): resumo, clima, equipe no local, fotos e avanço das etapas. */
export interface ObraVisit {
  id: string;
  obra_id: string;
  date: string;
  kind: ObraVisitKind;
  author_id: string | null;
  summary: string;
  weather: string | null;
  /** Quem estava trabalhando (ex.: "Eletricista + 2 ajudantes"). */
  workers: string | null;
  notes: string | null;
  photos: ObraPhoto[];
  /** Avanço informado na visita: etapa, de quanto para quanto (%). */
  progress: Array<{ stage_id: string; from: number; to: number }>;
  /** Aparece no relatório do cliente. */
  shared: boolean;
  created_at: string;
  updated_at: string;
}

export type ObraPaymentCategory = 'material' | 'mao_de_obra' | 'servico' | 'equipamento' | 'taxa' | 'outro';
export type ObraPaymentMethod = 'pix' | 'boleto' | 'transferencia' | 'cartao' | 'dinheiro' | 'outro';
export type ApprovalState = 'nao_requer' | 'pendente' | 'aprovado' | 'recusado';

/** Pagamento da obra (fornecedor, mão de obra, material), com aprovação do cliente. */
export interface ObraPayment {
  id: string;
  obra_id: string;
  stage_id: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  description: string;
  category: ObraPaymentCategory;
  amount: number;
  due_date: string;
  /** Data do pagamento; null = em aberto. */
  paid_at: string | null;
  method: ObraPaymentMethod | null;
  /** Quem paga: o cliente direto ao fornecedor (gerenciamento) ou o escritório. */
  payer: 'cliente' | 'escritorio';
  approval: ApprovalState;
  approval_id: string | null;
  /** Nº da nota fiscal, boleto ou recibo. */
  document: string | null;
  attachments: FileAttachment[];
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ApprovalKind = 'orcamento' | 'pagamento' | 'aditivo' | 'material' | 'projeto' | 'medicao' | 'outro';
export type ApprovalStatus = 'pendente' | 'aprovado' | 'recusado' | 'cancelado';

/** Resumo do que o cliente aprova, gravado no pedido (a página pública não lê as outras tabelas). */
export interface ApprovalSnapshot {
  lines?: Array<{ label: string; detail?: string | null; value?: number | null; items?: Array<{ description: string; unit: string; qty: number; total: number }> }>;
  facts?: Array<{ label: string; value: string }>;
  total?: number | null;
  notes?: string | null;
}

/** Pedido de aprovação do cliente (orçamento, pagamento, aditivo, material…), respondido pelo link. */
export interface ObraApproval {
  id: string;
  obra_id: string | null;
  budget_id: string | null;
  payment_id: string | null;
  kind: ApprovalKind;
  title: string;
  description: string | null;
  amount: number | null;
  snapshot: ApprovalSnapshot | null;
  /** Chave do link público (/aprovacao/<token>). */
  token: string;
  status: ApprovalStatus;
  due_date: string | null;
  client_name: string | null;
  client_phone: string | null;
  requested_by: string | null;
  requested_at: string;
  answered_at: string | null;
  answered_name: string | null;
  answer_comment: string | null;
  /** link: o próprio cliente respondeu; manual: a equipe registrou (WhatsApp, reunião…). */
  answered_via: 'link' | 'manual' | null;
  created_at: string;
  updated_at: string;
}

/** Pendência da obra (punch list): o que falta corrigir ou terminar. */
export interface ObraIssue {
  id: string;
  obra_id: string;
  stage_id: string | null;
  title: string;
  description: string | null;
  /** Quem resolve (fornecedor, empreiteiro, equipe). */
  responsible: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: 'aberta' | 'resolvida';
  photos: ObraPhoto[];
  resolved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Fornecedor ou prestador (empreiteiro, eletricista, loja de material…). */
export interface ObraSupplier {
  id: string;
  name: string;
  /** Especialidade: Elétrica, Pintura, Marcenaria… */
  trade: string | null;
  contact: string | null;
  phone: string | null;
  email: string | null;
  document: string | null;
  pix: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
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
  pricings: Pricing;
  billing_reminder_log: BillingReminderLog;
  budgets: Budget;
  obras: Obra;
  obra_stages: ObraStage;
  obra_visits: ObraVisit;
  obra_payments: ObraPayment;
  obra_approvals: ObraApproval;
  obra_issues: ObraIssue;
  obra_suppliers: ObraSupplier;
}

export type TableName = keyof Tables;

/** Tabelas do módulo Obras (migração 20261024000000_obras.sql). */
export const OBRA_TABLES: TableName[] = ['budgets', 'obras', 'obra_stages', 'obra_visits', 'obra_payments', 'obra_approvals', 'obra_issues', 'obra_suppliers'];

/** Tabelas que podem ainda não existir no banco (migração não executada): carregam vazias. */
export const OPTIONAL_TABLES: TableName[] = ['finance_accounts', 'finance_categories', 'finance_entries', 'finance_member_costs', 'pricings', 'billing_reminder_log', ...OBRA_TABLES];

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
  'pricings',
  'billing_reminder_log',
  ...OBRA_TABLES,
];
