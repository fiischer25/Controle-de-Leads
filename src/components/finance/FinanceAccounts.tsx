import { useState } from 'react';
import { Plus, Upload } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { SWATCHES } from '../../lib/constants';
import type { FinanceAccount, FinanceAccountKind } from '../../lib/types';
import { cn, formatMoney } from '../../lib/utils';
import { Badge, Button, ConfirmDialog, Field, Input, Modal, Select, Switch } from '../ui';
import { MoneyInput } from './MoneyInput';
import { ACCOUNT_KIND_LABEL, useFinance } from './useFinance';

/** Contas do escritório (banco, caixa, cartão…) com o saldo de cada uma. */
export function FinanceAccounts({ onImport }: { onImport: (accountId?: string) => void }) {
  const fin = useFinance();
  const { db } = useData();
  const [editing, setEditing] = useState<FinanceAccount | 'new' | null>(null);
  const used = (id: string) => db.finance_entries.filter((e) => e.account_id === id || e.to_account_id === id).length;

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="text-[13px] text-muted">
          Saldo = saldo inicial + recebimentos − pagamentos ± transferências. No cartão de crédito, o saldo negativo é a fatura em aberto.
        </p>
        <span className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" icon={<Upload className="h-4 w-4" strokeWidth={1.6} />} onClick={() => onImport()}>
            Importar extrato
          </Button>
          <Button variant="primary" icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => setEditing('new')}>
            Conta
          </Button>
        </span>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {fin.accounts.map((a) => {
          const balance = fin.balances[a.id] ?? 0;
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setEditing(a)}
                className={cn('w-full rounded-[16px] bg-surface p-5 text-left shadow-surface transition-shadow hover:shadow-md', !a.active && 'opacity-60')}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: a.color }} aria-hidden />
                    <span className="truncate text-[14px] font-medium text-ink">{a.name}</span>
                  </span>
                  {!a.active && <Badge>Arquivada</Badge>}
                </div>
                <div className="mt-1 text-[12.5px] text-faint">{ACCOUNT_KIND_LABEL[a.kind]}</div>
                <div className={cn('mt-4 font-display text-[26px] leading-8 tracking-[-0.02em] tabular', balance < 0 ? 'text-danger-fg' : 'text-ink')}>
                  {formatMoney(balance)}
                </div>
                <div className="mt-1 text-[12px] text-faint">
                  saldo inicial {formatMoney(a.opening_balance)} · {used(a.id)} {used(a.id) === 1 ? 'lançamento' : 'lançamentos'}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {fin.accounts.length === 0 && <p className="py-6 text-[13px] text-faint">Nenhuma conta cadastrada.</p>}
      {editing && <AccountModal account={editing === 'new' ? undefined : editing} usedCount={editing === 'new' ? 0 : used(editing.id)} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AccountModal({ account, usedCount, onClose }: { account?: FinanceAccount; usedCount: number; onClose: () => void }) {
  const fin = useFinance();
  const toast = useToast();
  const [v, setV] = useState({
    name: account?.name ?? '',
    kind: account?.kind ?? ('banco' as FinanceAccountKind),
    opening_balance: account?.opening_balance ?? 0,
    color: account?.color ?? SWATCHES[fin.accounts.length % SWATCHES.length],
    active: account?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    if (!v.name.trim()) return setError('Dê um nome à conta.');
    setBusy(true);
    try {
      await fin.saveAccount({ ...(account ? { id: account.id } : {}), ...v, name: v.name.trim() });
      toast.success(account ? 'Conta atualizada.' : 'Conta criada.');
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={account ? 'Editar conta' : 'Nova conta'}
      onClose={onClose}
      footer={
        <>
          {account && usedCount === 0 && (
            <Button variant="ghost" className="mr-auto text-danger-fg" onClick={() => setDeleting(true)}>
              Excluir
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" required error={error} className="sm:col-span-2">
          <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Ex.: Itaú PJ, Caixa do escritório" autoFocus />
        </Field>
        <Field label="Tipo">
          <Select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as FinanceAccountKind })} aria-label="Tipo de conta">
            {(Object.keys(ACCOUNT_KIND_LABEL) as FinanceAccountKind[]).map((k) => (
              <option key={k} value={k}>
                {ACCOUNT_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Saldo inicial" hint="Saldo no dia em que começou a usar o sistema.">
          <MoneyInput value={v.opening_balance} onChange={(n) => setV({ ...v, opening_balance: n ?? 0 })} allowNegative aria-label="Saldo inicial" />
        </Field>
        <Field label="Cor" className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setV({ ...v, color: c })}
                aria-label={`Cor ${c}`}
                className={cn('h-6 w-6 rounded-full ring-offset-2 ring-offset-surface', v.color === c && 'ring-2 ring-ink')}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </Field>
        {account && (
          <Switch
            className="sm:col-span-2"
            checked={v.active}
            onChange={(on) => setV({ ...v, active: on })}
            label="Conta em uso (arquivadas somem dos formulários, mas o histórico continua)"
          />
        )}
        {account && usedCount > 0 && (
          <p className="text-[12.5px] text-faint sm:col-span-2">Contas com lançamentos não podem ser excluídas; arquive se não usar mais.</p>
        )}
      </div>
      {deleting && account && (
        <ConfirmDialog
          title="Excluir conta?"
          danger
          confirmLabel="Excluir"
          message={account.name}
          onConfirm={async () => {
            try {
              await fin.deleteAccount(account.id);
              toast.success('Conta excluída.');
              onClose();
            } catch (e) {
              toast.error(e);
            }
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </Modal>
  );
}
