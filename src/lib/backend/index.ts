import { LocalBackend } from './local';
import { SupabaseBackend } from './supabase';
import type { Backend } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Com as variáveis do Supabase definidas usa o banco na nuvem; senão, modo demonstração local. */
export const backend: Backend = url && key ? new SupabaseBackend(url, key) : new LocalBackend();

export type { Backend, NewUserInput, UpdateUserAuthInput } from './types';
