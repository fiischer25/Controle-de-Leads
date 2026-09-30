import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Filter, ListOptions, Store } from './store.ts';

/** Store sobre o Supabase usando a service role (as ferramentas aplicam as regras de permissão). */
export class SupabaseStore implements Store {
  constructor(private client: SupabaseClient) {}

  async list<T>(table: string, filters: Filter[] = [], opts: ListOptions = {}): Promise<T[]> {
    let q = this.client.from(table).select('*');
    for (const f of filters) {
      switch (f.op) {
        case 'eq': q = q.eq(f.col, f.value); break;
        case 'neq': q = q.neq(f.col, f.value); break;
        case 'gte': q = q.gte(f.col, f.value); break;
        case 'lte': q = q.lte(f.col, f.value); break;
        case 'in': q = q.in(f.col, f.value as unknown[]); break;
        case 'is': q = q.is(f.col, f.value as null); break;
      }
    }
    if (opts.order) q = q.order(opts.order, { ascending: opts.ascending ?? true });
    q = q.limit(opts.limit ?? 1000);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as T[];
  }

  async insert<T>(table: string, row: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.from(table).insert(row).select('*').single();
    if (error) throw new Error(error.message);
    return data as T;
  }

  async update<T>(table: string, id: string, patch: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.from(table).update(patch).eq('id', id).select('*').single();
    if (error) throw new Error(error.message);
    return data as T;
  }

  async remove(table: string, id: string): Promise<void> {
    const { error } = await this.client.from(table).delete().eq('id', id);
    if (error) throw new Error(error.message);
  }
}
