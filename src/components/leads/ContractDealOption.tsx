import { planSummary } from '../../lib/paymentPlan';
import type { LeadPaymentPlan } from '../../lib/types';
import { formatMoney } from '../../lib/utils';
import { Checkbox } from '../ui';

/** "Salvar também a forma de pagamento do contrato": valor e parcelas lidos do contrato. */
export function ContractDealOption({
  deal,
  checked,
  onChange,
  hint = 'As parcelas entram em contas a receber no Financeiro. Dá para ajustar depois em Editar cliente → Contrato.',
}: {
  deal: LeadPaymentPlan;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="mt-3 rounded-[12px] border border-line bg-surface px-4 py-3">
      <Checkbox
        checked={checked}
        onChange={onChange}
        label={`Salvar também a forma de pagamento do contrato: ${formatMoney(deal.total)}, ${planSummary(deal.rows)}`}
      />
      <p className="mt-1 pl-6 text-[12.5px] text-faint">{hint}</p>
    </div>
  );
}
