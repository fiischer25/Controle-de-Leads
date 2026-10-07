import type { PlanRow } from '../../lib/finance';
import { today } from '../../lib/utils';
import { Checkbox } from '../ui';

/**
 * Parcelas com data já passada (projeto já em andamento): "já foram recebidas" (padrão), para
 * entrarem como recebidas no mês de cada parcela e não como vencidas no mês atual.
 */
export function PastPaidOption({ rows, checked, onChange }: { rows: PlanRow[]; checked: boolean; onChange: (v: boolean) => void }) {
  const t = today();
  const past = rows.filter((r) => r.due_date && r.due_date < t).length;
  if (!past) return null;
  return (
    <div className="mt-4 rounded-[12px] bg-canvas px-4 py-3">
      <Checkbox
        checked={checked}
        onChange={onChange}
        label={past === 1 ? 'A parcela com data já passada já foi recebida' : `As ${past} parcelas com data já passada já foram recebidas`}
      />
      <p className="mt-1 pl-6 text-[12.5px] text-faint">
        Entram como recebidas na data de cada parcela, no mês certo do Financeiro. Desmarque se ainda estiverem em aberto.
      </p>
    </div>
  );
}
