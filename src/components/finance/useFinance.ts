import { useCallback, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { accountBalances, buildSeries, entryStatus, type EntryDraft, type EntryStatus, type RepeatMode } from '../../lib/finance';
import type { Tone } from '../../lib/status';
import { backend } from '../../lib/backend';
import type { FinanceAccount, FinanceAccountKind, FinanceAttachment, FinanceCategory, FinanceEntry } from '../../lib/types';
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

/** Bucket privado dos comprovantes (migração 20261007). */
export const DOCS_BUCKET = 'finance-docs';
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.heic,.xml,application/pdf,image/*,text/xml,application/xml';

function safeName(name: string) {
  const clean = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-80);
  return clean || 'arquivo';
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

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
      const targets = withNext ? nextInSeries(entry) : [entry];
      await removeRows('finance_entries', targets.map((x) => x.id));
      // Comprovantes vão junto (falha aqui não desfaz a exclusão)
      const paths = targets.flatMap((x) => (x.attachments ?? []).map((a) => a.path));
      if (paths.length) await backend.removeFiles(DOCS_BUCKET, paths).catch(() => undefined);
    },
    [removeRows, nextInSeries],
  );

  /** Envia arquivos e os anexa ao lançamento. */
  const attachFiles = useCallback(
    async (entry: FinanceEntry, files: File[]) => {
      const tooBig = files.find((f) => f.size > MAX_ATTACHMENT_BYTES);
      if (tooBig) throw new Error(`"${tooBig.name}" tem mais de 10 MB.`);
      const added: FinanceAttachment[] = [];
      for (const f of files) {
        const path = `${entry.id}/${uid()}-${safeName(f.name)}`;
        await backend.uploadFile(DOCS_BUCKET, path, f);
        added.push({ id: uid(), name: f.name, path, size: f.size, type: f.type, uploaded_at: nowIso() });
      }
      const current = db.finance_entries.find((x) => x.id === entry.id)?.attachments ?? entry.attachments ?? [];
      await patch('finance_entries', entry.id, { attachments: [...current, ...added], updated_at: nowIso() });
      return added;
    },
    [db.finance_entries, patch],
  );

  const removeAttachment = useCallback(
    async (entry: FinanceEntry, att: FinanceAttachment) => {
      const current = db.finance_entries.find((x) => x.id === entry.id)?.attachments ?? entry.attachments ?? [];
      await patch('finance_entries', entry.id, { attachments: current.filter((a) => a.id !== att.id), updated_at: nowIso() });
      await backend.removeFiles(DOCS_BUCKET, [att.path]).catch(() => undefined);
    },
    [db.finance_entries, patch],
  );

  /** Abre o comprovante em nova aba (link temporário). */
  const openAttachment = useCallback(async (att: FinanceAttachment) => {
    // A aba abre já no clique para o navegador não bloquear como pop-up
    const tab = window.open('', '_blank');
    try {
      const url = await backend.fileUrl(DOCS_BUCKET, att.path);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (e) {
      tab?.close();
      throw e;
    }
  }, []);

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
    attachFiles,
    removeAttachment,
    openAttachment,
    nextInSeries,
    setPaid,
    saveAccount,
    deleteAccount: (id: string) => removeRows('finance_accounts', [id]),
    saveCategory,
    deleteCategory: (id: string) => removeRows('finance_categories', [id]),
    setMemberCost,
  };
}
