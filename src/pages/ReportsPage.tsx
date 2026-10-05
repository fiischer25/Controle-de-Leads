import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useData } from '../context/DataContext';
import { CSS_COLOR } from '../lib/status';
import { entryMinutes } from '../lib/domain';
import { addDays, cn, diffDays, downloadFile, formatDate, formatCurrency, formatMinutes, formatMoney, formatNumber, MONTHS_FULL, toCsv, toDateKey, today } from '../lib/utils';
import { planSummary } from '../lib/paymentPlan';
import { Avatar, BarRow, Button, Listbox, MetricRow, PageHeader, SectionHeader } from '../components/ui';
import { MonthBars } from '../components/charts/MonthBars';

const PERIODS = [
  { id: '30', label: 'Últimos 30 dias' },
  { id: '90', label: 'Últimos 90 dias' },
  { id: '180', label: 'Últimos 6 meses' },
  { id: '365', label: 'Últimos 12 meses' },
];

export default function ReportsPage() {
  const { db, maps, can } = useData();
  const [period, setPeriod] = useState('90');
  const [showTable, setShowTable] = useState(false);
  const t = today();
  const since = addDays(t, -Number(period));
  const dateOf = (iso: string) => toDateKey(new Date(iso));

  const r = useMemo(() => {
    const kind = (id: string) => maps.stages[id]?.kind;
    const leadsIn = db.leads.filter((l) => dateOf(l.created_at) >= since);
    const decided = db.leads.filter((l) => l.closed_at && dateOf(l.closed_at) >= since);
    const won = decided.filter((l) => kind(l.stage_id) === 'won');
    const lost = decided.filter((l) => kind(l.stage_id) === 'lost');
    const avgClose = won.length ? Math.round(won.reduce((a, l) => a + diffDays(dateOf(l.created_at), dateOf(l.closed_at!)), 0) / won.length) : null;

    const bySource: Record<string, { name: string; total: number; won: number; lost: number }> = {};
    leadsIn.forEach((l) => {
      const k = l.source_id ?? 'none';
      bySource[k] ||= { name: k === 'none' ? 'Não informado' : maps.sources[k]?.name ?? '—', total: 0, won: 0, lost: 0 };
      bySource[k].total++;
      if (kind(l.stage_id) === 'won') bySource[k].won++;
      if (kind(l.stage_id) === 'lost') bySource[k].lost++;
    });

    const lostReasons: Record<string, number> = {};
    lost.forEach((l) => {
      const reason = (l.lost_reason ?? 'Não informado').split(' — ')[0];
      lostReasons[reason] = (lostReasons[reason] ?? 0) + 1;
    });

    const byCity: Record<string, number> = {};
    leadsIn.forEach((l) => (byCity[l.city] = (byCity[l.city] ?? 0) + 1));

    // Leads por mês (últimos 12 meses)
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return {
        key,
        label: MONTHS_FULL[d.getMonth()].slice(0, 3),
        leads: db.leads.filter((l) => l.created_at.slice(0, 7) === key).length,
        won: db.leads.filter((l) => l.closed_at?.slice(0, 7) === key && kind(l.stage_id) === 'won').length,
        delivered: db.projects.filter((p) => p.completed_at?.slice(0, 7) === key).length,
      };
    });

    // Produção
    const completed = db.projects.filter((p) => p.status === 'concluido' && p.completed_at && dateOf(p.completed_at) >= since);
    const onTime = completed.filter((p) => !p.due_date || dateOf(p.completed_at!) <= p.due_date).length;
    const avgDuration = completed.length ? Math.round(completed.reduce((a, p) => a + diffDays(p.start_date, dateOf(p.completed_at!)), 0) / completed.length) : null;
    const tasksDone = db.tasks.filter((x) => x.status === 'done' && x.completed_at && dateOf(x.completed_at) >= since);
    const tasksOnTime = tasksDone.filter((x) => !x.due_date || dateOf(x.completed_at!) <= x.due_date).length;

    const entries = db.time_entries.filter((e) => dateOf(e.started_at) >= since);
    const totalMin = entries.reduce((a, e) => a + entryMinutes(e), 0);
    const byMember: Record<string, number> = {};
    const byProject: Record<string, number> = {};
    const byType: Record<string, number> = {};
    entries.forEach((e) => {
      const m = entryMinutes(e);
      byMember[e.user_id] = (byMember[e.user_id] ?? 0) + m;
      const task = maps.tasks[e.task_id];
      const project = task?.project_id ? maps.projects[task.project_id] : null;
      const pk = project?.id ?? 'avulsas';
      byProject[pk] = (byProject[pk] ?? 0) + m;
      const tk = project ? maps.types[project.project_type_id]?.name ?? '—' : 'Tarefas avulsas';
      byType[tk] = (byType[tk] ?? 0) + m;
    });

    // Horas por m² (produtividade por tipo) — projetos concluídos com área
    const perSqm = db.projects
      .filter((p) => p.status === 'concluido' && p.area_m2)
      .map((p) => {
        const ids = new Set(db.tasks.filter((x) => x.project_id === p.id).map((x) => x.id));
        const min = db.time_entries.filter((e) => ids.has(e.task_id)).reduce((a, e) => a + entryMinutes(e), 0);
        return { p, hoursPerSqm: min / 60 / (p.area_m2 ?? 1) };
      })
      .filter((x) => x.hoursPerSqm > 0);

    return {
      leadsIn, won, lost, avgClose, sources: Object.values(bySource).sort((a, b) => b.total - a.total),
      lostReasons: Object.entries(lostReasons).sort((a, b) => b[1] - a[1]),
      cities: Object.entries(byCity).sort((a, b) => b[1] - a[1]).slice(0, 8),
      months, completed, onTime, avgDuration, tasksDone, tasksOnTime, entries, totalMin,
      byMember: Object.entries(byMember).sort((a, b) => b[1] - a[1]),
      byProject: Object.entries(byProject).sort((a, b) => b[1] - a[1]).slice(0, 10),
      byType: Object.entries(byType).sort((a, b) => b[1] - a[1]),
      perSqm,
    };
   
  }, [db, maps, since]);

  const conv = r.won.length + r.lost.length ? Math.round((r.won.length / (r.won.length + r.lost.length)) * 100) : null;

  // Valores: contratos fechados no período (forma de pagamento do ganho) e, com o Financeiro,
  // o que foi recebido e o que falta receber
  const finance = can('financeiro');
  const contractValue = (l: (typeof r.won)[number]) => l.payment_plan?.total ?? l.proposal_value ?? 0;
  const contracted = r.won.reduce((a, l) => a + contractValue(l), 0);
  const receitas = db.finance_entries.filter((e) => e.kind === 'receita');
  const receivedInPeriod = receitas.filter((e) => e.paid_at && e.paid_at >= since && e.paid_at <= t).reduce((a, e) => a + e.amount, 0);
  const openReceitas = receitas.filter((e) => !e.paid_at);
  const toReceive = openReceitas.reduce((a, e) => a + e.amount, 0);
  const overdue = openReceitas.filter((e) => e.due_date < t).reduce((a, e) => a + e.amount, 0);
  // Recebido do contrato: parcelas da oportunidade e lançamentos do cliente que ela virou
  const receivedByLead = (l: (typeof r.won)[number]) =>
    receitas.filter((e) => e.paid_at && (e.lead_id === l.id || (l.client_id && e.client_id === l.client_id))).reduce((a, e) => a + e.amount, 0);

  const exportTimesheet = () => {
    downloadFile(
      `horas-${since}-a-${t}.csv`,
      toCsv(
        r.entries
          .sort((a, b) => a.started_at.localeCompare(b.started_at))
          .map((e) => {
            const task = maps.tasks[e.task_id];
            const project = task?.project_id ? maps.projects[task.project_id] : null;
            return {
              Data: formatDate(dateOf(e.started_at)),
              Pessoa: maps.profiles[e.user_id]?.name ?? '',
              Projeto: project?.name ?? 'Avulsa',
              Etapa: task?.phase ?? '',
              Tarefa: task?.title ?? '(removida)',
              Horas: (entryMinutes(e) / 60).toFixed(2).replace('.', ','),
              Observação: e.note ?? '',
            };
          }),
      ),
      'text/csv',
    );
  };

  const delivered = r.completed.length;
  // Sem o módulo Comercial, os números de leads e conversão ficam de fora.
  const commercial = can('comercial');
  const allSeries: Array<{
    key: 'leads' | 'won' | 'delivered';
    title: string;
    total: number;
  }> = [
    {
      key: 'leads',
      title: 'Leads recebidos',
      total: r.months.reduce((a, m) => a + m.leads, 0),
    },
    {
      key: 'won',
      title: 'Fechados',
      total: r.months.reduce((a, m) => a + m.won, 0),
    },
    {
      key: 'delivered',
      title: 'Projetos entregues',
      total: r.months.reduce((a, m) => a + m.delivered, 0),
    },
  ];
  const series = commercial ? allSeries : allSeries.filter((s) => s.key === 'delivered');

  return (
    <div>
      <PageHeader
        title="Relatórios"
        description={
          commercial ? 'Desempenho comercial, valores dos contratos e produtividade da equipe' : 'Entregas e produtividade da equipe'
        }
        actions={
          <>
            <Listbox
              value={period}
              onChange={setPeriod}
              aria-label="Período"
              options={PERIODS.map((p) => ({ value: p.id, label: p.label }))}
              className="h-9 w-auto gap-1.5 border-transparent bg-transparent px-3 text-body font-medium shadow-none hover:bg-ink/5"
            />
            <Button variant="ghost" icon={<Download className="h-4 w-4" strokeWidth={1.6} />} onClick={exportTimesheet}>
              Exportar horas
            </Button>
          </>
        }
      />

      <div className="space-y-12 md:space-y-14">
        <MetricRow
          label={PERIODS.find((p) => p.id === period)?.label}
          items={[
            ...(commercial
              ? [
                  { label: 'Novos leads', value: r.leadsIn.length },
                  {
                    label: 'Conversão',
                    value: conv === null ? '—' : `${conv}%`,
                    sub: `${r.won.length} ganhos · ${r.lost.length} perdidos`,
                  },
                  {
                    label: 'Tempo para fechar',
                    value: r.avgClose === null ? '—' : `${r.avgClose}d`,
                    sub: 'média dos ganhos',
                  },
                ]
              : []),
            {
              label: 'Projetos entregues',
              value: delivered,
              sub: delivered ? `${Math.round((r.onTime / delivered) * 100)}% no prazo` : 'nenhum no período',
            },
            {
              label: 'Tarefas no prazo',
              value: r.tasksDone.length ? `${Math.round((r.tasksOnTime / r.tasksDone.length) * 100)}%` : '—',
              sub: `${r.tasksDone.length} concluídas`,
            },
            {
              label: 'Horas registradas',
              value: `${formatNumber(r.totalMin / 60, 0)}h`,
              sub: r.avgDuration ? `${formatMinutes(r.totalMin)} · ${r.avgDuration} dias por projeto` : formatMinutes(r.totalMin),
            },
          ]}
        />

        {(commercial || finance) && (
          <section aria-labelledby="valores" className="panel">
            <SectionHeader id="valores" title="Valores" aside={<span className="text-[12.5px] text-faint">{PERIODS.find((p) => p.id === period)?.label}</span>} />
            <MetricRow
              items={[
                ...(commercial
                  ? [
                      { label: 'Contratos fechados', value: formatCurrency(contracted), sub: `${r.won.length} ${r.won.length === 1 ? 'ganho' : 'ganhos'} no período` },
                      { label: 'Ticket médio', value: r.won.length ? formatCurrency(contracted / r.won.length) : '—', sub: 'valor fechado por contrato' },
                    ]
                  : []),
                ...(finance
                  ? [
                      { label: 'Recebido no período', value: formatCurrency(receivedInPeriod), sub: 'receitas pagas' },
                      { label: 'A receber', value: formatCurrency(toReceive), sub: `${openReceitas.length} em aberto` },
                      { label: 'Atrasado', value: formatCurrency(overdue), tone: overdue > 0 ? 'text-danger-fg' : undefined, sub: overdue > 0 ? 'receitas vencidas' : 'em dia' },
                    ]
                  : []),
              ]}
            />
            {commercial && r.won.length > 0 && (
              <ul className="mt-6">
                {[...r.won]
                  .sort((a, b) => contractValue(b) - contractValue(a))
                  .map((l) => (
                    <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-0.5 border-t border-hairline py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_120px_170px]">
                      <span className="truncate text-body text-ink">{l.name}</span>
                      <span className="order-3 col-span-2 truncate text-[12.5px] text-faint md:order-none md:col-span-1">
                        {l.payment_plan ? planSummary(l.payment_plan.rows) : 'forma de pagamento não definida'}
                      </span>
                      <span className="text-right text-body tabular text-ink">{formatMoney(contractValue(l))}</span>
                      {finance && <span className="hidden text-right text-[12.5px] tabular text-success-fg md:block">{formatMoney(receivedByLead(l))} recebido</span>}
                    </li>
                  ))}
              </ul>
            )}
          </section>
        )}

        {/* Últimos 12 meses: três gráficos pequenos de uma série cada (sem legenda de cores) */}
        <section aria-labelledby="meses" className="panel">
          <SectionHeader
            id="meses"
            title="Últimos 12 meses"
            aside={
              <button type="button" onClick={() => setShowTable((v) => !v)} className="text-[13px] text-faint hover:text-ink">
                {showTable ? 'Ver gráficos' : 'Ver tabela'}
              </button>
            }
          />
          {showTable ? (
            <div className="overflow-x-auto border-t border-hairline">
              <table className="w-full text-[13px]">
                <thead className="text-left text-[12.5px] text-faint">
                  <tr className="border-b border-hairline">
                    <th className="py-2.5 pr-4 font-normal">Mês</th>
                    {series.map((s) => (
                      <th key={s.key} className="py-2.5 pl-4 text-right font-normal">
                        {s.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tabular">
                  {r.months.map((m) => (
                    <tr key={m.key} className="border-b border-hairline">
                      <td className="py-2.5 pr-4 text-stone-700">{m.label}</td>
                      {series.map((s) => (
                        <td key={s.key} className="py-2.5 pl-4 text-right text-ink">
                          {m[s.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={cn('grid gap-10 border-t border-hairline pt-5 md:gap-8', commercial ? 'md:grid-cols-3' : 'md:max-w-md')}>
              {series.map((s) => (
                <MonthBars key={s.key} title={s.title} total={s.total} months={r.months.map((m) => ({ key: m.key, label: m.label, value: m[s.key] }))} />
              ))}
            </div>
          )}
        </section>

        {commercial && (
          <div className="grid gap-12 lg:grid-cols-[1fr_340px] lg:gap-16">
            <section aria-labelledby="origem" className="panel">
              <SectionHeader id="origem" title="Como os clientes chegam" aside={<span className="text-[12.5px] text-faint">leads que entraram no período</span>} />
              <div className="grid grid-cols-[minmax(0,1fr)_56px_56px_64px_80px] gap-4 border-b border-hairline pb-2.5 text-right text-[12.5px] text-faint">
                <span className="text-left">Origem</span>
                <span>Leads</span>
                <span>Ganhos</span>
                <span>Perdidos</span>
                <span>Conversão</span>
              </div>
              {r.sources.length === 0 && <p className="py-6 text-[13px] text-faint">Sem leads no período.</p>}
              <ul className="tabular">
                {r.sources.map((src) => {
                  const c = src.won + src.lost ? Math.round((src.won / (src.won + src.lost)) * 100) : null;
                  return (
                    <li key={src.name} className="grid grid-cols-[minmax(0,1fr)_56px_56px_64px_80px] gap-4 border-b border-hairline py-3 text-right text-[13px]">
                      <span className="truncate text-left text-ink">{src.name}</span>
                      <span className="text-stone-700">{src.total}</span>
                      <span className="text-stone-700">{src.won}</span>
                      <span className="text-stone-700">{src.lost}</span>
                      <span className="font-medium text-ink">{c === null ? '—' : `${c}%`}</span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <div className="space-y-12">
              <section aria-labelledby="perdas" className="panel">
                <SectionHeader id="perdas" title="Motivos de perda" />
                <div className="space-y-4 border-t border-hairline pt-4">
                  {r.lostReasons.length === 0 && <p className="text-[13px] text-faint">Nenhuma perda no período.</p>}
                  {r.lostReasons.map(([reason, n]) => (
                    <BarRow key={reason} label={reason} value={n} max={r.lostReasons[0][1]} color={CSS_COLOR.stone(500)} />
                  ))}
                </div>
              </section>
              <section aria-labelledby="cidades" className="panel">
                <SectionHeader id="cidades" title="Leads por cidade" />
                <div className="space-y-4 border-t border-hairline pt-4">
                  {r.cities.length === 0 && <p className="text-[13px] text-faint">Sem dados.</p>}
                  {r.cities.map(([city, n]) => (
                    <BarRow key={city} label={city} value={n} max={r.cities[0][1]} />
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}

        <div className="grid gap-12 lg:grid-cols-3 lg:gap-12">
          <section aria-labelledby="h-pessoa" className="panel">
            <SectionHeader id="h-pessoa" title="Horas por pessoa" />
            <div className="space-y-4 border-t border-hairline pt-4">
              {r.byMember.length === 0 && <p className="text-[13px] text-faint">Nenhuma hora registrada.</p>}
              {r.byMember.map(([uid, min]) => {
                const u = maps.profiles[uid];
                return (
                  <BarRow
                    key={uid}
                    label={
                      <span className="inline-flex items-center gap-2">
                        <Avatar user={u} size="xs" />
                        {u?.name ?? '—'}
                      </span>
                    }
                    value={Math.round(min / 60)}
                    suffix="h"
                    max={Math.round(r.byMember[0][1] / 60) || 1}
                    color={CSS_COLOR.brand(500)}
                    title={formatMinutes(min)}
                  />
                );
              })}
            </div>
          </section>
          <section aria-labelledby="h-projeto" className="panel">
            <SectionHeader id="h-projeto" title="Horas por projeto" aside={<span className="text-[12.5px] text-faint">top 10</span>} />
            <div className="space-y-4 border-t border-hairline pt-4">
              {r.byProject.length === 0 && <p className="text-[13px] text-faint">Nenhuma hora registrada.</p>}
              {r.byProject.map(([pid, min]) => (
                <BarRow
                  key={pid}
                  label={pid === 'avulsas' ? 'Tarefas avulsas' : maps.projects[pid]?.name ?? '—'}
                  value={Math.round(min / 60)}
                  suffix="h"
                  max={Math.round(r.byProject[0][1] / 60) || 1}
                  color={CSS_COLOR.brand(500)}
                  title={formatMinutes(min)}
                />
              ))}
            </div>
          </section>
          <section aria-labelledby="h-tipo" className="panel">
            <SectionHeader id="h-tipo" title="Horas por tipo" />
            <div className="space-y-4 border-t border-hairline pt-4">
              {r.byType.length === 0 && <p className="text-[13px] text-faint">Nenhuma hora registrada.</p>}
              {r.byType.map(([name, min]) => (
                <BarRow
                  key={name}
                  label={name}
                  value={Math.round(min / 60)}
                  suffix="h"
                  max={Math.round(r.byType[0][1] / 60) || 1}
                  color={CSS_COLOR.brand(500)}
                  title={formatMinutes(min)}
                />
              ))}
            </div>
            {r.perSqm.length > 0 && (
              <p className="mt-5 border-t border-hairline pt-3 text-[12.5px] text-muted">
                Média em projetos concluídos:{' '}
                <span className="text-ink">{formatNumber(r.perSqm.reduce((a, x) => a + x.hoursPerSqm, 0) / r.perSqm.length, 2)} h/m²</span> — útil para estimar prazos de
                novas propostas.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
