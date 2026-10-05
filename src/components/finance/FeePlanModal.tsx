import { useState } from 'react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import type { FinanceEntry, Project } from '../../lib/types';
import { formatMoney, nowIso, uid } from '../../lib/utils';
import { Button, Field, Modal, Select } from '../ui';
import { MoneyInput } from './MoneyInput';
import { newPlanDraft, planAmounts, validatePlan, type PlanDraft } from '../../lib/paymentPlan';
import { PaymentPlanEditor } from './PaymentPlanEditor';
import { useFinance } from './useFinance';

/**
 * Plano de honorários do projeto: valor do contrato dividido em parcelas por percentual
 * (ex.: 30% na assinatura, 40% no anteprojeto, 30% na entrega). Gera as contas a receber.
 */
export function FeePlanModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const { maps, me } = useData();
  const fin = useFinance();
  const toast = useToast();
  // Sugestão: valor da proposta da oportunidade que originou o projeto (quando visível)
  const suggested = project.lead_id ? (maps.leads[project.lead_id]?.proposal_value ?? null) : null;
  const [total, setTotal] = useState<number | null>(suggested);
  const [plan, setPlan] = useState<PlanDraft>(() => newPlanDraft());
  const [account, setAccount] = useState(fin.accounts.find((a) => a.active)?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const category =
    fin.categories.find((c) => c.kind === 'receita' && c.active && c.name.toLowerCase().startsWith('honorários')) ??
    fin.categories.find((c) => c.kind === 'receita' && c.active);
  const existing = fin.entries.filter((e) => e.project_id === project.id && e.kind === 'receita');
  const existingTotal = Math.round(existing.reduce((a, e) => a + e.amount * 100, 0)) / 100;
  const rows = plan.rows;

  const save = async () => {
    const problem = validatePlan(total, rows);
    if (problem) return setError(problem);
    const amounts = planAmounts(total, rows);
    setBusy(true);
    try {
      const now = nowIso();
      const series = rows.length > 1 ? uid() : null;
      const entries: FinanceEntry[] = rows.map((r, i) => ({
        id: uid(),
        kind: 'receita',
        description: `Honorários ${project.name} · ${r.label.trim() || `Parcela ${i + 1}`}`,
        amount: amounts[i],
        due_date: r.due_date,
        paid_at: null,
        account_id: account || null,
        to_account_id: null,
        category_id: category?.id ?? null,
        client_id: project.client_id,
        project_id: project.id,
        series_id: series,
        installment: rows.length > 1 ? i + 1 : null,
        installments: rows.length > 1 ? rows.length : null,
        document: null,
        notes: null,
        created_by: me.id,
        created_at: now,
        updated_at: now,
      }));
      await fin.insertEntries(entries);
      toast.success(`${entries.length} ${entries.length === 1 ? 'parcela lançada' : 'parcelas lançadas'} em contas a receber.`);
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Plano de honorários"
      subtitle={project.name}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Lançar parcelas
          </Button>
        </>
      }
    >
      {existing.length > 0 && (
        <p className="mb-4 rounded-[10px] bg-warning-bg px-3 py-2 text-[13px] text-warning-fg">
          Este projeto já tem {existing.length} {existing.length === 1 ? 'parcela lançada' : 'parcelas lançadas'} ({formatMoney(existingTotal)}). As novas
          serão somadas; para refazer o plano, exclua as antigas antes.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor do contrato" required hint={suggested ? `Proposta da oportunidade: ${formatMoney(suggested)}` : undefined}>
          <MoneyInput value={total} onChange={setTotal} aria-label="Valor do contrato" autoFocus />
        </Field>
        <Field label="Conta que recebe">
          <Select value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Conta que recebe">
            <option value="">Sem conta definida</option>
            {fin.accounts
              .filter((a) => a.active)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </Select>
        </Field>
      </div>
      <div className="mt-4">
        <PaymentPlanEditor total={total} value={plan} onChange={setPlan} />
        {error && <p className="mt-3 text-[13px] text-danger-fg">{error}</p>}
        <p className="mt-4 text-[12.5px] text-faint">
          As parcelas entram em contas a receber, na categoria {category?.name ?? 'de receitas'}. Datas e valores podem ser ajustados depois, uma a uma.
        </p>
      </div>
    </Modal>
  );
}
