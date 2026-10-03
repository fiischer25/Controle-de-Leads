import { LocalBackend } from './local';
import { SupabaseBackend } from './supabase';
import type { Backend } from './types';

// Aceita o endereço copiado com sobras comuns (barra final, /rest/v1/ etc.).
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)
  ?.trim()
  .replace(/\/(rest|auth|functions)\/v1\/?.*$/, '')
  .replace(/\/+$/, '');
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

/** Com as variáveis do Supabase definidas usa o banco na nuvem; senão, modo demonstração local. */
export const backend: Backend = url && key ? new SupabaseBackend(url, key) : new LocalBackend();

export type { Backend, Branding, NewUserInput, PasswordRecovery, UpdateUserAuthInput } from './types';
