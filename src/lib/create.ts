/** Formulários globais de criação abertos pelo layout (Painel, menu "+" do celular). */
export type CreateKind = 'task' | 'lead' | 'event' | 'time' | 'project';

export function openCreate(kind: CreateKind) {
  window.dispatchEvent(new CustomEvent<CreateKind>('airos:create', { detail: kind }));
}
