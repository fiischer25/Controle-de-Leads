import { useState } from 'react';
import { useData, type ClientInput } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { applyContractToClient, contractDeal, type ReadContract } from '../../lib/contract';
import type { Client, LeadPaymentPlan } from '../../lib/types';
import { today } from '../../lib/utils';
import { PastPaidOption } from '../finance/PastPaidOption';
import { ContractDealOption } from '../leads/ContractDealOption';
import { ContractReader } from '../leads/ContractReader';
import { Button, Modal } from '../ui';
import { ClientFields, emptyClient, validateClient, type ClientErrors } from './ClientFields';

/**
 * Novo cliente ou edição rápida. No cadastro, "Preencher com o contrato" lê o PDF e preenche os
 * dados. Aberto pelo Novo projeto (`forProject`), devolve o contrato lido para o projeto usar
 * (área, endereço da obra, parcelas e o PDF); sozinho, oferece salvar a forma de pagamento.
 */
export function ClientFormModal({
  client,
  initial,
  initialContract,
  forProject = false,
  onClose,
  onSaved,
}: {
  client?: Client;
  /** Dados já preenchidos (ex.: lidos do contrato no Novo projeto). */
  initial?: ClientInput;
  initialContract?: ReadContract | null;
  forProject?: boolean;
  onClose: () => void;
  onSaved?: (client: Client, contract: ReadContract | null) => void;
}) {
  const { db, can, createClient, updateClient, ensureClientLead, closeDeal } = useData();
  const toast = useToast();
  const [value, setValue] = useState<ClientInput>(() => {
    if (!client) return initial ?? emptyClient();
    const { id: _id, lead_id: _l, created_by: _c, created_at: _ca, updated_at: _u, ...rest } = client;
    void _id; void _l; void _c; void _ca; void _u;
    return rest;
  });
  const [errors, setErrors] = useState<ClientErrors>({});
  const [busy, setBusy] = useState(false);
  const [contract, setContract] = useState<ReadContract | null>(initialContract ?? null);
  // Sozinho (fora do Novo projeto): as parcelas do contrato podem ir para o Financeiro
  const [deal, setDeal] = useState<LeadPaymentPlan | null>(null);
  const [saveDeal, setSaveDeal] = useState(true);
  const [pastPaid, setPastPaid] = useState(true);

  const readContract = (extraction: ReadContract['extraction'], fileName: string, file?: File) => {
    setContract({ extraction, fileName, file });
    setValue((v) => applyContractToClient(extraction, v));
    setErrors({});
    if (!forProject && can('comercial')) setDeal(contractDeal(extraction, db.finance_accounts.find((a) => a.active)?.id ?? null));
  };

  const save = async () => {
    const errs = validateClient(value);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      if (client) {
        await updateClient(client.id, value);
        toast.success('Cliente atualizado.');
        onSaved?.({ ...client, ...value }, null);
      } else {
        const saved = await createClient(value);
        let launched = 0;
        if (deal && saveDeal) {
          try {
            const lead = await ensureClientLead(saved.id);
            launched = await closeDeal(lead.id, deal, true, true, pastPaid ? today() : undefined);
          } catch (e) {
            toast.error(`O cliente foi cadastrado, mas as parcelas não foram lançadas: ${e instanceof Error ? e.message : e}`);
          }
        }
        toast.success(
          launched > 0 ? `Cliente cadastrado e ${launched} ${launched === 1 ? 'parcela lançada' : 'parcelas lançadas'} no Financeiro.` : 'Cliente cadastrado.',
        );
        onSaved?.(saved, contract);
      }
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={client ? 'Editar cliente' : 'Novo cliente'}
      subtitle={!client && initialContract ? 'Dados lidos do contrato. Confira antes de salvar.' : undefined}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Salvar cliente
          </Button>
        </>
      }
    >
      {!client && (
        <div className="mb-6">
          <ContractReader
            initial={initialContract}
            description={
              forProject
                ? 'Envie o contrato assinado (PDF) e o sistema preenche os dados do cliente e do projeto.'
                : 'Envie o contrato assinado (PDF) e o sistema preenche os dados do cliente, o valor e as parcelas.'
            }
            onRead={readContract}
          />
          {deal && <ContractDealOption deal={deal} checked={saveDeal} onChange={setSaveDeal} />}
          {deal && saveDeal && <PastPaidOption rows={deal.rows} checked={pastPaid} onChange={setPastPaid} />}
        </div>
      )}
      <ClientFields value={value} onChange={setValue} errors={errors} />
    </Modal>
  );
}
