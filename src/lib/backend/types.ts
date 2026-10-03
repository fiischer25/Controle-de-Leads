import type { ModuleKey, Profile, Role, TableName, Tables } from '../types';

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

  /** Notifica quando outra sessão/usuário altera uma tabela. */
  subscribe(cb: (table: TableName) => void): () => void;
}
