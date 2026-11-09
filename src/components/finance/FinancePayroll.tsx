import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { monthKey, monthLabel, settledDate } from '../../lib/finance';
import { DEFAULT_PAYROLL_DAY, genericPayroll, payDate, payrollRows, payrollTotals, prevMonth, SALARY_CATEGORY, type PayrollRow } from '../../lib/payroll';
import { monthlyFromHourly } from '../../lib/pricing';
import type { FinanceEntry } from '../../lib/types';
import { cn, formatDate, formatDateShort, formatMoney, MONTHS_FULL, nowIso, today, uid } from '../../lib/utils';
import { Avatar, Badge, Button, Input, MetricRow } from '../ui';
import { MonthPicker } from './MonthPicker';
import { useFinance } from './useFinance';

const name = (key: string) => MONTHS_FULL[Number(key.slice(5, 7)) - 1].toLowerCase();

/**
 * Folha de pagamento: o salário de um mês é pago num dia fixo do mês seguinte (ex.: salário de
 * setembro pago em 05/10). Mostra, por pessoa, se a folha do mês já foi lançada e paga, e lança e
 * paga daqui mesmo. O pagamento entra nas contas do mês em que é pago (outubro), com a
 * referência ao mês trabalhado (setembro).
 */
export function FinancePayroll({ onOpen }: { onOpen: (e: FinanceEntry) => void }) {
  const { db, me, settings, patch, insertRows } = useData();
  const fin = useFinance();
  const toast = useToast();
  const t = today();
  // Padrão: a folha do mês passado, que é paga neste mês
  const [ref, setRef] = useState(prevMonth(monthKey(t)));
  const [busy, setBusy] = useState<string | null>(null);
  const day = settings.payroll_day ?? DEFAULT_PAYROLL_DAY;
  const due = payDate(ref, day);

  const salaryOf = useMemo(
    () => Object.fromEntries(db.finance_member_costs.map((c) => [c.user_id, c.hourly_cost > 0 ? monthlyFromHourly(c.hourly_cost) : 0])),
    [db.finance_member_costs],
  );
  const people = useMemo(() => [...db.profiles].sort((a, b) => a.name.localeCompare(b.name)), [db.profiles]);
  const rows = useMemo(
    () =>
      payrollRows({
        // Quem saiu da equipe só aparece se tiver salário lançado no mês
        members: people.map((p) => ({ id: p.id, salary: p.active ? (salaryOf[p.id] ?? 0) : 0 })),
        entries: fin.entries,
        ref,
        today: t,
      }),
    [people, salaryOf, fin.entries, ref, t],
  );
  const totals = payrollTotals(rows);
  const generic = genericPayroll(fin.entries, (id) => fin.categoryMap[id ?? '']?.name ?? '', ref);
  const noSalary = people.filter((p) => p.active && !(salaryOf[p.id] > 0) && !rows.some((r) => r.memberId === p.id));
  const toLaunch = rows.filter((r) => r.status === 'nao_lancado' && r.salary > 0);
  const salaryCategory = fin.categories.find((c) => c.kind === 'despesa' && c.active && SALARY_CATEGORY.test(c.name)) ?? null;
  const account = fin.accounts.find((a) => a.active && a.kind === 'banco') ?? fin.accounts.find((a) => a.active) ?? null;
  const profile = (id: string) => db.profiles.find((p) => p.id === id);

  const launch = async (targets: PayrollRow[]) => {
    if (!targets.length) return;
    setBusy(targets.length === 1 ? targets[0].memberId : 'todos');
    try {
      const now = nowIso();
      const entries: FinanceEntry[] = targets.map((r) => ({
        id: uid(),
        kind: 'despesa',
        description: `Salário ${profile(r.memberId)?.name ?? ''} · ${name(ref)}`.replace(/\s+·/, ' ·'),
        amount: r.salary,
        due_date: due,
        paid_at: null,
        account_id: account?.id ?? null,
        to_account_id: null,
        category_id: salaryCategory?.id ?? null,
        client_id: null,
        project_id: null,
        series_id: null,
        installment: null,
        installments: null,
        document: null,
        notes: null,
        reference_month: ref,
        member_id: r.memberId,
        created_by: me.id,
        created_at: now,
        updated_at: now,
      }));
      await insertRows('finance_entries', entries);
      toast.success(
        entries.length === 1
          ? `Salário de ${name(ref)} lançado, vence ${formatDateShort(due)}.`
          : `Folha de ${name(ref)} lançada: ${entries.length} salários, vencem ${formatDateShort(due)}.`,
      );
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };

  const pay = async (entry: FinanceEntry) => {
    setBusy(entry.id);
    try {
      const date = settledDate(entry.due_date, t);
      await fin.setPaid(entry, date);
      toast.success(`Pagamento registrado em ${formatDateShort(date)}.`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };

  const saveDay = async (value: number) => {
    const d = Math.min(28, Math.max(1, Math.round(value)));
    if (!Number.isFinite(d) || d === day) return;
    try {
      await patch('app_settings', 'office', { payroll_day: d });
      toast.success(`A folha passa a vencer no dia ${d} do mês seguinte.`);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="space-y-8" data-payroll={ref}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13px] text-muted">Salários referentes a</span>
          <MonthPicker value={ref} onChange={setRef} />
        </div>
        <label className="flex items-center gap-2 text-[13px] text-muted">
          Pagos no dia
          <Input
            type="number"
            min={1}
            max={28}
            key={day}
            defaultValue={day}
            onBlur={(e) => saveDay(Number(e.target.value))}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="h-8 w-16"
            aria-label="Dia do pagamento da folha"
          />
          do mês seguinte
        </label>
      </div>

      <p className="-mt-4 text-[13px] text-muted" data-payroll-rule>
        Salários de <b className="font-medium text-ink">{name(ref)}</b> pagos em <b className="font-medium text-ink">{formatDate(due)}</b>: entram nas contas de{' '}
        {name(monthKey(due))} (pagas com as entradas de {name(monthKey(due))}), com a referência a {name(ref)}.
      </p>

      <MetricRow
        label={`Folha de ${monthLabel(ref).toLowerCase()}`}
        items={[
          { label: 'Total da folha', value: formatMoney(totals.total), sub: `${totals.people} ${totals.people === 1 ? 'pessoa' : 'pessoas'}` },
          { label: 'Pago', value: formatMoney(totals.paid), tone: totals.paid > 0 ? 'text-success-fg' : undefined },
          { label: 'A pagar', value: formatMoney(totals.open), sub: `vence ${formatDateShort(due)}`, tone: rows.some((r) => r.status === 'vencido') ? 'text-danger-fg' : undefined },
          { label: 'Falta lançar', value: formatMoney(totals.missing), sub: toLaunch.length ? `${toLaunch.length} ${toLaunch.length === 1 ? 'salário' : 'salários'}` : 'tudo lançado' },
        ]}
      />

      {generic.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-[12px] border border-warning-line bg-warning-bg px-4 py-3 text-[13px] text-ink" data-payroll-generic>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-fg" strokeWidth={1.8} />
          <span>
            Já existe salário lançado sem pessoa em {name(monthKey(due))}:{' '}
            {generic.map((e) => `${e.description} (${formatMoney(e.amount)})`).join(', ')}. Se lançar a folha por pessoa, exclua ou ajuste esse lançamento para não
            contar a despesa duas vezes.
          </span>
        </div>
      )}

      <section aria-labelledby="folha-pessoas" className="panel">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="folha-pessoas" className="font-display text-[16.5px] font-semibold text-ink">
            Pessoas
          </h2>
          {toLaunch.length > 0 && (
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} loading={busy === 'todos'} onClick={() => launch(toLaunch)}>
              Lançar folha de {name(ref)} ({toLaunch.length})
            </Button>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="border-t border-hairline py-6 text-[13px] text-faint">
            Ninguém com salário cadastrado. Cadastre o salário de cada pessoa em <Link to="/equipe" className="text-accent-fg hover:underline">Equipe</Link>.
          </p>
        ) : (
          <ul>
            {rows.map((r) => {
              const p = profile(r.memberId);
              const e = r.entry;
              return (
                <li
                  key={r.memberId}
                  data-payroll-member={p?.name}
                  data-payroll-status={r.status}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-hairline py-3 sm:grid-cols-[minmax(0,1fr)_120px_170px_150px]"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    {p && <Avatar user={p} size="sm" />}
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] text-ink">{p?.name ?? 'Pessoa removida'}</span>
                      {r.salary > 0 && e && Math.abs(e.amount - r.salary) >= 0.01 && (
                        <span className="block text-[12px] text-faint">salário no cadastro: {formatMoney(r.salary)}</span>
                      )}
                    </span>
                  </span>
                  <span className="text-right text-[13.5px] tabular text-ink">{formatMoney(e?.amount ?? r.salary)}</span>
                  <span className="col-span-2 text-[12.5px] sm:col-span-1">
                    {r.status === 'pago' ? (
                      <Badge tone="success" dot>
                        Pago em {formatDateShort(e!.paid_at)}
                      </Badge>
                    ) : r.status === 'vencido' ? (
                      <Badge tone="danger">Vencido em {formatDateShort(e!.due_date)}</Badge>
                    ) : r.status === 'a_pagar' ? (
                      <span className="text-muted">A pagar em {formatDateShort(e!.due_date)}</span>
                    ) : (
                      <span className="text-faint">Não lançado</span>
                    )}
                  </span>
                  <span className={cn('col-span-2 flex items-center gap-1 sm:col-span-1 sm:justify-end')}>
                    {!e && r.salary > 0 && (
                      <Button size="xs" loading={busy === r.memberId} onClick={() => launch([r])} aria-label={`Lançar salário de ${p?.name}`}>
                        Lançar
                      </Button>
                    )}
                    {e && !e.paid_at && (
                      <Button size="xs" variant="primary" icon={<Check className="h-3.5 w-3.5" />} loading={busy === e.id} onClick={() => pay(e)} aria-label={`Pagar salário de ${p?.name}`}>
                        Pagar
                      </Button>
                    )}
                    {e && (
                      <Button size="xs" variant="ghost" onClick={() => onOpen(e)}>
                        Abrir
                      </Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {noSalary.length > 0 && (
          <p className="border-t border-hairline py-3 text-[12.5px] text-faint">
            Sem salário cadastrado: {noSalary.map((p) => p.name).join(', ')}.{' '}
            <Link to="/equipe" className="text-accent-fg hover:underline">
              Cadastrar em Equipe
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}
