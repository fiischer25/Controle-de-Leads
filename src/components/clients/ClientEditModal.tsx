import { useState } from 'react';
import { useData, type ClientInput } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { applyContractToClient, contractPlan } from '../../lib/contract';
import type { Client } from '../../lib/types';
import { byPosition, today } from '../../lib/utils';
import { Button, Field, Input, Modal, Select, Tabs, UserSelect } from '../ui';
import { ContractFields } from '../leads/ContractFields';
import { ContractReader } from '../leads/ContractReader';
import { useContract } from '../leads/useContract';
import { ClientFields, validateClient, type ClientErrors } from './ClientFields';

export type ClientEditTab = 'dados' | 'contrato' | 'origem';

/**
 * Edição completa do cliente: dados cadastrais, contrato (valor fechado e forma de pagamento,
 * com as parcelas no Financeiro) e origem comercial. O contrato fica na oportunidade do cliente;
 * se ele foi cadastrado direto, uma oportunidade já ganha é criada para guardar o contrato.
 */
export function ClientEditModal({ client, initialTab = 'dados', onClose }: { client: Client; initialTab?: ClientEditTab; onClose: () => void }) {
  const { db, maps, can, updateClient, updateLead, ensureClientLead, closeDeal } = useData();
  const toast = useToast();
  const lead = (client.lead_id ? maps.leads[client.lead_id] : null) ?? db.leads.find((l) => l.client_id === client.id) ?? null;
  const commercial = can('comercial');
  const [tab, setTab] = useState<ClientEditTab>(commercial ? initialTab : 'dados');
  const [value, setValue] = useState<ClientInput>(() => {
    const { id: _id, lead_id: _l, created_by: _c, created_at: _ca, updated_at: _u, ...rest } = client;
    void _id; void _l; void _c; void _ca; void _u;
    return rest;
  });
  const [errors, setErrors] = useState<ClientErrors>({});
  const contract = useContract(lead);
  const [origin, setOrigin] = useState({
    source_id: lead?.source_id ?? '',
    referred_by: lead?.referred_by ?? '',
    owner_id: lead?.owner_id ?? null,
  });
  const originChanged =
    origin.source_id !== (lead?.source_id ?? '') || origin.referred_by !== (lead?.referred_by ?? '') || origin.owner_id !== (lead?.owner_id ?? null);
  const sources = [...db.lead_sources].filter((s) => s.active || s.id === lead?.source_id).sort(byPosition);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    const errs = validateClient(value);
    setErrors(errs);
    if (Object.keys(errs).length) {
      setTab('dados');
      return setError('Confira os dados do cliente.');
    }
    let plan = null;
    if (contract.touched) {
      const built = contract.build();
      if ('error' in built) {
        setTab('contrato');
        return setError(built.error);
      }
      plan = built.plan;
    }
    setError('');
    setBusy(true);
    try {
      await updateClient(client.id, value);
      let launched = 0;
      if (commercial && (plan || originChanged || lead)) {
        const l = lead ?? (await ensureClientLead(client.id));
        // A oportunidade acompanha os dados do cliente
        await updateLead(l.id, {
          name: value.name,
          phone: value.phone,
          email: value.email || null,
          city: value.city,
          state: value.state,
          source_id: origin.source_id || null,
          referred_by: origin.referred_by.trim() || null,
          owner_id: origin.owner_id,
        });
        if (plan) launched = await closeDeal(l.id, plan, contract.launch, true);
      }
      toast.success(
        launched > 0
          ? `Cliente salvo e ${launched} ${launched === 1 ? 'parcela atualizada' : 'parcelas atualizadas'} no Financeiro.`
          : plan
            ? 'Cliente e contrato salvos.'
            : 'Cliente atualizado.',
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Editar cliente"
      subtitle={client.name}
      onClose={onClose}
      size="xl"
      footer={
        <>
          {error && <span className="mr-auto text-[13px] text-danger-fg">{error}</span>}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Salvar
          </Button>
        </>
      }
    >
      {commercial && (
        <ContractReader
          className="mb-5"
          description="Envie o contrato (PDF, foto ou Word) e o sistema atualiza os dados do cliente, o valor e as parcelas. Nada é salvo antes de você conferir."
          onRead={(x) => {
            setValue((v) => applyContractToClient(x, v));
            setErrors({});
            const plan = contractPlan(x, today());
            if (plan) contract.apply(plan.total, plan.draft);
          }}
        />
      )}
      {commercial && (
        <Tabs<ClientEditTab>
          className="mb-6"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'dados', label: 'Dados do cliente' },
            { id: 'contrato', label: 'Contrato e pagamento' },
            { id: 'origem', label: 'Origem comercial' },
          ]}
        />
      )}
      {tab === 'dados' && <ClientFields value={value} onChange={setValue} errors={errors} />}
      {tab === 'contrato' && (
        <>
          {!lead && (
            <p className="mb-4 rounded-[12px] bg-canvas px-4 py-3 text-[13px] text-muted">
              Este cliente foi cadastrado sem oportunidade. Ao salvar o contrato, o sistema registra uma oportunidade já ganha para ele, e o
              valor entra nos relatórios e no Financeiro.
            </p>
          )}
          <ContractFields c={contract} />
        </>
      )}
      {tab === 'origem' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Como chegou ao escritório">
            <Select value={origin.source_id} onChange={(e) => setOrigin({ ...origin, source_id: e.target.value })} aria-label="Origem">
              <option value="">Não informado</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Indicado por">
            <Input value={origin.referred_by} onChange={(e) => setOrigin({ ...origin, referred_by: e.target.value })} placeholder="Nome de quem indicou" />
          </Field>
          <Field label="Responsável comercial" className="sm:col-span-2">
            <UserSelect users={db.profiles} value={origin.owner_id} onChange={(id) => setOrigin({ ...origin, owner_id: id })} placeholder="Sem responsável" />
          </Field>
        </div>
      )}
    </Modal>
  );
}
