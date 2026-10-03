import type { ModuleKey, Profile } from './types';

export interface ModuleInfo {
  key: ModuleKey;
  label: string;
  /** Rótulo curto para listas. */
  short: string;
  description: string;
}

/** Ordem e textos exibidos no cadastro de membros. */
export const MODULES: ModuleInfo[] = [
  { key: 'projetos', short: 'Projetos', label: 'Projetos e tarefas', description: 'Lista e detalhe dos projetos, tarefas de toda a equipe e quadro de tarefas.' },
  { key: 'comercial', short: 'Comercial', label: 'Oportunidades e clientes', description: 'Funil de oportunidades, cadastro de clientes e conversão em projeto.' },
  { key: 'relatorios', short: 'Relatórios', label: 'Relatórios', description: 'Indicadores comerciais e de produção, horas e exportações.' },
  { key: 'equipe', short: 'Equipe', label: 'Equipe', description: 'Lista da equipe com a carga de trabalho de cada pessoa.' },
  { key: 'configuracoes', short: 'Configurações', label: 'Configurações', description: 'Escritório, tipos de projeto e tarefas-modelo, funil, origens e agenda.' },
];

/** Acessos de quem ainda não teve os módulos definidos (igual ao comportamento anterior). */
export const DEFAULT_PERMISSIONS: ModuleKey[] = ['projetos', 'comercial', 'relatorios', 'equipe'];

export function modulesOf(profile: Pick<Profile, 'role' | 'permissions'> | null | undefined): ModuleKey[] {
  if (!profile) return [];
  if (profile.role === 'admin') return MODULES.map((m) => m.key);
  return profile.permissions ?? DEFAULT_PERMISSIONS;
}

export function canAccess(profile: Pick<Profile, 'role' | 'permissions'> | null | undefined, module: ModuleKey): boolean {
  return modulesOf(profile).includes(module);
}
