import { useMemo, useState } from 'react';
import { FileUp } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import {
  csvTransactions,
  decodeStatement,
  guessMapping,
  isOfx,
  MATCH_WINDOW_DAYS,
  parseCsv,
  parseOfx,
  reconcile,
  type CsvMapping,
  type CsvTable,
  type StatementTxn,
} from '../../lib/statement';
import type { FinanceEntry } from '../../lib/types';
import { cn, formatDateShort, formatMoney, nowIso, uid } from '../../lib/utils';
import { Badge, Button, Checkbox, Field, Modal, Select } from '../ui';
import { useFinance } from './useFinance';

interface Decision {
  include: boolean;
  /** Usar a correspondência encontrada (dar baixa) em vez de lançar como novo. */
  useMatch: boolean;
  categoryId: string | null;
}

/**
 * Importar extrato (OFX ou CSV): lê as transações, dá baixa nos lançamentos em aberto que
 * correspondem (mesmo valor, vencimento até 10 dias de diferença) e lança o restante.
 * Transações já importadas nesta conta são ignoradas.
 */
export function ImportStatementModal({ defaultAccount, onClose }: { defaultAccount?: string; onClose: () => void }) {
  const { me } = useData();
  const fin = useFinance();
  const toast = useToast();
  const accounts = fin.accounts.filter((a) => a.active);
  const [account, setAccount] = useState(defaultAccount ?? accounts[0]?.id ?? '');
  const [fileName, setFileName] = useState('');
  const [ofx, setOfx] = useState<StatementTxn[] | null>(null);
  const [csv, setCsv] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [step, setStep] = useState<'file' | 'review'>('file');
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const txns = useMemo(() => (ofx ? ofx : csv && mapping ? csvTransactions(csv, mapping) : []), [ofx, csv, mapping]);
  const rows = useMemo(() => (step === 'review' ? reconcile(txns, fin.entries, account) : []), [step, txns, fin.entries, account]);

  const readFile = async (file: File) => {
    setError('');
    setFileName(file.name);
    setOfx(null);
    setCsv(null);
    setMapping(null);
    try {
      const text = decodeStatement(await file.arrayBuffer());
      if (isOfx(text)) {
        const list = parseOfx(text);
        if (!list.length) throw new Error('Nenhuma transação encontrada no arquivo OFX.');
        setOfx(list);
      } else {
        const table = parseCsv(text);
        if (!table.rows.length) throw new Error('Não encontrei linhas com data e valor. Confira se é o extrato em CSV ou OFX.');
        setCsv(table);
        setMapping(guessMapping(table));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.');
    }
  };

  const review = () => {
    if (!account) return setError('Escolha a conta do extrato.');
    if (!txns.length) return setError('Nenhuma transação válida com essas colunas.');
    const initial: Record<string, Decision> = {};
    for (const r of reconcile(txns, fin.entries, account)) {
      initial[r.txn.ref] = { include: !r.duplicate, useMatch: !!r.match, categoryId: r.categoryId };
    }
    setDecisions(initial);
    setError('');
    setStep('review');
  };

  const set = (ref: string, patch: Partial<Decision>) => setDecisions((d) => ({ ...d, [ref]: { ...d[ref], ...patch } }));
  const chosen = rows.filter((r) => !r.duplicate && decisions[r.txn.ref]?.include);
  const toSettle = chosen.filter((r) => r.match && decisions[r.txn.ref].useMatch);
  const toCreate = chosen.filter((r) => !(r.match && decisions[r.txn.ref].useMatch));
  const duplicates = rows.filter((r) => r.duplicate).length;

  const apply = async () => {
    setBusy(true);
    try {
      for (const r of toSettle) {
        await fin.updateEntry(r.match!, { paid_at: r.txn.date, account_id: account, bank_ref: r.txn.ref });
      }
      const now = nowIso();
      const created: FinanceEntry[] = toCreate.map((r) => ({
        id: uid(),
        kind: r.txn.amount > 0 ? 'receita' : 'despesa',
        description: r.txn.description,
        amount: Math.abs(r.txn.amount),
        due_date: r.txn.date,
        paid_at: r.txn.date,
        account_id: account,
        to_account_id: null,
        category_id: decisions[r.txn.ref].categoryId,
        client_id: null,
        project_id: null,
        series_id: null,
        installment: null,
        installments: null,
        document: null,
        notes: `Importado do extrato (${fileName})`,
        bank_ref: r.txn.ref,
        created_by: me.id,
        created_at: now,
        updated_at: now,
      }));
      if (created.length) await fin.insertEntries(created);
      toast.success(
        [toSettle.length && `${toSettle.length} ${toSettle.length === 1 ? 'baixa' : 'baixas'}`, created.length && `${created.length} ${created.length === 1 ? 'lançamento novo' : 'lançamentos novos'}`]
          .filter(Boolean)
          .join(' e ') + '.',
      );
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const colOptions = (csv?.headers ?? []).map((h, i) => (
    <option key={i} value={String(i)}>
      {h}
    </option>
  ));

  return (
    <Modal
      title="Importar extrato"
      subtitle={step === 'review' ? `${fileName} · ${fin.accountMap[account]?.name ?? ''}` : 'Arquivo OFX ou CSV exportado do internet banking'}
      onClose={onClose}
      size="xl"
      footer={
        step === 'file' ? (
          <>
            <Button onClick={onClose}>Cancelar</Button>
            <Button variant="primary" onClick={review} disabled={!txns.length}>
              Revisar {txns.length ? `${txns.length} transações` : ''}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" className="mr-auto" onClick={() => setStep('file')}>
              Voltar
            </Button>
            <Button onClick={onClose}>Cancelar</Button>
            <Button variant="primary" loading={busy} onClick={apply} disabled={chosen.length === 0}>
              Importar {chosen.length}
            </Button>
          </>
        )
      }
    >
      {step === 'file' ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Conta do extrato" required>
              <Select value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Conta do extrato">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Arquivo" required>
              <label className="flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-dashed border-line-strong px-3 text-[13.5px] text-muted transition-colors hover:border-ink hover:text-ink">
                <FileUp className="h-4 w-4 shrink-0" />
                <span className="truncate">{fileName || 'Escolher arquivo .ofx ou .csv'}</span>
                <input
                  type="file"
                  accept=".ofx,.qfx,.csv,.txt"
                  className="sr-only"
                  aria-label="Arquivo do extrato"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) readFile(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </Field>
          </div>

          {csv && mapping && (
            <div className="space-y-4 rounded-[12px] bg-canvas p-4">
              <p className="text-[13px] text-muted">Confira quais colunas do CSV são a data, a descrição e o valor:</p>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Data">
                  <Select value={String(mapping.date)} onChange={(e) => setMapping({ ...mapping, date: Number(e.target.value) })} aria-label="Coluna da data">
                    {colOptions}
                  </Select>
                </Field>
                <Field label="Descrição">
                  <Select value={String(mapping.description)} onChange={(e) => setMapping({ ...mapping, description: Number(e.target.value) })} aria-label="Coluna da descrição">
                    {colOptions}
                  </Select>
                </Field>
                {mapping.amount != null ? (
                  <Field label="Valor">
                    <Select value={String(mapping.amount)} onChange={(e) => setMapping({ ...mapping, amount: Number(e.target.value) })} aria-label="Coluna do valor">
                      {colOptions}
                    </Select>
                  </Field>
                ) : (
                  <>
                    <Field label="Crédito (entradas)">
                      <Select value={String(mapping.credit)} onChange={(e) => setMapping({ ...mapping, credit: Number(e.target.value) })} aria-label="Coluna de crédito">
                        {colOptions}
                      </Select>
                    </Field>
                    <Field label="Débito (saídas)">
                      <Select value={String(mapping.debit)} onChange={(e) => setMapping({ ...mapping, debit: Number(e.target.value) })} aria-label="Coluna de débito">
                        {colOptions}
                      </Select>
                    </Field>
                  </>
                )}
              </div>
              <Checkbox
                checked={mapping.invert}
                onChange={(on) => setMapping({ ...mapping, invert: on })}
                label="Valores positivos são saídas (fatura de cartão de crédito)"
              />
            </div>
          )}

          {txns.length > 0 && (
            <div>
              <div className="mb-2 text-[12.5px] text-faint">
                Prévia · {txns.length} transações · {formatDateShort(txns.map((t) => t.date).sort()[0])} a {formatDateShort(txns.map((t) => t.date).sort().pop())}
              </div>
              <ul className="max-h-56 overflow-y-auto rounded-[10px] border border-hairline">
                {txns.slice(0, 8).map((t) => (
                  <li key={t.ref} className="grid grid-cols-[56px_minmax(0,1fr)_120px] gap-3 border-b border-hairline px-3 py-2 text-[13px] last:border-0">
                    <span className="tabular text-muted">{formatDateShort(t.date)}</span>
                    <span className="truncate text-ink">{t.description}</span>
                    <span className={cn('text-right tabular', t.amount > 0 ? 'text-success-fg' : 'text-ink')}>{formatMoney(t.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {error && <p className="text-[13px] text-danger-fg">{error}</p>}
          <p className="text-[12.5px] text-faint">
            No internet banking, procure “Exportar extrato” em OFX (Money/Quicken) ou CSV. Nada é gravado antes da revisão. Transações já importadas
            nesta conta são ignoradas automaticamente.
          </p>
        </div>
      ) : (
        <div>
          <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted">
            <span>
              <b className="font-medium text-ink">{toSettle.length}</b> {toSettle.length === 1 ? 'baixa' : 'baixas'} em lançamentos existentes
            </span>
            <span>
              <b className="font-medium text-ink">{toCreate.length}</b> {toCreate.length === 1 ? 'lançamento novo' : 'lançamentos novos'}
            </span>
            {duplicates > 0 && <span className="text-faint">{duplicates} já importadas</span>}
          </div>
          <ul className="max-h-[52vh] overflow-y-auto border-t border-hairline">
            {rows.map((r) => {
              const d = decisions[r.txn.ref];
              const kind = r.txn.amount > 0 ? 'receita' : 'despesa';
              const settling = !!r.match && d?.useMatch;
              return (
                <li key={r.txn.ref} className={cn('grid grid-cols-[24px_52px_minmax(0,1fr)_118px] items-start gap-3 border-b border-hairline py-3', (r.duplicate || !d?.include) && 'opacity-50')}>
                  <span className="pt-0.5">
                    <Checkbox checked={!r.duplicate && !!d?.include} disabled={r.duplicate} onChange={(on) => set(r.txn.ref, { include: on })} />
                  </span>
                  <span className="pt-0.5 text-[12.5px] tabular text-muted">{formatDateShort(r.txn.date)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] text-ink">{r.txn.description}</span>
                    {r.duplicate ? (
                      <span className="text-[12.5px] text-faint">Já importada nesta conta</span>
                    ) : settling ? (
                      <span className="flex flex-wrap items-center gap-x-2 text-[12.5px]">
                        <Badge tone="success">Baixa</Badge>
                        <span className="min-w-0 truncate text-muted">
                          {r.match!.description} · venc. {formatDateShort(r.match!.due_date)}
                        </span>
                        <button type="button" className="text-faint underline-offset-2 hover:text-ink hover:underline" onClick={() => set(r.txn.ref, { useMatch: false })}>
                          lançar como novo
                        </button>
                      </span>
                    ) : (
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge tone="info">Novo</Badge>
                        <Select
                          value={d?.categoryId ?? ''}
                          onChange={(e) => set(r.txn.ref, { categoryId: e.target.value || null })}
                          className="h-8 w-56 text-[12.5px]"
                          aria-label={`Categoria de ${r.txn.description}`}
                        >
                          <option value="">Sem categoria</option>
                          {fin.categories
                            .filter((c) => c.kind === kind && c.active)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </Select>
                        {r.match && (
                          <button type="button" className="text-[12.5px] text-faint underline-offset-2 hover:text-ink hover:underline" onClick={() => set(r.txn.ref, { useMatch: true })}>
                            dar baixa em “{r.match.description}”
                          </button>
                        )}
                      </span>
                    )}
                  </span>
                  <span className={cn('pt-0.5 text-right text-[13.5px] tabular', r.txn.amount > 0 ? 'text-success-fg' : 'text-ink')}>{formatMoney(r.txn.amount)}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[12.5px] text-faint">
            “Baixa”: lançamento em aberto com o mesmo valor e vencimento até {MATCH_WINDOW_DAYS} dias da transação, marcado como pago na data do extrato.
            “Novo”: lançado já pago, com a categoria sugerida pelo histórico.
          </p>
        </div>
      )}
    </Modal>
  );
}
