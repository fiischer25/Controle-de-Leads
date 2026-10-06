import { useState } from 'react';
import { contractPlan, rememberContract } from '../../lib/contract';
import type { Lead, LeadPaymentPlan } from '../../lib/types';
import { today } from '../../lib/utils';
import { Button, Modal } from '../ui';
import { ContractFields } from './ContractFields';
import { ContractReader } from './ContractReader';
import { useContract } from './useContract';

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
  const c = useContract(lead);
  const [busy, setBusy] = useState<'plan' | 'skip' | null>(null);
  const [error, setError] = useState('');

  const submit = async (withPlan: boolean) => {
    let plan: LeadPaymentPlan | null = null;
    if (withPlan) {
      const built = c.build();
      if ('error' in built) return setError(built.error);
      plan = built.plan;
    }
    setError('');
    setBusy(withPlan ? 'plan' : 'skip');
    try {
      await onSubmit(plan, withPlan && c.launch);
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
      <ContractReader
        className="mb-5"
        description={
          lead.client_id
            ? 'Envie o contrato assinado (PDF ou Word) e o sistema preenche o valor e as parcelas.'
            : 'Envie o contrato assinado (PDF ou Word): o sistema preenche o valor e as parcelas aqui e os dados do cliente no cadastro a seguir.'
        }
        onRead={(x, fileName) => {
          const plan = contractPlan(x, today());
          if (plan) c.apply(plan.total, plan.draft);
          // Os dados do cliente e do projeto vão para o "Virar cliente", logo em seguida
          rememberContract(lead.id, x, fileName);
        }}
      />
      <ContractFields c={c} autoFocus />
      {error && <p className="mt-3 text-[13px] text-danger-fg">{error}</p>}
    </Modal>
  );
}
