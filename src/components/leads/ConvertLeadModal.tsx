import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, CheckCircle2, Circle } from 'lucide-react';
import { useData, type ClientInput } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import {
  applyContractToClient,
  applyContractToProject,
  contractPlan,
  forgetContract,
  recalledContract,
  type ContractExtraction,
} from '../../lib/contract';
import { finalizeRows, planSummary, validatePlan } from '../../lib/paymentPlan';
import type { Lead, LeadPaymentPlan } from '../../lib/types';
import { cn, formatMoney, maskPhone, nowIso, suggestProjectName, today } from '../../lib/utils';
import { ClientFields, emptyClient, REQUIRED_CLIENT_FIELDS, validateClient, type ClientErrors } from '../clients/ClientFields';
import { ProjectFields, validateProject, type ProjectDraft, type ProjectErrors } from '../projects/ProjectFields';
import { Button, Checkbox, Modal } from '../ui';
import { ContractReader } from './ContractReader';

/**
 * "Virar cliente": só conclui quando todos os dados obrigatórios do cliente
 * e do projeto estiverem preenchidos. Cria cliente + projeto + tarefas do modelo.
 */
export function ConvertLeadModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { db, convertLead, closeDeal, can, maps } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  // Contrato lido no fechamento (Oportunidade ganha): já preenche o cadastro
  const [recalled] = useState(() => recalledContract(lead.id));
  const [step, setStep] = useState<1 | 2>(1);
  const [client, setClient] = useState<ClientInput>(() => {
    const base = emptyClient({ name: lead.name, phone: maskPhone(lead.phone), email: lead.email ?? '', city: lead.city, state: lead.state ?? 'PR' });
    return recalled ? applyContractToClient(recalled.extraction, base) : base;
  });
  // Contrato lido aqui, com a oportunidade ainda sem forma de pagamento: oferece salvar as parcelas
  const [contractDeal, setContractDeal] = useState<LeadPaymentPlan | null>(null);
  const [saveDeal, setSaveDeal] = useState(true);
  const [clientErrors, setClientErrors] = useState<ClientErrors>({});
  const [sameAddress, setSameAddress] = useState(false);
  const typeId = lead.project_type_id ?? '';
  const [project, setProject] = useState<ProjectDraft>(() => {
    const start = today();
    const draft: ProjectDraft = {
      name: suggestProjectName(lead.name, lead.category === 'Residencial' || !lead.category ? 'CASA' : 'PROJETO'),
      project_type_id: typeId,
      manager_id: null,
      member_ids: [],
      start_date: start,
      due_date: null,
      area_m2: lead.area_m2,
      site_address: null,
      site_city: lead.city,
      description: lead.notes,
      default_assignee_id: null,
    };
    return recalled ? applyContractToProject(recalled.extraction, draft) : draft;
  });

  const readContract = (x: ContractExtraction) => {
    setClient((c) => applyContractToClient(x, c));
    setProject((p) => applyContractToProject(x, p));
    setClientErrors({});
    const plan = contractPlan(x, today());
    const current = maps.leads[lead.id] ?? lead;
    if (plan?.draft && !current.payment_plan && !validatePlan(plan.total, plan.draft.rows)) {
      setContractDeal({
        total: plan.total,
        rows: finalizeRows(plan.total, plan.draft.rows),
        account_id: db.finance_accounts.find((a) => a.active)?.id ?? null,
        preset: plan.draft.preset,
        defined_at: nowIso(),
      });
    } else setContractDeal(null);
  };
  const [projectErrors, setProjectErrors] = useState<ProjectErrors>({});
  const [busy, setBusy] = useState(false);

  const checklist = useMemo(() => {
    const errs = validateClient(client);
    return REQUIRED_CLIENT_FIELDS.map(([key, label]) => ({ label, ok: !errs[key] }));
  }, [client]);
  const filled = checklist.filter((c) => c.ok).length;

  const next = () => {
    const errs = validateClient(client);
    setClientErrors(errs);
    if (Object.keys(errs).length) {
      toast.error('Preencha todos os dados obrigatórios do cliente para continuar.');
      return;
    }
    setStep(2);
  };

  const finish = async () => {
    const draft: ProjectDraft = sameAddress
      ? {
          ...project,
          site_address: `${client.street}, ${client.number}${client.complement ? ` - ${client.complement}` : ''} - ${client.neighborhood}`,
          site_city: client.city,
        }
      : project;
    const errs = validateProject(draft);
    setProjectErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const created = await convertLead(lead.id, client, draft);
      const launched = contractDeal && saveDeal ? await closeDeal(lead.id, contractDeal, true, true) : 0;
      forgetContract(lead.id);
      toast.success(
        `${client.name} agora é cliente! Projeto ${created.name} criado${launched > 0 ? ` e ${launched} ${launched === 1 ? 'parcela lançada' : 'parcelas lançadas'} no Financeiro` : ''}.`,
      );
      onClose();
      if (can('projetos')) navigate(`/projetos/${created.id}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Virar cliente"
      subtitle={`Converta ${lead.name} em cliente e inicie o projeto.`}
      onClose={onClose}
      size="xl"
      footer={
        step === 1 ? (
          <>
            <Button onClick={onClose}>Cancelar</Button>
            <Button variant="primary" onClick={next}>
              Continuar para o projeto
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setStep(1)}>Voltar</Button>
            <Button variant="primary" loading={busy} onClick={finish} icon={<Check className="h-4 w-4" />}>
              Converter e criar projeto
            </Button>
          </>
        )
      }
    >
      <ol className="mb-6 flex items-center gap-3 text-sm">
        {['Dados do cliente', 'Projeto'].map((label, i) => {
          const n = (i + 1) as 1 | 2;
          const done = step > n;
          return (
            <li key={label} className="flex items-center gap-3">
              {i > 0 && <span className="h-px w-8 bg-stone-300" />}
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                  step === n ? 'bg-ink text-surface' : done ? 'bg-success-solid text-surface' : 'bg-stone-200 text-stone-500',
                )}
              >
                {done ? <Check className="h-4 w-4" /> : n}
              </span>
              <span className={cn('font-medium', step === n ? 'text-ink' : 'text-stone-500')}>{label}</span>
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <div className="mb-6">
          <ContractReader
            initial={recalled}
            description="Envie o contrato assinado (PDF, foto ou Word) e o sistema preenche os dados do cliente e do projeto."
            onRead={readContract}
          />
          {contractDeal && (
            <div className="mt-3 rounded-[12px] border border-line bg-surface px-4 py-3">
              <Checkbox
                checked={saveDeal}
                onChange={setSaveDeal}
                label={`Salvar também a forma de pagamento do contrato: ${formatMoney(contractDeal.total)}, ${planSummary(contractDeal.rows)}`}
              />
              <p className="mt-1 pl-6 text-[12.5px] text-faint">As parcelas entram em contas a receber no Financeiro. Dá para ajustar depois em Editar cliente → Contrato.</p>
            </div>
          )}
        </div>
      )}

      {step === 1 ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
          <ClientFields value={client} onChange={setClient} errors={clientErrors} />
          <aside className="h-fit rounded-lg border border-line bg-stone-50 p-4 lg:sticky lg:top-0">
            <div className="text-sm font-semibold text-stone-800">Cadastro completo</div>
            <div className="mt-1 text-xs text-stone-500">
              {filled} de {checklist.length} campos obrigatórios
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200">
              <div className="h-full rounded-full bg-success-solid transition-all" style={{ width: `${(filled / checklist.length) * 100}%` }} />
            </div>
            <ul className="mt-3 space-y-1.5">
              {checklist.map((c) => (
                <li key={c.label} className={cn('flex items-center gap-2 text-xs', c.ok ? 'text-stone-700' : 'text-stone-400')}>
                  {c.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-success-fg" /> : <Circle className="h-3.5 w-3.5" />}
                  {c.label}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      ) : (
        <div className="space-y-4">
          <Checkbox checked={sameAddress} onChange={setSameAddress} label="O endereço da obra é o mesmo do cliente" />
          <ProjectFields value={project} onChange={setProject} errors={projectErrors} />
        </div>
      )}
    </Modal>
  );
}
