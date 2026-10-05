import { useState } from 'react';
import { useData } from '../../context/DataContext';
import type { FeePreset } from '../../lib/finance';
import { finalizeRows, newPlanDraft, planSummary, validatePlan, type PlanDraft } from '../../lib/paymentPlan';
import type { Lead, LeadPaymentPlan } from '../../lib/types';
import { formatMoney, nowIso, today } from '../../lib/utils';
import { Button, Checkbox, Field, Modal, Select } from '../ui';
import { MoneyInput } from '../finance/MoneyInput';
import { PaymentPlanEditor } from '../finance/PaymentPlanEditor';

/**
 * Fechamento da oportunidade: valor fechado e forma de pagamento combinada (parcelas e datas).
 * Ao salvar, as parcelas vão para contas a receber do Financeiro.
 * `mode="won"`: aberto ao marcar como ganho (permite seguir sem forma de pagamento).
 */
export function WonDealModal({
  lead,
  mode,
  onSubmit,
  onClose,
}: {
  lead: Lead;
  mode: 'won' | 'edit';
  /** plan = null: marcar como ganho sem forma de pagamento. */
  onSubmit: (plan: LeadPaymentPlan | null, launch: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const { db, can } = useData();
  const existingPlan = lead.payment_plan ?? null;
  const [total, setTotal] = useState<number | null>(existingPlan?.total ?? lead.proposal_value ?? null);
  const [draft, setDraft] = useState<PlanDraft>(() =>
    existingPlan?.rows?.length
      ? { preset: (existingPlan.preset as FeePreset) || '30-40-30', months: existingPlan.rows.length, first: existingPlan.rows[0].due_date, rows: existingPlan.rows }
      : newPlanDraft(today()),
  );
  const finance = can('financeiro');
  const accounts = db.finance_accounts.filter((a) => a.active);
  const [account, setAccount] = useState(existingPlan?.account_id ?? accounts[0]?.id ?? '');
  // Parcelas desta oportunidade já lançadas (visível só para quem tem o Financeiro)
  const launched = db.finance_entries.filter((e) => e.lead_id === lead.id);
  const received = launched.filter((e) => e.paid_at).length;
  // Já lançadas e nada recebido: salvar atualiza as parcelas no Financeiro
  const [launch, setLaunch] = useState(received === 0);
  const [busy, setBusy] = useState<'plan' | 'skip' | null>(null);
  const [error, setError] = useState('');

  const submit = async (withPlan: boolean) => {
    if (withPlan) {
      const problem = validatePlan(total, draft.rows);
      if (problem) return setError(problem);
    }
    setError('');
    setBusy(withPlan ? 'plan' : 'skip');
    try {
      await onSubmit(
        withPlan
          ? {
              total: total!,
              rows: finalizeRows(total!, draft.rows),
              account_id: account || null,
              preset: draft.preset,
              defined_at: nowIso(),
            }
          : null,
        withPlan && launch && received === 0,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      title={mode === 'won' ? 'Oportunidade ganha' : 'Forma de pagamento'}
      subtitle={`${lead.name} · combine o valor e as parcelas; elas vão para o Financeiro`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          {mode === 'won' && (
            <Button variant="ghost" className="mr-auto" loading={busy === 'skip'} onClick={() => submit(false)}>
              Marcar como ganho sem forma de pagamento
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy === 'plan'} onClick={() => submit(true)}>
            {mode === 'won' ? 'Salvar e marcar como ganho' : 'Salvar forma de pagamento'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Valor fechado"
          required
          hint={lead.proposal_value && lead.proposal_value !== total ? `Proposta: ${formatMoney(lead.proposal_value)}` : 'Atualiza o valor da proposta da oportunidade.'}
        >
          <MoneyInput value={total} onChange={setTotal} aria-label="Valor fechado" autoFocus />
        </Field>
        {finance && accounts.length > 0 && (
          <Field label="Conta que recebe">
            <Select value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Conta que recebe">
              <option value="">Sem conta definida</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <div className="mt-4">
        <PaymentPlanEditor total={total} value={draft} onChange={setDraft} />
      </div>

      <div className="mt-5 rounded-[12px] bg-canvas px-4 py-3">
        {received > 0 ? (
          <p className="text-[13px] text-muted">
            {received} de {launched.length} parcelas desta oportunidade já foram recebidas, então as parcelas no Financeiro não são alteradas por
            aqui: ajuste as demais por lá. A forma de pagamento abaixo é salva normalmente.
          </p>
        ) : (
          <>
            <Checkbox
              checked={launch}
              onChange={setLaunch}
              label={
                launched.length > 0
                  ? `Atualizar as ${launched.length} parcelas no Financeiro com estes valores e datas`
                  : existingPlan
                    ? 'Lançar ou atualizar as parcelas em contas a receber no Financeiro'
                    : 'Lançar as parcelas em contas a receber no Financeiro'
              }
            />
            <p className="mt-1 pl-6 text-[12.5px] text-faint">
              Entram na categoria de honorários, com as datas acima, e ficam ligadas ao cliente e ao projeto. Ao editar depois, as parcelas
              lançadas são substituídas pelas novas, desde que nenhuma tenha sido recebida.
            </p>
          </>
        )}
      </div>
      {error && <p className="mt-3 text-[13px] text-danger-fg">{error}</p>}
      {existingPlan && <p className="mt-3 text-[12.5px] text-faint">Combinado anteriormente: {formatMoney(existingPlan.total)} · {planSummary(existingPlan.rows)}.</p>}
    </Modal>
  );
}
