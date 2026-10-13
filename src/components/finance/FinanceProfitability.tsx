import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { projectFinance, sum } from '../../lib/finance';
import { PROJECT_STATUS } from '../../lib/constants';
import { cn, formatMinutes, formatMoney, today } from '../../lib/utils';
import { Avatar, Button, SectionHeader } from '../ui';
import { DEFAULT_HOURS_PER_DAY, DEFAULT_WORK_DAYS, hourlyFromMonthly, monthlyFromHourly } from '../../lib/pricing';
import { MoneyInput } from './MoneyInput';
import { useFinance } from './useFinance';

function pct(v: number | null) {
  return v === null ? '—' : `${Math.round(v * 100)}%`;
}

/** Rentabilidade por projeto (honorários − despesas − custo das horas) e custo/hora da equipe. */
export function FinanceProfitability() {
  const { db, maps, can } = useData();
  const fin = useFinance();
  const t = today();

  const rows = useMemo(() => {
    const withData = new Set<string>();
    for (const e of fin.entries) if (e.project_id) withData.add(e.project_id);
    const taskProject = new Map(db.tasks.map((x) => [x.id, x.project_id]));
    for (const te of db.time_entries) {
      const pid = taskProject.get(te.task_id);
      if (pid) withData.add(pid);
    }
    return db.projects
      .filter((p) => p.status !== 'cancelado' && withData.has(p.id))
      .map((p) => ({
        project: p,
        f: projectFinance({ projectId: p.id, entries: fin.entries, tasks: db.tasks, timeEntries: db.time_entries, costs: db.finance_member_costs, today: t }),
      }))
      .sort((a, b) => b.f.result - a.f.result);
  }, [db.projects, db.tasks, db.time_entries, db.finance_member_costs, fin.entries, t]);

  const total = {
    contracted: sum(rows.map((r) => r.f.contracted)),
    received: sum(rows.map((r) => r.f.received)),
    expenses: sum(rows.map((r) => r.f.expenses)),
    hoursCost: sum(rows.map((r) => r.f.hoursCost)),
    result: sum(rows.map((r) => r.f.result)),
  };
  const missing = [...new Set(rows.flatMap((r) => r.f.missingCost))].map((id) => maps.profiles[id]?.name.split(' ')[0]).filter(Boolean);
  const cols = 'grid grid-cols-[minmax(0,1fr)_110px_110px] gap-x-4 xl:grid-cols-[minmax(0,1.4fr)_120px_120px_110px_130px_120px_64px]';

  return (
    <div className="flex flex-col gap-12">
      <section aria-labelledby="rent-projetos" className="panel">
        <SectionHeader
          id="rent-projetos"
          title="Resultado por projeto"
          aside={<span className="text-[12.5px] text-faint">honorários − despesas do projeto − custo das horas</span>}
        />
        {missing.length > 0 && (
          <p className="mb-3 text-[12.5px] text-warning-fg">
            Sem custo/hora cadastrado: {missing.join(', ')}. As horas dessas pessoas ficam fora do custo até você preencher abaixo.
          </p>
        )}
        <div className={cn(cols, 'border-b border-hairline pb-2.5 text-right text-[12.5px] text-faint')}>
          <span className="text-left">Projeto</span>
          <span>Honorários</span>
          <span className="hidden xl:block">Recebido</span>
          <span className="hidden xl:block">Despesas</span>
          <span className="hidden xl:block">Custo das horas</span>
          <span>Resultado</span>
          <span className="hidden xl:block">Margem</span>
        </div>
        {rows.length === 0 && <p className="py-6 text-[13px] text-faint">Lance honorários ou despesas ligados a projetos para ver a rentabilidade.</p>}
        <ul className="tabular">
          {rows.map(({ project: p, f }) => {
            const name = (
              <>
                <span className="block truncate text-[13.5px] text-ink">{p.name}</span>
                <span className="block truncate text-[12.5px] text-faint">{PROJECT_STATUS[p.status]?.label ?? p.status}</span>
                {f.overdue > 0 && <span className="block text-[12.5px] text-danger-fg">{formatMoney(f.overdue)} vencido</span>}
              </>
            );
            return (
              <li key={p.id} className={cn(cols, 'items-center border-b border-hairline py-3 text-right text-[13px]')}>
                {can('projetos') ? (
                  <Link to={`/projetos/${p.id}?aba=financeiro`} className="min-w-0 text-left hover:underline hover:decoration-stone-300 hover:underline-offset-4">
                    {name}
                  </Link>
                ) : (
                  <span className="min-w-0 text-left">{name}</span>
                )}
                <span className="text-stone-700">{formatMoney(f.contracted)}</span>
                <span className="hidden text-stone-700 xl:block">{formatMoney(f.received)}</span>
                <span className="hidden text-stone-700 xl:block">{formatMoney(f.expenses)}</span>
                <span className="hidden text-stone-700 xl:block" title={formatMinutes(f.minutes)}>
                  {formatMoney(f.hoursCost)}
                </span>
                <span className={cn('font-medium', f.result < 0 ? 'text-danger-fg' : 'text-ink')}>{formatMoney(f.result)}</span>
                <span className={cn('hidden xl:block', f.margin !== null && f.margin < 0 ? 'text-danger-fg' : 'text-muted')}>{pct(f.margin)}</span>
              </li>
            );
          })}
        </ul>
        {rows.length > 1 && (
          <div className={cn(cols, 'pt-3 text-right text-[13px] font-medium tabular text-ink')}>
            <span className="text-left">Total</span>
            <span>{formatMoney(total.contracted)}</span>
            <span className="hidden xl:block">{formatMoney(total.received)}</span>
            <span className="hidden xl:block">{formatMoney(total.expenses)}</span>
            <span className="hidden xl:block">{formatMoney(total.hoursCost)}</span>
            <span className={total.result < 0 ? 'text-danger-fg' : undefined}>{formatMoney(total.result)}</span>
            <span className="hidden text-muted xl:block">{pct(total.contracted > 0 ? total.result / total.contracted : null)}</span>
          </div>
        )}
      </section>

      <MemberCosts />
    </div>
  );
}

function MemberCosts() {
  const { db } = useData();
  const fin = useFinance();
  const toast = useToast();
  const members = db.profiles.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name));
  // Guardado por hora; aqui se digita por mês (salário + encargos), como o escritório pensa
  const currentMonthly = (id: string) => {
    const h = db.finance_member_costs.find((c) => c.user_id === id)?.hourly_cost;
    return h ? monthlyFromHourly(h) : null;
  };
  const [draft, setDraft] = useState<Record<string, number | null>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const save = async (id: string) => {
    setSaving(id);
    try {
      await fin.setMemberCost(id, hourlyFromMonthly(draft[id] ?? 0));
      setDraft((d) => {
        const next = { ...d };
        delete next[id];
        return next;
      });
      toast.success('Custo mensal salvo.');
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(null);
    }
  };

  return (
    <section aria-labelledby="custo-hora" className="panel max-w-2xl">
      <SectionHeader id="custo-hora" title="Custo da equipe" />
      <p className="mb-3 text-[12.5px] text-muted">
        Quanto cada pessoa custa ao escritório <b className="font-semibold text-ink">por mês</b>: salário, bolsa ou retirada + encargos e benefícios.
        O sistema divide por {DEFAULT_WORK_DAYS} dias úteis para o custo do dia (ex.: R$ 500 por mês ÷ {DEFAULT_WORK_DAYS} dias = R$ 23,81 por dia) e
        usa esse valor na Precificação e na rentabilidade dos projetos. Só quem tem o módulo Financeiro vê estes valores.
      </p>
      <ul>
        {members.map((p) => {
          const value = p.id in draft ? draft[p.id] : currentMonthly(p.id);
          const dirty = p.id in draft && draft[p.id] !== currentMonthly(p.id);
          const day = value ? value / DEFAULT_WORK_DAYS : null;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-hairline py-2.5" data-member-cost={p.id}>
              <Avatar user={p} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] text-ink">{p.name}</span>
                <span className="block truncate text-[12.5px] text-faint">{p.job_title || (p.role === 'admin' ? 'Administrador' : 'Membro')}</span>
                {day ? (
                  <span className="block whitespace-nowrap text-[12px] tabular text-muted" data-member-day>
                    {formatMoney(day)} por dia · {formatMoney(day / DEFAULT_HOURS_PER_DAY)} por hora
                  </span>
                ) : null}
              </span>
              <div className="w-36">
                <MoneyInput value={value} onChange={(n) => setDraft((d) => ({ ...d, [p.id]: n }))} aria-label={`Custo por mês de ${p.name}`} />
              </div>
              <span className="w-9 text-[12.5px] text-faint">/mês</span>
              <Button size="sm" variant={dirty ? 'primary' : 'ghost'} disabled={!dirty} loading={saving === p.id} onClick={() => save(p.id)}>
                Salvar
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
