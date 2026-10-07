import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, UserCheck, UserPlus } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import {
  applyContractToClient,
  applyContractToProject,
  contractDeal,
  findClientByContract,
  type ContractExtraction,
  type ReadContract,
} from '../../lib/contract';
import { uploadTeamFile } from '../../lib/teamFiles';
import type { Client, LeadPaymentPlan } from '../../lib/types';
import { digitsOnly, suggestProjectName, today } from '../../lib/utils';
import { emptyClient } from '../clients/ClientFields';
import { ClientFormModal } from '../clients/ClientFormModal';
import { ContractDealOption } from '../leads/ContractDealOption';
import { ContractReader } from '../leads/ContractReader';
import { Button, Field, Modal, Select } from '../ui';
import { ProjectFields, validateProject, type ProjectDraft, type ProjectErrors } from './ProjectFields';

/**
 * Novo projeto. "Preencher com o contrato" lê o PDF: seleciona o cliente (mesmo CPF/CNPJ) ou abre o
 * Novo cliente já preenchido, preenche área, endereço da obra e escopo, oferece lançar as parcelas
 * no Financeiro e guarda o PDF nos documentos do projeto.
 */
export function ProjectFormModal({ onClose, clientId: initialClient }: { onClose: () => void; clientId?: string }) {
  const { db, me, can, createProject, updateProject, ensureClientLead, closeDeal } = useData();
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
  const [deal, setDeal] = useState<LeadPaymentPlan | null>(null);
  const [saveDeal, setSaveDeal] = useState(true);
  // Resultado da busca do cliente do contrato (mostrado abaixo do leitor)
  const [contractClient, setContractClient] = useState<'found' | 'new' | null>(null);

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
    setDeal(can('comercial') ? contractDeal(read.extraction, db.finance_accounts.find((a) => a.active)?.id ?? null) : null);
  };

  const readContract = (extraction: ContractExtraction, fileName: string, file?: File) => {
    applyContract({ extraction, fileName, file });
    const match = findClientByContract(db.clients, extraction);
    if (match) {
      pickClient(match.id);
      setContractClient('found');
      return;
    }
    // Cliente já escolhido sem CPF/CNPJ cadastrado: pode ser o mesmo, mantém
    const current = db.clients.find((c) => c.id === clientId);
    if (current && !digitsOnly(current.document)) return setContractClient(null);
    setClientId('');
    setContractClient('new');
    setNewClient({ prefilled: true });
  };

  const save = async () => {
    const errs = validateProject(draft);
    setErrors(errs);
    if (!clientId) setClientError('Selecione o cliente');
    if (Object.keys(errs).length || !clientId) return;
    setBusy(true);
    try {
      // Parcelas do contrato: ficam numa oportunidade ganha do cliente, ligada a este projeto
      const lead = deal && saveDeal ? await ensureClientLead(clientId, { newDeal: true, projectTypeId: draft.project_type_id }) : null;
      const p = await createProject({ ...draft, client_id: clientId, lead_id: lead?.id ?? null });
      const problems: string[] = [];
      let launched = 0;
      if (lead && deal) {
        try {
          launched = await closeDeal(lead.id, deal, true, true);
        } catch (e) {
          problems.push(`as parcelas não foram lançadas (${e instanceof Error ? e.message : e})`);
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
        `Projeto ${p.name} criado${launched > 0 ? ` e ${launched} ${launched === 1 ? 'parcela lançada' : 'parcelas lançadas'} no Financeiro` : ''}.`,
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
          {contractClient === 'found' && selected && (
            <p className="mt-2 flex items-center gap-1.5 text-[13px] text-success-fg">
              <UserCheck className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              {selected.name} já é cliente (mesmo CPF/CNPJ do contrato) e foi selecionado.
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
          {deal && (
            <ContractDealOption
              deal={deal}
              checked={saveDeal}
              onChange={setSaveDeal}
              hint="As parcelas entram em contas a receber no Financeiro, ligadas a este projeto."
            />
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
