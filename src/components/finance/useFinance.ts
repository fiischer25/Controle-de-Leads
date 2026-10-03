import { useCallback, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { accountBalances, buildSeries, entryStatus, type EntryDraft, type EntryStatus, type RepeatMode } from '../../lib/finance';
import type { Tone } from '../../lib/status';
import type { FinanceAccount, FinanceAccountKind, FinanceCategory, FinanceEntry } from '../../lib/types';
import { byPosition, nowIso, today, uid } from '../../lib/utils';

export const ACCOUNT_KIND_LABEL: Record<FinanceAccountKind, string> = {
  banco: 'Conta bancária',
  caixa: 'Caixa',
  cartao: 'Cartão de crédito',
  investimento: 'Investimento',
  outro: 'Outra',
};

export const STATUS_STYLE: Record<EntryStatus, { label: string; tone: Tone }> = {
  pago: { label: 'Pago', tone: 'success' },
  pendente: { label: 'Pendente', tone: 'neutral' },
  vencido: { label: 'Vencido', tone: 'danger' },
};

/** Campos que "aplicar às próximas parcelas" copia para o restante da série. */
const SERIES_FIELDS = ['description', 'amount', 'category_id', 'account_id', 'to_account_id', 'client_id', 'project_id', 'document', 'notes'] as const;

/** Dados e ações do Financeiro, em cima da camada de dados genérica. */
export function useFinance() {
  const { db, me, insertRows, patch, removeRows } = useData();
  const t = today();

  const accounts = useMemo(
    () => [...db.finance_accounts].sort((a, b) => Number(b.active) - Number(a.active) || byPosition(a, b)),
    [db.finance_accounts],
  );
  const categories = useMemo(() => [...db.finance_categories].sort(byPosition), [db.finance_categories]);
  const accountMap = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts]);
  const categoryMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);
  const balances = useMemo(() => accountBalances(accounts, db.finance_entries), [accounts, db.finance_entries]);
  const totalBalance = useMemo(
    () => Math.round(accounts.filter((a) => a.active).reduce((acc, a) => acc + (balances[a.id] ?? 0) * 100, 0)) / 100,
    [accounts, balances],
  );
  const status = useCallback((e: FinanceEntry) => entryStatus(e, t), [t]);

  const createEntries = useCallback(
    async (draft: Omit<EntryDraft, 'created_by'>, mode: RepeatMode, count: number) => {
      const rows = buildSeries({ ...draft, created_by: me.id }, mode, count, nowIso());
      await insertRows('finance_entries', rows);
      return rows;
    },
    [insertRows, me.id],
  );

  /** Próximas parcelas da mesma série (inclui a atual), ainda não pagas. */
  const nextInSeries = useCallback(
    (e: FinanceEntry) =>
      e.series_id ? db.finance_entries.filter((x) => x.series_id === e.series_id && (x.installment ?? 0) >= (e.installment ?? 0) && (!x.paid_at || x.id === e.id)) : [e],
    [db.finance_entries],
  );

  const updateEntry = useCallback(
    async (entry: FinanceEntry, changes: Partial<FinanceEntry>, applyToNext = false) => {
      const now = nowIso();
      await patch('finance_entries', entry.id, { ...changes, updated_at: now });
      if (!applyToNext) return;
      const shared: Partial<FinanceEntry> = {};
      for (const k of SERIES_FIELDS) if (k in changes) (shared as Record<string, unknown>)[k] = changes[k];
      if (!Object.keys(shared).length) return;
      for (const x of nextInSeries(entry)) if (x.id !== entry.id) await patch('finance_entries', x.id, { ...shared, updated_at: now });
    },
    [patch, nextInSeries],
  );

  const deleteEntry = useCallback(
    async (entry: FinanceEntry, withNext = false) => {
      const ids = withNext ? nextInSeries(entry).map((x) => x.id) : [entry.id];
      await removeRows('finance_entries', ids);
    },
    [removeRows, nextInSeries],
  );

  const setPaid = useCallback(
    async (entry: FinanceEntry, paidAt: string | null, accountId?: string | null) => {
      const changes: Partial<FinanceEntry> = { paid_at: paidAt, updated_at: nowIso() };
      if (accountId !== undefined) changes.account_id = accountId;
      await patch('finance_entries', entry.id, changes);
    },
    [patch],
  );

  const saveAccount = useCallback(
    async (input: Partial<FinanceAccount> & Pick<FinanceAccount, 'name' | 'kind' | 'opening_balance'>) => {
      if (input.id) return patch('finance_accounts', input.id, input);
      const position = accounts.length ? Math.max(...accounts.map((a) => a.position)) + 1 : 0;
      await insertRows('finance_accounts', [{ id: uid(), color: '#57534e', active: true, position, created_at: nowIso(), ...input } as FinanceAccount]);
    },
    [patch, insertRows, accounts],
  );

  const saveCategory = useCallback(
    async (input: Partial<FinanceCategory> & Pick<FinanceCategory, 'name' | 'kind'>) => {
      if (input.id) return patch('finance_categories', input.id, input);
      const same = categories.filter((c) => c.kind === input.kind);
      const position = same.length ? Math.max(...same.map((c) => c.position)) + 1 : 0;
      await insertRows('finance_categories', [
        { id: uid(), color: input.kind === 'receita' ? '#5b8f6f' : '#9c8f83', active: true, position, created_at: nowIso(), ...input } as FinanceCategory,
      ]);
    },
    [patch, insertRows, categories],
  );

  const setMemberCost = useCallback(
    async (userId: string, hourlyCost: number) => {
      const current = db.finance_member_costs.find((c) => c.user_id === userId);
      if (current) await patch('finance_member_costs', current.id, { hourly_cost: hourlyCost, updated_at: nowIso() });
      else await insertRows('finance_member_costs', [{ id: uid(), user_id: userId, hourly_cost: hourlyCost, updated_at: nowIso() }]);
    },
    [db.finance_member_costs, patch, insertRows],
  );

  return {
    entries: db.finance_entries,
    accounts,
    categories,
    accountMap,
    categoryMap,
    balances,
    totalBalance,
    status,
    createEntries,
    insertEntries: (rows: FinanceEntry[]) => insertRows('finance_entries', rows),
    updateEntry,
    deleteEntry,
    nextInSeries,
    setPaid,
    saveAccount,
    deleteAccount: (id: string) => removeRows('finance_accounts', [id]),
    saveCategory,
    deleteCategory: (id: string) => removeRows('finance_categories', [id]),
    setMemberCost,
  };
}
