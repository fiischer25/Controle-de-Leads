import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { addMonthsKey, feePlan, FEE_PRESETS, splitByPercent, type FeePreset, type PlanRow } from '../../lib/finance';
import type { FinanceEntry, Project } from '../../lib/types';
import { formatMoney, nowIso, today, uid } from '../../lib/utils';
import { Button, Field, IconButton, Input, Modal, Select } from '../ui';
import { MoneyInput } from './MoneyInput';
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
  const [preset, setPreset] = useState<FeePreset>('30-40-30');
  const [months, setMonths] = useState(6);
  const [first, setFirst] = useState(today());
  const [rows, setRows] = useState<PlanRow[]>(() => feePlan('30-40-30', today()));
  const [account, setAccount] = useState(fin.accounts.find((a) => a.active)?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const category =
    fin.categories.find((c) => c.kind === 'receita' && c.active && c.name.toLowerCase().startsWith('honorários')) ??
    fin.categories.find((c) => c.kind === 'receita' && c.active);
  const existing = fin.entries.filter((e) => e.project_id === project.id && e.kind === 'receita');
  const existingTotal = Math.round(existing.reduce((a, e) => a + e.amount * 100, 0)) / 100;
  const percentSum = Math.round(rows.reduce((a, r) => a + (Number(r.percent) || 0), 0) * 100) / 100;
  const amounts = useMemo(() => (total && percentSum === 100 ? splitByPercent(total, rows.map((r) => Number(r.percent) || 0)) : []), [total, rows, percentSum]);

  const applyPreset = (p: FeePreset, n = months, start = first) => {
    setPreset(p);
    setRows(feePlan(p, start, n));
  };
  const setRow = (i: number, patch: Partial<PlanRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    if (!total || total <= 0) return setError('Informe o valor do contrato.');
    if (rows.length === 0) return setError('Inclua ao menos uma parcela.');
    if (percentSum !== 100) return setError(`Os percentuais somam ${percentSum}%: precisam somar 100%.`);
    if (rows.some((r) => !r.due_date)) return setError('Informe a data de cada parcela.');
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
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Valor do contrato" required hint={suggested ? `Proposta da oportunidade: ${formatMoney(suggested)}` : undefined}>
          <MoneyInput value={total} onChange={setTotal} aria-label="Valor do contrato" autoFocus />
        </Field>
        <Field label="Modelo">
          <Select value={preset} onChange={(e) => applyPreset(e.target.value as FeePreset)} aria-label="Modelo de parcelas">
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
              setFirst(start);
              setRows((rs) => rs.map((r, i) => ({ ...r, due_date: addMonthsKey(start, i) })));
            }}
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
                setMonths(n);
                if (n >= 1 && n <= 36) applyPreset('mensal', n);
              }}
            />
          </Field>
        )}
        <Field label="Conta que recebe" className={preset === 'mensal' ? 'sm:col-span-2' : 'sm:col-span-3'}>
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

      <div className="mt-6">
        <div className="grid grid-cols-[minmax(0,1fr)_72px_132px_110px_28px] gap-2 pb-2 text-[12.5px] text-faint">
          <span>Etapa / parcela</span>
          <span className="text-right">%</span>
          <span>Vencimento</span>
          <span className="text-right">Valor</span>
          <span />
        </div>
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_72px_132px_110px_28px] items-center gap-2">
              <Input value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} className="h-9" aria-label={`Descrição da parcela ${i + 1}`} />
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={r.percent}
                onChange={(e) => setRow(i, { percent: Number(e.target.value) })}
                className="h-9 text-right"
                aria-label={`Percentual da parcela ${i + 1}`}
              />
              <Input type="date" value={r.due_date} onChange={(e) => setRow(i, { due_date: e.target.value })} className="h-9" aria-label={`Vencimento da parcela ${i + 1}`} />
              <span className="text-right text-[13px] tabular text-ink">{amounts[i] != null ? formatMoney(amounts[i]) : '—'}</span>
              <IconButton label={`Remover parcela ${i + 1}`} size="xs" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} disabled={rows.length === 1}>
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
            onClick={() =>
              setRows((rs) => [...rs, { label: `Parcela ${rs.length + 1}`, percent: 0, due_date: addMonthsKey(rs[rs.length - 1]?.due_date ?? first, 1) }])
            }
          >
            Parcela
          </Button>
          <span className={percentSum === 100 ? 'text-[12.5px] text-faint' : 'text-[12.5px] text-danger-fg'}>Soma: {percentSum}%</span>
        </div>
        {error && <p className="mt-3 text-[13px] text-danger-fg">{error}</p>}
        <p className="mt-4 text-[12.5px] text-faint">
          As parcelas entram em contas a receber, na categoria {category?.name ?? 'de receitas'}. Datas e valores podem ser ajustados depois, uma a uma.
        </p>
      </div>
    </Modal>
  );
}
