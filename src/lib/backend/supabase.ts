import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Profile, TableName, Tables } from '../types';
import type { Backend, Branding, NewUserInput, PasswordRecovery, UpdateUserAuthInput } from './types';

const PAGE = 1000;
/** Tabelas que crescem sem limite: carregamos só os registros mais recentes. */
const RECENT_ONLY: Partial<Record<TableName, number>> = { activity_log: 1000, notifications: 300 };

function translateError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'E-mail ou senha inválidos.';
  if (/email not confirmed/i.test(message)) return 'E-mail ainda não confirmado. Verifique sua caixa de entrada.';
  if (/banned/i.test(message)) return 'Este usuário está desativado. Fale com o administrador.';
  if (/row-level security/i.test(message)) return 'Você não tem permissão para esta ação.';
  if (/already (been )?registered|already exists/i.test(message)) return 'Já existe um usuário com este e-mail.';
  if (/rate limit|only request this after/i.test(message)) return 'Muitos pedidos seguidos. Aguarde alguns minutos e tente de novo.';
  if (/should be different from the old password/i.test(message)) return 'A nova senha precisa ser diferente da anterior.';
  if (/password should be at least/i.test(message)) return 'A senha deve ter pelo menos 6 caracteres.';
  if (/auth session missing/i.test(message)) return 'O link de redefinição expirou. Peça um novo na tela de entrada.';
  if (/failed to send a request to the edge function|requested function was not found/i.test(message)) {
    return 'Não foi possível falar com a função do servidor. Confira no Supabase, em Edge Functions, se ela foi publicada com o nome exato indicado no guia.';
  }
  if (/invalid path specified in request url/i.test(message)) {
    return 'Endereço do Supabase inválido. Em VITE_SUPABASE_URL use só https://SEU-PROJETO.supabase.co, sem nada depois.';
  }
  return message;
}

/** Para onde o link do e-mail de "esqueci minha senha" leva. */
const RESET_PATH = '/redefinir-senha';
const RECOVERY_KEY = 'airos:password-recovery';

/** Lê o retorno do link de redefinição antes de o cliente do Supabase limpar o endereço. */
function recoveryFromUrl(): PasswordRecovery {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  if (hash.get('type') === 'recovery' && hash.get('access_token')) return 'active';
  const query = new URLSearchParams(window.location.search);
  const failed = hash.get('error') || hash.get('error_code') || query.get('error') || query.get('error_code');
  if (window.location.pathname === RESET_PATH && failed) return 'expired';
  return null;
}

// Guardado na aba para sobreviver a um recarregar da página no meio da redefinição.
function storedRecovery(): PasswordRecovery {
  try {
    const v = sessionStorage.getItem(RECOVERY_KEY);
    return v === 'active' || v === 'expired' ? v : null;
  } catch {
    return null;
  }
}

function storeRecovery(v: PasswordRecovery) {
  try {
    if (v) sessionStorage.setItem(RECOVERY_KEY, v);
    else sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    // sem sessionStorage: vale só enquanto a página estiver aberta
  }
}

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(translateError(error.message));
}

export class SupabaseBackend implements Backend {
  readonly mode = 'supabase' as const;
  readonly client: SupabaseClient;
  private recovery: PasswordRecovery;

  constructor(url: string, anonKey: string) {
    const fromUrl = recoveryFromUrl();
    if (fromUrl) storeRecovery(fromUrl);
    this.recovery = fromUrl ?? storedRecovery();
    this.client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }

  async getBranding(): Promise<Branding | null> {
    const { data, error } = await this.client.rpc('office_branding');
    if (error || !data) return null;
    return data as Branding;
  }

  async currentUserId() {
    const { data } = await this.client.auth.getSession();
    return data.session?.user.id ?? null;
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.client.auth.signInWithPassword({ email: email.trim(), password });
    fail(error);
    const { data: profile } = await this.client.from('profiles').select('active').eq('id', data.user.id).single();
    if (!profile?.active) {
      await this.client.auth.signOut();
      throw new Error('Este usuário está desativado ou ainda não foi liberado pelo administrador.');
    }
    return data.user.id;
  }

  async signOut() {
    await this.client.auth.signOut();
  }

  async changeOwnPassword(currentPassword: string, newPassword: string) {
    const { data } = await this.client.auth.getUser();
    const email = data.user?.email;
    if (!email) throw new Error('Sessão expirada. Entre novamente.');
    const check = await this.client.auth.signInWithPassword({ email, password: currentPassword });
    if (check.error) throw new Error('Senha atual incorreta.');
    const { error } = await this.client.auth.updateUser({ password: newPassword });
    fail(error);
  }

  private setRecovery(v: PasswordRecovery) {
    this.recovery = v;
    storeRecovery(v);
  }

  async requestPasswordReset(email: string) {
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}${RESET_PATH}`,
    });
    fail(error);
  }

  passwordRecovery() {
    return this.recovery;
  }

  async completePasswordReset(newPassword: string) {
    const { data, error } = await this.client.auth.updateUser({ password: newPassword });
    fail(error);
    this.setRecovery(null);
    const { data: profile } = await this.client.from('profiles').select('active').eq('id', data.user.id).single();
    if (!profile?.active) {
      await this.client.auth.signOut();
      throw new Error('Senha alterada, mas este usuário está desativado ou ainda não foi liberado pelo administrador.');
    }
  }

  async dismissPasswordRecovery() {
    const wasActive = this.recovery === 'active';
    this.setRecovery(null);
    if (wasActive) await this.client.auth.signOut();
  }

  onAuthChange(cb: (userId: string | null) => void) {
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') this.setRecovery('active');
      if (event === 'SIGNED_OUT' && this.recovery === 'active') this.setRecovery(null);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY') {
        cb(session?.user.id ?? null);
      }
    });
    return () => data.subscription.unsubscribe();
  }

  async needsSetup() {
    const { data, error } = await this.client.rpc('office_needs_setup');
    if (error) return false;
    return Boolean(data);
  }

  async setupFirstAdmin(input: Omit<NewUserInput, 'role'>) {
    const { data, error } = await this.client.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: { data: { name: input.name, color: input.color, job_title: input.job_title ?? null } },
    });
    fail(error);
    if (!data.session) {
      throw new Error(
        'Conta criada! Confirme o e-mail enviado pelo Supabase e depois faça login. (Ou desative "Confirm email" no painel do Supabase.)',
      );
    }
    return data.user!.id;
  }

  private async invokeAdmin(body: Record<string, unknown>) {
    const { data, error } = await this.client.functions.invoke('admin-users', { body });
    if (error) {
      let message = error.message;
      try {
        const ctx = (error as { context?: Response }).context;
        const parsed = ctx ? await ctx.json() : null;
        if (parsed?.error) message = parsed.error;
      } catch {
        /* resposta sem JSON */
      }
      throw new Error(translateError(message));
    }
    if (data?.error) throw new Error(translateError(data.error));
    return data;
  }

  async createUser(input: NewUserInput): Promise<Profile> {
    const data = await this.invokeAdmin({ action: 'create', ...input });
    return data.profile as Profile;
  }

  async updateUserAuth(input: UpdateUserAuthInput) {
    await this.invokeAdmin({ action: 'update', ...input });
  }

  async list<T extends TableName>(table: T): Promise<Tables[T][]> {
    const limit = RECENT_ONLY[table];
    if (limit) {
      const { data, error } = await this.client
        .from(table)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      fail(error);
      return (data ?? []) as Tables[T][];
    }
    const all: Tables[T][] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.client
        .from(table)
        .select('*')
        .order('id')
        .range(from, from + PAGE - 1);
      fail(error);
      all.push(...((data ?? []) as Tables[T][]));
      if (!data || data.length < PAGE) break;
    }
    return all;
  }

  async insert<T extends TableName>(table: T, rows: Tables[T][]) {
    if (rows.length === 0) return [];
    if (table === 'notifications') {
      // Notificações para outra pessoa não são legíveis por quem cria (RLS),
      // então não pedimos o retorno da linha inserida.
      const { error } = await this.client.from(table).insert(rows);
      fail(error);
      return rows;
    }
    const { data, error } = await this.client.from(table).insert(rows).select('*');
    fail(error);
    return (data ?? []) as Tables[T][];
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>) {
    const { data, error } = await this.client.from(table).update(patch as never).eq('id', id).select('*').single();
    fail(error);
    return data as Tables[T];
  }

  async remove(table: TableName, ids: string[]) {
    if (ids.length === 0) return;
    const { error } = await this.client.from(table).delete().in('id', ids);
    fail(error);
  }

  async invokeFunction(name: string, body: Record<string, unknown>) {
    const { data, error } = await this.client.functions.invoke(name, { body });
    if (error) {
      let message = error.message;
      try {
        const ctx = (error as { context?: Response }).context;
        const parsed = ctx ? await ctx.json() : null;
        if (parsed?.error) message = parsed.error;
      } catch {
        /* resposta sem JSON */
      }
      throw new Error(translateError(message));
    }
    return data;
  }

  subscribe(cb: (table: TableName) => void) {
    const channel = this.client
      .channel('airos-db')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => cb(payload.table as TableName))
      .subscribe();
    return () => {
      this.client.removeChannel(channel);
    };
  }
}
