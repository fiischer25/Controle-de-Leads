// Acesso a dados usado pelas ferramentas do assistente.
// A implementação real (SupabaseStore) fica em supabase-store.ts; os testes usam uma versão em memória.

export type FilterOp = 'eq' | 'neq' | 'gte' | 'lte' | 'in' | 'is';
export interface Filter {
  col: string;
  op: FilterOp;
  value: unknown;
}

export interface ListOptions {
  order?: string;
  ascending?: boolean;
  limit?: number;
}

export interface Store {
  list<T = Record<string, unknown>>(table: string, filters?: Filter[], opts?: ListOptions): Promise<T[]>;
  insert<T = Record<string, unknown>>(table: string, row: Record<string, unknown>): Promise<T>;
  update<T = Record<string, unknown>>(table: string, id: string, patch: Record<string, unknown>): Promise<T>;
  remove(table: string, id: string): Promise<void>;
}

export const eq = (col: string, value: unknown): Filter => ({ col, op: 'eq', value });
export const gte = (col: string, value: unknown): Filter => ({ col, op: 'gte', value });
export const lte = (col: string, value: unknown): Filter => ({ col, op: 'lte', value });
export const inList = (col: string, value: unknown[]): Filter => ({ col, op: 'in', value });
