import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, UserCheck, UserPlus } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import {
  applyContractToClient,
  applyContractToProject,
  contractPlan,
  findClientByContract,
  missingClientFields,
  sameClientName,
  type ContractExtraction,
  type ReadContract,
} from '../../lib/contract';
import { uploadTeamFile } from '../../lib/teamFiles';
import type { Client, LeadPaymentPlan } from '../../lib/types';
import { digitsOnly, suggestProjectName, today } from '../../lib/utils';
import { emptyClient } from '../clients/ClientFields';
import { ClientFormModal } from '../clients/ClientFormModal';
import { ContractReader } from '../leads/ContractReader';
import { FeesSection } from '../leads/FeesSection';
import { buildFees, useContract } from '../leads/useContract';
import { Button, Field, Modal, Select } from '../ui';
import { ProjectFields, validateProject, type ProjectDraft, type ProjectErrors } from './ProjectFields';

const FIELD_LABEL: Record<string, string> = {
  document: 'CPF/CNPJ',
  rg: 'RG',
  birth_date: 'nascimento',
  email: 'e-mail',
  phone: 'telefone',
  profession: 'profissão',
  cep: 'endereço',
  street: 'endereço',
  number: 'endereço',
  complement: 'endereço',
  neighborhood: 'endereço',
  city: 'endereço',
  state: 'endereço',
};

/**
 * Novo projeto. "Preencher com o contrato" lê o PDF: seleciona o cliente (mesmo CPF/CNPJ) ou abre o
 * Novo cliente já preenchido, preenche área, endereço da obra e escopo, preenche os honorários
 * (valor e parcelas, lançados no Financeiro ao criar) e guarda o PDF nos documentos do projeto.
 */
export function ProjectFormModal({ onClose, clientId: initialClient }: { onClose: () => void; clientId?: string }) {
  const { db, me, can, createProject, updateProject, updateClient, ensureClientLead, closeDeal } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const [clientId, setClientId] = useState(initialClient ?? '');
  const [clientError, setClientError] = useState<string | null>(null);
  // Novo cliente: aberto pelo botão ou já preenchido pelo contrato
  const [newClient, setNewClient] = useState<{ prefilled: boolean } | null>(null);
  const [draft, setDraft] = useState<ProjectDraft>(() => {
    const c = initialClient ? db.clients.find((x) => x.id === initialClient) : null;
    return {
      name: c ? suggestProjectName(c.name) : '',
      project_type_id: '',
      manager_id: null,
      member_ids: [],
      start_date: today(),
      due_date: null,
      area_m2: null,
      site_address: null,
      site_city: c?.city ?? null,
      description: null,
      default_assignee_id: null,
    };
  });
  const [errors, setErrors] = useState<ProjectErrors>({});
  const [busy, setBusy] = useState(false);
  const [contract, setContract] = useState<ReadContract | null>(null);
  // Honorários: valor e parcelas do contrato, lançados em contas a receber ao criar o projeto
  const canFees = can('comercial');
  const fees = useContract(null);
  const [feesOn, setFeesOn] = useState(false);
  const [feesError, setFeesError] = useState('');
  // Cliente do contrato: achado pelo CPF/CNPJ, pelo nome, o já escolhido (sem CPF) ou novo
  const [contractClient, setContractClient] = useState<'document' | 'name' | 'selected' | 'new' | 'missing' | null>(null);

  const pickClient = (id: string, saved?: Client) => {
    setClientId(id);
    setClientError(null);
    const c = saved ?? db.clients.find((x) => x.id === id);
    if (c) setDraft((d) => ({ ...d, name: d.name || suggestProjectName(c.name), site_city: d.site_city || c.city }));
  };

  /** Contrato lido aqui ou no Novo cliente: preenche o projeto e prepara as parcelas. */
  const applyContract = (read: ReadContract) => {
    setContract(read);
    setDraft((d) => applyContractToProject(read.extraction, d));
    const plan = contractPlan(read.extraction, today());
    if (plan && canFees) {
      fees.apply(plan.total, plan.draft);
      setFeesOn(true);
      setFeesError('');
    }
  };

  const readContract = (extraction: ContractExtraction, fileName: string, file?: File) => {
    applyContract({ extraction, fileName, file });
    const match = findClientByContract(db.clients, extraction);
    if (match) {
      pickClient(match.client.id);
      setContractClient(match.by);
      return;
    }
    // Cliente já escolhido, sem CPF/CNPJ e com o mesmo nome (ou contrato sem nome): é ele
    const current = db.clients.find((c) => c.id === clientId);
    if (current && !digitsOnly(current.document) && (!extraction.client.name.trim() || sameClientName(current.name, extraction.client.name))) {
      return setContractClient('selected');
    }
    // Contrato sem nome nem CPF do contratante (ex.: PDF escaneado ou fora do modelo): não abre cadastro vazio
    if (!extraction.client.name.trim() && !digitsOnly(extraction.client.document)) return setContractClient('missing');
    setClientId('');
    setContractClient('new');
    setNewClient({ prefilled: true });
  };

  const save = async () => {
    const errs = validateProject(draft);
    setErrors(errs);
    if (!clientId) setClientError('Selecione o cliente');
    let plan: LeadPaymentPlan | null = null;
    if (feesOn) {
      const built = buildFees(fees);
      setFeesError('error' in built ? built.error : '');
      if ('error' in built) return;
      plan = built.plan;
    }
    if (Object.keys(errs).length || !clientId) return;
    setBusy(true);
    try {
      // Honorários: ficam numa oportunidade ganha do cliente (contrato), ligada a este projeto
      const lead = plan ? await ensureClientLead(clientId, { newDeal: true, projectTypeId: draft.project_type_id }) : null;
      // O contrato completa o cadastro do cliente escolhido (só o que está vazio)
      if (Object.keys(completes).length) await updateClient(clientId, completes);
      const p = await createProject({ ...draft, client_id: clientId, lead_id: lead?.id ?? null });
      const problems: string[] = [];
      let launched = 0;
      if (lead && plan) {
        try {
          launched = await closeDeal(lead.id, plan, true, true, fees.pastPaid ? today() : undefined);
        } catch (e) {
          problems.push(`os honorários não foram lançados (${e instanceof Error ? e.message : e})`);
        }
      }
      if (contract?.file) {
        try {
          const att = await uploadTeamFile(`projetos/${p.id}`, contract.file, me.id);
          await updateProject(p.id, { attachments: [att] });
        } catch (e) {
          problems.push(`o PDF do contrato não foi guardado (${e instanceof Error ? e.message : e})`);
        }
      }
      if (problems.length) toast.error(`O projeto foi criado, mas ${problems.join(' e ')}.`);
      toast.success(
        `Projeto ${p.name} criado${launched > 0 ? ` e ${launched} ${launched === 1 ? 'parcela lançada' : 'parcelas lançadas'} nos honorários` : ''}.`,
      );
      onClose();
      navigate(`/projetos/${p.id}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const selected = db.clients.find((c) => c.id === clientId);
  const completes =
    contract && selected && (contractClient === 'document' || contractClient === 'name' || contractClient === 'selected')
      ? missingClientFields(selected, contract.extraction)
      : {};
  const completeLabels = [...new Set(Object.keys(completes).map((k) => FIELD_LABEL[k] ?? k))];

  return (
    <>
      <Modal
        title="Novo projeto"
        subtitle="As tarefas do tipo de projeto escolhido são criadas automaticamente."
        onClose={onClose}
        size="lg"
        footer={
          <>
            <Button onClick={onClose}>Cancelar</Button>
            <Button variant="primary" loading={busy} onClick={save}>Criar projeto</Button>
          </>
        }
      >
        <div className="mb-6">
          <ContractReader
            initial={contract}
            description="Envie o contrato assinado (PDF) e o sistema preenche o cliente e o projeto. O PDF fica guardado nos documentos do projeto."
            onRead={readContract}
          />
          {contractClient && contractClient !== 'new' && selected && (
            <p className="mt-2 flex items-start gap-1.5 text-[13px] text-success-fg">
              <UserCheck className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
              <span>
                {contractClient === 'selected'
                  ? `Contrato de ${selected.name}.`
                  : `${selected.name} já é cliente (${contractClient === 'document' ? 'mesmo CPF/CNPJ do contrato' : 'mesmo nome do contrato'}) e foi selecionado.`}
                {completeLabels.length > 0 && ` Ao criar o projeto, o cadastro é completado com o que falta: ${completeLabels.join(', ')}.`}
              </span>
            </p>
          )}
          {contractClient === 'missing' && (
            <p className="mt-2 flex items-start gap-1.5 text-[13px] text-warning-fg">
              <UserPlus className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
              Não encontrei o nome e o CPF do contratante neste contrato. Selecione ou cadastre o cliente abaixo, ou use “Ler com o Claude.ai” no
              quadro acima para uma leitura completa.
            </p>
          )}
          {contractClient === 'new' && !clientId && contract && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
              <UserPlus className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              {contract.extraction.client.name || 'O cliente do contrato'} ainda não está cadastrado.
              <Button size="xs" onClick={() => setNewClient({ prefilled: true })}>
                Cadastrar com os dados do contrato
              </Button>
            </p>
          )}
        </div>
        <div className="mb-5 flex items-end gap-2">
          <Field label="Cliente" required error={clientError} className="flex-1">
            <Select value={clientId} onChange={(e) => pickClient(e.target.value)} invalid={!!clientError}>
              <option value="">Selecione o cliente…</option>
              {[...db.clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                <option key={c.id} value={c.id}>{c.name} · {c.city}</option>
              ))}
            </Select>
          </Field>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setNewClient({ prefilled: false })} className={clientError ? 'mb-5' : ''}>
            Novo cliente
          </Button>
        </div>
        <ProjectFields value={draft} onChange={setDraft} errors={errors} />
        {canFees && (
          <FeesSection
            fees={fees}
            on={feesOn}
            onToggle={(on) => {
              setFeesOn(on);
              setFeesError('');
            }}
            error={feesError}
            fromContract={!!contract}
          />
        )}
      </Modal>
      {newClient && (
        <ClientFormModal
          forProject
          initial={newClient.prefilled && contract ? applyContractToClient(contract.extraction, emptyClient()) : undefined}
          initialContract={newClient.prefilled ? contract : null}
          onClose={() => setNewClient(null)}
          onSaved={(c, read) => {
            pickClient(c.id, c);
            setContractClient(null);
            // Contrato lido dentro do Novo cliente: vale também para o projeto
            if (read && read !== contract) applyContract(read);
          }}
        />
      )}
    </>
  );
}
