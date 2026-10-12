// Categorias sugeridas do Financeiro (projeto, acompanhamento, consultoria…): o que falta cadastrar
// e a ordem final de cada lista. Função pura (sem React nem banco).

import type { FinanceCategory } from './types';

export type CategoryPreset = [name: string, kind: FinanceCategory['kind'], color: string];

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const isOther = (name: string) => /^outr[ao]s\b/.test(norm(name));

/**
 * Categorias sugeridas que ainda não existem (pelo nome, sem acento nem maiúscula) e a nova
 * ordem: as sugeridas na ordem da lista, depois as criadas pelo escritório e "Outras…" no fim.
 * `reorder` traz só as que mudam de posição.
 */
export function presetCategoryPlan(
  categories: Array<Pick<FinanceCategory, 'id' | 'name' | 'kind' | 'position'>>,
  presets: CategoryPreset[],
): { insert: Array<{ name: string; kind: FinanceCategory['kind']; color: string; position: number }>; reorder: Array<{ id: string; position: number }> } {
  const insert: Array<{ name: string; kind: FinanceCategory['kind']; color: string; position: number }> = [];
  const reorder: Array<{ id: string; position: number }> = [];
  for (const kind of ['receita', 'despesa'] as const) {
    const current = categories.filter((c) => c.kind === kind).sort((a, b) => a.position - b.position);
    const byName = new Map(current.map((c) => [norm(c.name), c]));
    const kindPresets = presets.filter(([, k]) => k === kind);
    if (kindPresets.every(([name]) => byName.has(norm(name)))) continue;
    const presetNames = new Set(kindPresets.map(([name]) => norm(name)));
    type Slot = { existing?: (typeof current)[number]; preset?: CategoryPreset };
    const order: Slot[] = [
      ...kindPresets.filter(([name]) => !isOther(name)).map((p) => ({ existing: byName.get(norm(p[0])), preset: p })),
      ...current.filter((c) => !presetNames.has(norm(c.name)) && !isOther(c.name)).map((c) => ({ existing: c })),
      ...kindPresets.filter(([name]) => isOther(name)).map((p) => ({ existing: byName.get(norm(p[0])), preset: p })),
      ...current.filter((c) => !presetNames.has(norm(c.name)) && isOther(c.name)).map((c) => ({ existing: c })),
    ];
    order.forEach((slot, position) => {
      if (slot.existing) {
        if (slot.existing.position !== position) reorder.push({ id: slot.existing.id, position });
      } else if (slot.preset) {
        insert.push({ name: slot.preset[0], kind, color: slot.preset[2], position });
      }
    });
  }
  return { insert, reorder };
}
