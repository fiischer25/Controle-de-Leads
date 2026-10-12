import { useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { presetCategoryPlan } from '../../lib/categoryPresets';
import { FINANCE_CATEGORY_PRESETS } from '../../lib/defaults';
import type { FinanceCategory } from '../../lib/types';
import { nowIso, uid } from '../../lib/utils';

/** Versão da lista de categorias sugeridas já aplicada neste navegador (não recria as excluídas). */
const KEY = 'airos:finance-presets';
const VERSION = '1';
let running = false;

const applied = () => {
  try {
    return localStorage.getItem(KEY) === VERSION;
  } catch {
    return false;
  }
};

/**
 * Cadastra sozinho as categorias sugeridas do Financeiro que faltam (projeto, acompanhamento,
 * consultoria, salários, aluguel…), para já aparecerem ao lançar uma receita ou despesa.
 */
export function useFinanceCategoryPresets() {
  const { db, loading, can, insertRows, patch } = useData();
  const allowed = can('financeiro');
  useEffect(() => {
    if (loading || !allowed || running || applied()) return;
    const plan = presetCategoryPlan(db.finance_categories, FINANCE_CATEGORY_PRESETS);
    const done = () => {
      try {
        localStorage.setItem(KEY, VERSION);
      } catch {
        /* sem armazenamento: tenta de novo na próxima vez, sem repetir as que já existem */
      }
    };
    if (!plan.insert.length) return done();
    running = true;
    (async () => {
      const now = nowIso();
      await insertRows(
        'finance_categories',
        plan.insert.map((c): FinanceCategory => ({ id: uid(), active: true, created_at: now, ...c })),
      );
      for (const r of plan.reorder) await patch('finance_categories', r.id, { position: r.position });
      done();
    })()
      .catch(() => {
        /* sem acesso ou tabela ausente: a aba Categorias continua oferecendo as sugestões */
      })
      .finally(() => {
        running = false;
      });
  }, [loading, allowed, db.finance_categories, insertRows, patch]);
}
