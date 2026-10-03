import type { Profile, TableName, Tables } from '../types';
import { TABLES } from '../types';
import { nowIso, uid } from '../utils';
import type { Backend, Branding, NewUserInput, UpdateUserAuthInput } from './types';
import { DEFAULT_PERMISSIONS } from '../permissions';

/**
 * Backend de demonstração: todos os dados ficam no localStorage deste navegador.
 * Serve para experimentar o sistema sem configurar servidor. Para uso real com
 * vários usuários em computadores diferentes, configure o Supabase (ver README).
 */

const PREFIX = 'airos:v1:';
const CREDENTIALS_KEY = `${PREFIX}credentials`;
const SESSION_KEY = `${PREFIX}session`;
const CHANNEL = 'airos-sync';

interface Credential {
  userId: string;
  email: string;
  salt: string;
  hash: string;
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100_000, hash: 'SHA-256' },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export class LocalBackend implements Backend {
  readonly mode = 'local' as const;
  private authListeners = new Set<(id: string | null) => void>();
  private channel: BroadcastChannel | null =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;

  private rows<T extends TableName>(table: T): Tables[T][] {
    return read<Tables[T][]>(PREFIX + table, []);
  }

  private save<T extends TableName>(table: T, rows: Tables[T][]) {
    write(PREFIX + table, rows);
    this.channel?.postMessage({ table });
  }

  private credentials(): Credential[] {
    return read<Credential[]>(CREDENTIALS_KEY, []);
  }

  private emitAuth(id: string | null) {
    this.authListeners.forEach((cb) => cb(id));
  }

  async getBranding(): Promise<Branding | null> {
    const s = this.rows('app_settings')[0];
    return s ? { office_name: s.office_name, logo_url: s.logo_url ?? null } : null;
  }

  async currentUserId() {
    const id = read<string | null>(SESSION_KEY, null);
    if (!id) return null;
    const profile = this.rows('profiles').find((p) => p.id === id);
    return profile?.active ? id : null;
  }

  async signIn(email: string, password: string) {
    const cred = this.credentials().find((c) => c.email.toLowerCase() === email.trim().toLowerCase());
    if (!cred || (await hashPassword(password, cred.salt)) !== cred.hash) {
      throw new Error('E-mail ou senha inválidos.');
    }
    const profile = this.rows('profiles').find((p) => p.id === cred.userId);
    if (!profile?.active) throw new Error('Este usuário está desativado. Fale com o administrador.');
    write(SESSION_KEY, cred.userId);
    this.emitAuth(cred.userId);
    return cred.userId;
  }

  async signOut() {
    localStorage.removeItem(SESSION_KEY);
    this.emitAuth(null);
  }

  async changeOwnPassword(currentPassword: string, newPassword: string) {
    const id = await this.currentUserId();
    const creds = this.credentials();
    const cred = creds.find((c) => c.userId === id);
    if (!cred || (await hashPassword(currentPassword, cred.salt)) !== cred.hash) {
      throw new Error('Senha atual incorreta.');
    }
    cred.salt = uid();
    cred.hash = await hashPassword(newPassword, cred.salt);
    write(CREDENTIALS_KEY, creds);
  }

  onAuthChange(cb: (userId: string | null) => void) {
    this.authListeners.add(cb);
    const onStorage = (e: StorageEvent) => {
      if (e.key === SESSION_KEY) this.currentUserId().then(cb);
    };
    window.addEventListener('storage', onStorage);
    return () => {
      this.authListeners.delete(cb);
      window.removeEventListener('storage', onStorage);
    };
  }

  async needsSetup() {
    return this.credentials().length === 0;
  }

  async setupFirstAdmin(input: Omit<NewUserInput, 'role'>, withDemoData: boolean) {
    if (!(await this.needsSetup())) throw new Error('O sistema já foi configurado.');
    const profile = await this.addUser({ ...input, role: 'admin' });
    if (withDemoData) {
      const { buildDemoData } = await import('../demo');
      const demo = await buildDemoData(profile, async (u) => this.addUser(u));
      for (const table of TABLES) {
        const rows = demo[table];
        if (rows?.length) this.save(table, [...this.rows(table), ...(rows as never[])]);
      }
    }
    write(SESSION_KEY, profile.id);
    this.emitAuth(profile.id);
    return profile.id;
  }

  private async addUser(input: NewUserInput): Promise<Profile> {
    const creds = this.credentials();
    const email = input.email.trim().toLowerCase();
    if (creds.some((c) => c.email === email)) throw new Error('Já existe um usuário com este e-mail.');
    const profile: Profile = {
      id: uid(),
      name: input.name.trim(),
      email,
      role: input.role,
      job_title: input.job_title ?? null,
      phone: input.phone ?? null,
      color: input.color,
      active: true,
      calendar_embed_url: null,
      permissions: input.permissions ?? DEFAULT_PERMISSIONS,
      created_at: nowIso(),
    };
    const salt = uid();
    creds.push({ userId: profile.id, email, salt, hash: await hashPassword(input.password, salt) });
    write(CREDENTIALS_KEY, creds);
    this.save('profiles', [...this.rows('profiles'), profile]);
    return profile;
  }

  private async assertAdmin() {
    const id = await this.currentUserId();
    const me = this.rows('profiles').find((p) => p.id === id);
    if (me?.role !== 'admin') throw new Error('Apenas administradores podem gerenciar usuários.');
  }

  async createUser(input: NewUserInput) {
    await this.assertAdmin();
    return this.addUser(input);
  }

  async updateUserAuth({ userId, email, password, active }: UpdateUserAuthInput) {
    await this.assertAdmin();
    const creds = this.credentials();
    const cred = creds.find((c) => c.userId === userId);
    if (!cred) throw new Error('Usuário não encontrado.');
    if (email) {
      const normalized = email.trim().toLowerCase();
      if (creds.some((c) => c.email === normalized && c.userId !== userId)) {
        throw new Error('Já existe um usuário com este e-mail.');
      }
      cred.email = normalized;
    }
    if (password) {
      cred.salt = uid();
      cred.hash = await hashPassword(password, cred.salt);
    }
    write(CREDENTIALS_KEY, creds);
    if (email || active !== undefined) {
      const patch: Partial<Profile> = {};
      if (email) patch.email = email.trim().toLowerCase();
      if (active !== undefined) patch.active = active;
      await this.update('profiles', userId, patch);
    }
  }

  async list<T extends TableName>(table: T) {
    return this.rows(table);
  }

  async insert<T extends TableName>(table: T, rows: Tables[T][]) {
    this.save(table, [...this.rows(table), ...rows]);
    return rows;
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>) {
    const rows = this.rows(table);
    const idx = rows.findIndex((r) => (r as { id: string }).id === id);
    if (idx < 0) throw new Error('Registro não encontrado.');
    const updated = { ...rows[idx], ...patch } as Tables[T];
    rows[idx] = updated;
    this.save(table, rows);
    return updated;
  }

  async remove(table: TableName, ids: string[]) {
    const set = new Set(ids);
    this.save(
      table,
      this.rows(table).filter((r) => !set.has((r as { id: string }).id)),
    );
  }

  async invokeFunction(): Promise<unknown> {
    return null;
  }

  subscribe(cb: (table: TableName) => void) {
    const onMessage = (e: MessageEvent) => cb(e.data.table as TableName);
    this.channel?.addEventListener('message', onMessage);
    return () => this.channel?.removeEventListener('message', onMessage);
  }
}
