/** Formulários globais de criação abertos pelo layout (Início, menu "+" do celular). */
export type CreateKind = 'task' | 'lead' | 'event' | 'time';

export function openCreate(kind: CreateKind) {
  window.dispatchEvent(new CustomEvent<CreateKind>('airos:create', { detail: kind }));
}
