import { useState } from 'react';
import { useData } from '../../context/DataContext';
import type { FeePreset } from '../../lib/finance';
import { finalizeRows, newPlanDraft, validatePlan, type PlanDraft } from '../../lib/paymentPlan';
import type { Lead, LeadPaymentPlan } from '../../lib/types';
import { nowIso, today } from '../../lib/utils';

/**
 * Estado do contrato (valor fechado e forma de pagamento) de uma oportunidade: usado no
 * fechamento (Oportunidade ganha) e na edição do cliente. `lead` nulo = cliente sem oportunidade.
 */
export function useContract(lead: Lead | null) {
  const { db, can } = useData();
  const existingPlan = lead?.payment_plan ?? null;
  const [total, setTotal] = useState<number | null>(existingPlan?.total ?? lead?.proposal_value ?? null);
  const [draft, setDraft] = useState<PlanDraft>(() =>
    existingPlan?.rows?.length
      ? { preset: (existingPlan.preset as FeePreset) || '30-40-30', months: existingPlan.rows.length, first: existingPlan.rows[0].due_date, rows: existingPlan.rows }
      : newPlanDraft(today()),
  );
  const finance = can('financeiro');
  const accounts = db.finance_accounts.filter((a) => a.active);
  const [account, setAccount] = useState(existingPlan?.account_id ?? accounts[0]?.id ?? '');
  // Parcelas já lançadas (visível só para quem tem o Financeiro)
  const launched = lead ? db.finance_entries.filter((e) => e.lead_id === lead.id) : [];
  const received = launched.filter((e) => e.paid_at).length;
  // Já lançadas e nada recebido: salvar atualiza as parcelas no Financeiro
  const [launch, setLaunch] = useState(received === 0);
  const [touched, setTouched] = useState(false);

  /** Plano pronto para gravar, ou a mensagem do que falta. */
  const build = (): { plan: LeadPaymentPlan } | { error: string } => {
    const problem = validatePlan(total, draft.rows);
    if (problem) return { error: problem };
    return {
      plan: { total: total!, rows: finalizeRows(total!, draft.rows), account_id: account || null, preset: draft.preset, defined_at: nowIso() },
    };
  };

  /** Preenche com o contrato lido: valor e, quando houver, as parcelas. */
  const apply = (nextTotal: number, nextDraft: PlanDraft | null) => {
    setTouched(true);
    setTotal(nextTotal);
    if (nextDraft) setDraft(nextDraft);
  };

  const touch = <T,>(fn: (v: T) => void) => (v: T) => {
    setTouched(true);
    fn(v);
  };

  return {
    lead,
    existingPlan,
    total,
    setTotal: touch(setTotal),
    draft,
    setDraft: touch(setDraft),
    finance,
    accounts,
    account,
    setAccount: touch(setAccount),
    launched,
    received,
    launch: launch && received === 0,
    setLaunch,
    touched,
    build,
    apply,
  };
}

export type Contract = ReturnType<typeof useContract>;

/** Âncora da seção Honorários do projeto novo (Novo projeto e Virar cliente). */
export const FEES_SECTION_ID = 'honorarios-do-projeto';

/** Plano pronto para lançar, ou a mensagem do que falta (e rola até a seção Honorários). */
export function buildFees(fees: Contract) {
  const built = fees.build();
  if ('error' in built) document.getElementById(FEES_SECTION_ID)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return built;
}
