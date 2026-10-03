import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { projectFinance, sum } from '../../lib/finance';
import { PROJECT_STATUS } from '../../lib/constants';
import { cn, formatMinutes, formatMoney, today } from '../../lib/utils';
import { Avatar, Button, SectionHeader } from '../ui';
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
  const cols = 'grid grid-cols-[minmax(0,1fr)_110px_110px] gap-x-4 md:grid-cols-[minmax(0,1.4fr)_120px_120px_110px_130px_120px_64px]';

  return (
    <div className="flex flex-col gap-12">
      <section aria-labelledby="rent-projetos">
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
          <span className="hidden md:block">Recebido</span>
          <span className="hidden md:block">Despesas</span>
          <span className="hidden md:block">Custo das horas</span>
          <span>Resultado</span>
          <span className="hidden md:block">Margem</span>
        </div>
        {rows.length === 0 && <p className="py-6 text-[13px] text-faint">Lance honorários ou despesas ligados a projetos para ver a rentabilidade.</p>}
        <ul className="tabular">
          {rows.map(({ project: p, f }) => {
            const name = (
              <>
                <span className="block truncate text-[13.5px] text-ink">{p.name}</span>
                <span className="block truncate text-[12.5px] text-faint">
                  {PROJECT_STATUS[p.status]?.label ?? p.status}
                  {f.overdue > 0 && <span className="text-danger-fg"> · {formatMoney(f.overdue)} vencido</span>}
                </span>
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
                <span className="hidden text-stone-700 md:block">{formatMoney(f.received)}</span>
                <span className="hidden text-stone-700 md:block">{formatMoney(f.expenses)}</span>
                <span className="hidden text-stone-700 md:block" title={formatMinutes(f.minutes)}>
                  {formatMoney(f.hoursCost)}
                </span>
                <span className={cn('font-medium', f.result < 0 ? 'text-danger-fg' : 'text-ink')}>{formatMoney(f.result)}</span>
                <span className={cn('hidden md:block', f.margin !== null && f.margin < 0 ? 'text-danger-fg' : 'text-muted')}>{pct(f.margin)}</span>
              </li>
            );
          })}
        </ul>
        {rows.length > 1 && (
          <div className={cn(cols, 'pt-3 text-right text-[13px] font-medium tabular text-ink')}>
            <span className="text-left">Total</span>
            <span>{formatMoney(total.contracted)}</span>
            <span className="hidden md:block">{formatMoney(total.received)}</span>
            <span className="hidden md:block">{formatMoney(total.expenses)}</span>
            <span className="hidden md:block">{formatMoney(total.hoursCost)}</span>
            <span className={total.result < 0 ? 'text-danger-fg' : undefined}>{formatMoney(total.result)}</span>
            <span className="hidden text-muted md:block">{pct(total.contracted > 0 ? total.result / total.contracted : null)}</span>
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
  const current = (id: string) => db.finance_member_costs.find((c) => c.user_id === id)?.hourly_cost ?? null;
  const [draft, setDraft] = useState<Record<string, number | null>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const save = async (id: string) => {
    setSaving(id);
    try {
      await fin.setMemberCost(id, draft[id] ?? 0);
      setDraft((d) => {
        const next = { ...d };
        delete next[id];
        return next;
      });
      toast.success('Custo/hora salvo.');
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(null);
    }
  };

  return (
    <section aria-labelledby="custo-hora" className="max-w-2xl">
      <SectionHeader id="custo-hora" title="Custo por hora da equipe" />
      <p className="mb-3 text-[12.5px] text-muted">
        Quanto cada hora da pessoa custa ao escritório: salário ou retirada + encargos e benefícios, dividido pelas horas trabalhadas no mês
        (ex.: R$ 8.000 ÷ 160 h = R$ 50/h). Só quem tem o módulo Financeiro vê estes valores.
      </p>
      <ul>
        {members.map((p) => {
          const value = p.id in draft ? draft[p.id] : current(p.id);
          const dirty = p.id in draft && draft[p.id] !== current(p.id);
          return (
            <li key={p.id} className="flex items-center gap-3 border-t border-hairline py-2.5">
              <Avatar user={p} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] text-ink">{p.name}</span>
                <span className="block truncate text-[12.5px] text-faint">{p.job_title || (p.role === 'admin' ? 'Administrador' : 'Membro')}</span>
              </span>
              <div className="w-36">
                <MoneyInput value={value} onChange={(n) => setDraft((d) => ({ ...d, [p.id]: n }))} aria-label={`Custo por hora de ${p.name}`} />
              </div>
              <span className="w-6 text-[12.5px] text-faint">/h</span>
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
