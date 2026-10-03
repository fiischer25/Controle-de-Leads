import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { OPTIONAL_TABLES, type Profile, type TableName, type Tables } from '../types';
import type { Backend, Branding, NewUserInput, UpdateUserAuthInput } from './types';

const PAGE = 1000;
/** Tabelas que crescem sem limite: carregamos só os registros mais recentes. */
const RECENT_ONLY: Partial<Record<TableName, number>> = { activity_log: 1000, notifications: 300 };

function translateError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'E-mail ou senha inválidos.';
  if (/email not confirmed/i.test(message)) return 'E-mail ainda não confirmado. Verifique sua caixa de entrada.';
  if (/banned/i.test(message)) return 'Este usuário está desativado. Fale com o administrador.';
  if (/row-level security/i.test(message)) return 'Você não tem permissão para esta ação.';
  if (/already (been )?registered|already exists/i.test(message)) return 'Já existe um usuário com este e-mail.';
  if (/failed to send a request to the edge function|requested function was not found/i.test(message)) {
    return 'Não foi possível falar com a função do servidor. Confira no Supabase, em Edge Functions, se ela foi publicada com o nome exato indicado no guia.';
  }
  if (/wa_alerts/i.test(message) && /column|schema cache/i.test(message)) {
    return 'O banco ainda não tem o resumo diário do WhatsApp. No Supabase, abra o SQL Editor e execute a migração 20261005000000_whatsapp_alerts.sql.';
  }
  if (/permissions/i.test(message) && /column|schema cache/i.test(message)) {
    return 'O banco ainda não tem os acessos por módulo. No Supabase, abra o SQL Editor e execute a migração 20261004000000_module_permissions.sql.';
  }
  if (/invalid path specified in request url/i.test(message)) {
    return 'Endereço do Supabase inválido. Em VITE_SUPABASE_URL use só https://SEU-PROJETO.supabase.co, sem nada depois.';
  }
  return message;
}

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(translateError(error.message));
}

export class SupabaseBackend implements Backend {
  readonly mode = 'supabase' as const;
  readonly client: SupabaseClient;

  constructor(url: string, anonKey: string) {
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

  onAuthChange(cb: (userId: string | null) => void) {
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
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
      // Tabela de um recurso cuja migração ainda não foi executada: segue sem ela.
      if (error && OPTIONAL_TABLES.includes(table) && /schema cache|does not exist|PGRST205|42P01/i.test(`${error.message} ${error.code ?? ''}`)) return [];
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
