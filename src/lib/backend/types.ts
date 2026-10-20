import type { ApprovalKind, ApprovalSnapshot, ApprovalStatus, ModuleKey, Profile, Role, TableName, Tables } from '../types';

export interface NewUserInput {
  name: string;
  email: string;
  password: string;
  role: Role;
  job_title?: string | null;
  phone?: string | null;
  color: string;
  /** Módulos liberados (membros). */
  permissions?: ModuleKey[];
}

export interface UpdateUserAuthInput {
  userId: string;
  email?: string;
  password?: string;
  active?: boolean;
}

export interface Branding {
  office_name: string;
  logo_url: string | null;
}

/** O que o cliente vê no link de aprovação (sem login). */
export interface PublicApproval {
  id: string;
  kind: ApprovalKind;
  title: string;
  description: string | null;
  amount: number | null;
  snapshot: ApprovalSnapshot | null;
  status: ApprovalStatus;
  due_date: string | null;
  client_name: string | null;
  requested_at: string;
  requested_by_name: string | null;
  answered_at: string | null;
  answered_name: string | null;
  answer_comment: string | null;
  obra_name: string | null;
  office_name: string | null;
  logo_url: string | null;
}

/**
 * Contrato da camada de dados. Existem duas implementações:
 *  - SupabaseBackend: produção (Postgres + Auth + Realtime + Edge Function).
 *  - LocalBackend: modo demonstração, tudo salvo no navegador.
 * Toda regra de negócio vive acima deste contrato, então ambos se comportam igual.
 */
export interface Backend {
  readonly mode: 'local' | 'supabase';

  /** Nome e logo do escritório — disponível antes do login (tela de entrada). */
  getBranding(): Promise<Branding | null>;

  // Autenticação
  currentUserId(): Promise<string | null>;
  signIn(email: string, password: string): Promise<string>;
  signOut(): Promise<void>;
  changeOwnPassword(currentPassword: string, newPassword: string): Promise<void>;
  onAuthChange(cb: (userId: string | null) => void): () => void;

  /** Modo local: nenhum usuário cadastrado ainda → mostra tela de configuração inicial. */
  needsSetup(): Promise<boolean>;
  setupFirstAdmin(input: Omit<NewUserInput, 'role'>, withDemoData: boolean): Promise<string>;

  // Administração de usuários (somente administradores)
  createUser(input: NewUserInput): Promise<Profile>;
  updateUserAuth(input: UpdateUserAuthInput): Promise<void>;

  // CRUD genérico
  list<T extends TableName>(table: T): Promise<Tables[T][]>;
  insert<T extends TableName>(table: T, rows: Tables[T][]): Promise<Tables[T][]>;
  update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<Tables[T]>;
  remove(table: TableName, ids: string[]): Promise<void>;

  /** Chama uma Edge Function (somente Supabase). No modo local não faz nada. */
  invokeFunction(name: string, body: Record<string, unknown>): Promise<unknown>;

  // Arquivos (comprovantes do Financeiro). Supabase: bucket privado; local: no navegador.
  uploadFile(bucket: string, path: string, file: File): Promise<void>;
  /** Link temporário para abrir/baixar o arquivo. */
  fileUrl(bucket: string, path: string): Promise<string>;
  removeFiles(bucket: string, paths: string[]): Promise<void>;

  /** Função do banco (somente Supabase). */
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;

  /** Pedido de aprovação pelo link público (sem login). null = não encontrado. */
  getPublicApproval(token: string): Promise<PublicApproval | null>;
  /** Resposta do cliente pelo link público. */
  answerPublicApproval(token: string, status: 'aprovado' | 'recusado', name: string, comment: string | null): Promise<void>;

  /** Notifica quando outra sessão/usuário altera uma tabela. */
  subscribe(cb: (table: TableName) => void): () => void;
}
