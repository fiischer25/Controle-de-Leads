import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { planSummary } from '../../lib/paymentPlan';
import type { Client, FinanceEntry, Lead } from '../../lib/types';
import { byPosition, cn, formatCurrency, formatDate, formatDateShort, formatMoney, today } from '../../lib/utils';
import { ActionLink, IconButton, MetricRow, SectionHeader } from '../ui';
import { WonDealModal } from '../leads/WonDealModal';
import { EntryFormModal } from './EntryFormModal';
import { useFinance } from './useFinance';

/**
 * Valores do cliente: contrato (forma de pagamento do ganho) e, para quem tem o Financeiro, as
 * parcelas a receber dele (do cliente, dos projetos e da oportunidade), com recebido, a receber
 * e atrasado, e o botão para lançar um valor.
 */
export function ClientFinanceSection({ client, lead, projectIds }: { client: Client; lead: Lead | null; projectIds: string[] }) {
  const { db, can, closeDeal } = useData();
  const fin = useFinance();
  const toast = useToast();
  const finance = can('financeiro');
  const t = today();
  const [editingPlan, setEditingPlan] = useState(false);
  const [entryForm, setEntryForm] = useState<{ entry?: FinanceEntry } | null>(null);

  const entries = useMemo(
    () =>
      db.finance_entries
        .filter(
          (e) =>
            e.kind === 'receita' &&
            (e.client_id === client.id || (e.project_id && projectIds.includes(e.project_id)) || (lead && e.lead_id === lead.id)),
        )
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [db.finance_entries, client.id, projectIds, lead],
  );
  const received = entries.filter((e) => e.paid_at).reduce((a, e) => a + e.amount, 0);
  const pending = entries.filter((e) => !e.paid_at);
  const toReceive = pending.reduce((a, e) => a + e.amount, 0);
  const overdue = pending.filter((e) => e.due_date < t).reduce((a, e) => a + e.amount, 0);
  const plan = lead?.payment_plan ?? null;
  const contracted = plan?.total ?? lead?.proposal_value ?? null;
  const honorarios = [...db.finance_categories].sort(byPosition).find((c) => c.kind === 'receita' && c.active && c.name.toLowerCase().startsWith('honor'));

  if (!finance && !plan) return null;

  return (
    <section aria-labelledby="cliente-financeiro">
      <SectionHeader
        id="cliente-financeiro"
        title="Financeiro"
        aside={
          <span className="flex items-center gap-4">
            {lead && (can('comercial') || finance) && <ActionLink onClick={() => setEditingPlan(true)}>{plan ? 'Editar contrato' : 'Definir contrato'}</ActionLink>}
            {finance && <ActionLink onClick={() => setEntryForm({})}>Lançar valor</ActionLink>}
          </span>
        }
      />
      <MetricRow
        items={[
          { label: 'Contrato', value: contracted ? formatCurrency(contracted) : '—', sub: plan ? planSummary(plan.rows) : 'forma de pagamento não definida' },
          ...(finance
            ? [
                { label: 'Recebido', value: formatCurrency(received), sub: `${entries.length - pending.length} de ${entries.length} parcelas` },
                { label: 'A receber', value: formatCurrency(toReceive), sub: pending[0] ? `próxima em ${formatDateShort(pending[0].due_date)}` : 'nada pendente' },
                {
                  label: 'Atrasado',
                  value: formatCurrency(overdue),
                  tone: overdue > 0 ? 'text-danger-fg' : undefined,
                  sub: overdue > 0 ? 'parcelas vencidas' : 'em dia',
                },
              ]
            : []),
        ]}
      />

      {finance ? (
        entries.length === 0 ? (
          <p className="mt-4 border-t border-hairline py-4 text-[13px] text-faint">
            Nenhum valor lançado para este cliente. Use “Lançar valor” ou defina o contrato para lançar as parcelas.
          </p>
        ) : (
          <ul className="mt-4">
            {entries.map((e) => {
              const late = !e.paid_at && e.due_date < t;
              return (
                <li key={e.id} className="flex items-center gap-3 border-t border-hairline py-3">
                  <button type="button" onClick={() => setEntryForm({ entry: e })} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-body text-ink hover:underline hover:decoration-stone-300 hover:underline-offset-4">{e.description}</div>
                    <div className={cn('text-[12.5px]', e.paid_at ? 'text-success-fg' : late ? 'text-danger-fg' : 'text-faint')}>
                      {e.paid_at ? `Recebido em ${formatDate(e.paid_at)}` : late ? `Venceu em ${formatDate(e.due_date)}` : `Vence em ${formatDate(e.due_date)}`}
                    </div>
                  </button>
                  <span className="text-body tabular text-ink">{formatMoney(e.amount)}</span>
                  {!e.paid_at && (
                    <IconButton
                      label={`Marcar ${e.description} como recebido`}
                      size="xs"
                      onClick={() => fin.setPaid(e, t).then(() => toast.success('Parcela marcada como recebida.')).catch(toast.error)}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </IconButton>
                  )}
                </li>
              );
            })}
          </ul>
        )
      ) : (
        plan && (
          <ul className="mt-4">
            {plan.rows.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-3 border-t border-hairline py-3 text-body">
                <span className="min-w-0 truncate text-ink">
                  {r.label || `Parcela ${i + 1}`} <span className="text-faint">· {formatDate(r.due_date)}</span>
                </span>
                <span className="tabular text-ink">{formatMoney(r.value ?? (plan.total * (Number(r.percent) || 0)) / 100)}</span>
              </li>
            ))}
          </ul>
        )
      )}

      {editingPlan && lead && (
        <WonDealModal
          lead={lead}
          mode="edit"
          onClose={() => setEditingPlan(false)}
          onSubmit={async (p, launch) => {
            if (!p) return;
            const n = await closeDeal(lead.id, p, launch, true);
            toast.success(n > 0 ? `Contrato salvo e ${n} ${n === 1 ? 'parcela atualizada' : 'parcelas atualizadas'} no Financeiro.` : 'Contrato salvo.');
          }}
        />
      )}
      {entryForm && (
        <EntryFormModal
          entry={entryForm.entry}
          defaults={{
            kind: 'receita',
            client_id: client.id,
            project_id: projectIds.length === 1 ? projectIds[0] : null,
            category_id: honorarios?.id ?? null,
            description: `Honorários ${client.name}`,
          }}
          onClose={() => setEntryForm(null)}
        />
      )}
    </section>
  );
}
