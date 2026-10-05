import { useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import { addMonthsKey, FEE_PRESETS, type FeePreset, type PlanRow } from '../../lib/finance';
import { newPlanDraft, planAmounts, planPercentSum, planTotal, rowPercent, type PlanDraft } from '../../lib/paymentPlan';
import { MoneyInput } from './MoneyInput';
import { formatMoney } from '../../lib/utils';
import { Button, Field, IconButton, Input, Select } from '../ui';

/**
 * Editor de forma de pagamento: modelo (30/40/30, 50/50, à vista, mensal), 1º vencimento e
 * tabela de parcelas editável (descrição, %, data e valor). Digitando o valor em R$, o
 * percentual é calculado; digitando o percentual, o valor é calculado.
 */
export function PaymentPlanEditor({ total, value, onChange }: { total: number | null; value: PlanDraft; onChange: (v: PlanDraft) => void }) {
  const { preset, months, first, rows } = value;
  const percentSum = planPercentSum(rows, total);
  const amounts = useMemo(() => planAmounts(total, rows), [total, rows]);
  const sum = planTotal(total, rows);
  const closes = amounts.length > 0;
  const setRows = (next: PlanRow[]) => onChange({ ...value, rows: next });
  const setRow = (i: number, patch: Partial<PlanRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Forma de pagamento">
          <Select value={preset} onChange={(e) => onChange(newPlanDraft(first, e.target.value as FeePreset, months))} aria-label="Modelo de parcelas">
            {FEE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Primeiro vencimento">
          <Input
            type="date"
            value={first}
            onChange={(e) => {
              const start = e.target.value;
              if (!start) return;
              onChange({ ...value, first: start, rows: rows.map((r, i) => ({ ...r, due_date: addMonthsKey(start, i) })) });
            }}
            aria-label="Primeiro vencimento"
          />
        </Field>
        {preset === 'mensal' && (
          <Field label="Número de parcelas">
            <Input
              type="number"
              min={1}
              max={36}
              value={months}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 1 && n <= 36) onChange(newPlanDraft(first, 'mensal', n));
                else onChange({ ...value, months: n });
              }}
              aria-label="Número de parcelas"
            />
          </Field>
        )}
      </div>

      <div className="mt-5">
        <div className="grid grid-cols-[minmax(0,1fr)_80px_132px_132px_28px] gap-2 pb-2 text-[12.5px] text-faint">
          <span>Etapa / parcela</span>
          <span className="text-right">%</span>
          <span>Vencimento</span>
          <span className="text-right">Valor</span>
          <span />
        </div>
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_80px_132px_132px_28px] items-center gap-2">
              <Input value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} className="h-9" aria-label={`Descrição da parcela ${i + 1}`} />
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={rowPercent(total, r)}
                // Digitou o percentual: o valor passa a ser calculado
                onChange={(e) => setRow(i, { percent: Number(e.target.value), amount: null })}
                className="h-9 text-right"
                aria-label={`Percentual da parcela ${i + 1}`}
              />
              <Input type="date" value={r.due_date} onChange={(e) => setRow(i, { due_date: e.target.value })} className="h-9" aria-label={`Vencimento da parcela ${i + 1}`} />
              <MoneyInput
                value={r.amount ?? amounts[i] ?? (total ? Math.round(total * (Number(r.percent) || 0)) / 100 : null)}
                // Digitou o valor: o percentual passa a ser calculado
                onChange={(v) => setRow(i, v == null ? { amount: null } : { amount: v, percent: total ? Math.round((v / total) * 10000) / 100 : r.percent })}
                aria-label={`Valor da parcela ${i + 1}`}
              />
              <IconButton label={`Remover parcela ${i + 1}`} size="xs" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1}>
                <X className="h-3.5 w-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setRows([...rows, { label: `Parcela ${rows.length + 1}`, percent: 0, due_date: addMonthsKey(rows[rows.length - 1]?.due_date ?? first, 1) }])}
          >
            Parcela
          </Button>
          <span className={closes ? 'text-[12.5px] tabular text-faint' : 'text-[12.5px] tabular text-danger-fg'}>
            Soma: {formatMoney(sum)} · {percentSum.toLocaleString('pt-BR')}%
            {!closes && total ? (total > sum ? ` · faltam ${formatMoney(Math.round((total - sum) * 100) / 100)}` : ` · passou ${formatMoney(Math.round((sum - total) * 100) / 100)}`) : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
