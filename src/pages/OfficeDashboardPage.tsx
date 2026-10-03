import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useData } from '../context/DataContext';
import { openCreate } from '../lib/create';
import { isProjectActive, totalMinutes } from '../lib/domain';
import { TASK_STATUS_ORDER } from '../lib/constants';
import { CSS_COLOR, TASK_STATUS_STYLE } from '../lib/status';
import { addDays, cn, diffDays, formatCurrency, formatDateShort, formatMinutes, MONTHS_FULL, startOfWeek, today, toDateKey } from '../lib/utils';
import { ActionLink, BarRow, Button, MetricRow, PageHeader, SectionHeader, Tabs } from '../components/ui';
import { MobileTimerBar } from '../components/layout/MobileTimerBar';
import { AgendaView } from '../components/agenda/AgendaView';
import { MonthBars } from '../components/charts/MonthBars';
import { useHomeData } from '../components/dashboard/useHomeData';
import { FunnelSection, ProjectsSection, TeamSection, TodayColumn } from '../components/dashboard/HomeSections';
import { useFinance } from '../components/finance/useFinance';
import { monthKey, monthTotals, sum } from '../lib/finance';
import { useProjectSummaries } from '../components/projects/useProjectSummaries';

type Tab = 'geral' | 'agenda';

function longDate() {
  const s = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Dashboard do escritório: tela inicial do administrador, com todas as informações do
 * escritório: andamento de todos os projetos (números, etapas, tarefas, entregas),
 * comercial (funil, retornos, conversão), carga da equipe e a agenda do escritório.
 */
export default function OfficeDashboardPage() {
  const { db, maps, me, settings, can } = useData();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('aba') === 'agenda' ? 'agenda' : 'geral';
  const setTab = (t: Tab) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (t === 'agenda') next.set('aba', 'agenda');
        else {
          next.delete('aba');
          next.delete('evento');
        }
        return next;
      },
      { replace: true },
    );

  const home = useHomeData('office');
  const summaries = useProjectSummaries();

  const charts = useMemo(() => {
    const t = today();
    const active = summaries.filter((s) => isProjectActive(s.project));
    const activeIds = new Set(active.map((s) => s.project.id));

    // Etapa atual de cada projeto ativo
    const byPhase: Record<string, number> = {};
    active.forEach((s) => (byPhase[s.phase] = (byPhase[s.phase] ?? 0) + 1));
    const phases = Object.entries(byPhase).sort((a, b) => b[1] - a[1]);

    // Tarefas dos projetos ativos por status
    const projectTasks = db.tasks.filter((x) => x.project_id && activeIds.has(x.project_id));
    const byStatus = TASK_STATUS_ORDER.map((st) => ({ status: st, count: projectTasks.filter((x) => x.status === st).length }));
    const doneShare = projectTasks.length ? Math.round((projectTasks.filter((x) => x.status === 'done').length / projectTasks.length) * 100) : null;

    // Entregas previstas nos próximos 6 meses
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return { key, label: MONTHS_FULL[d.getMonth()].slice(0, 3), value: active.filter((s) => s.project.due_date?.slice(0, 7) === key).length };
    });

    const year = String(now.getFullYear());
    const ws = startOfWeek(t);
    return {
      active: active.length,
      overdue: active.filter((s) => s.deadline === 'overdue').length,
      soon: active.filter((s) => s.deadline === 'soon' || s.deadline === 'today').length,
      lateTasks: active.reduce((acc, s) => acc + s.overdueTasks, 0),
      deliveredYear: summaries.filter((s) => s.project.status === 'concluido' && (s.project.completed_at ?? '').startsWith(year)).length,
      weekMinutes: totalMinutes(db.time_entries.filter((e) => toDateKey(new Date(e.started_at)) >= ws)),
      nextDelivery: active
        .filter((s) => s.project.due_date && s.project.due_date >= t)
        .sort((a, b) => (a.project.due_date ?? '').localeCompare(b.project.due_date ?? ''))[0],
      phases,
      byStatus,
      doneShare,
      projectTaskCount: projectTasks.length,
      months,
      monthsTotal: months.reduce((a, m) => a + m.value, 0),
      in30: active.filter((s) => s.project.due_date && s.project.due_date >= t && s.project.due_date <= addDays(t, 30)).length,
    };
  }, [summaries, db.tasks, db.time_entries]);

  // Comercial do escritório
  const commercial = useMemo(() => {
    const t = today();
    const month = t.slice(0, 7);
    const staleDays = settings.lead_stale_days || 7;
    const open = db.leads.filter((l) => maps.stages[l.stage_id]?.kind === 'open');
    const followups = open
      .filter((l) => l.next_contact_date && l.next_contact_date <= t)
      .sort((a, b) => (a.next_contact_date ?? '').localeCompare(b.next_contact_date ?? ''));
    return {
      followups,
      newThisMonth: db.leads.filter((l) => l.created_at.slice(0, 7) === month).length,
      stale: open.filter((l) => diffDays(t, (l.stage_changed_at ?? l.created_at).slice(0, 10)) >= staleDays).length,
      staleDays,
    };
  }, [db.leads, maps.stages, settings.lead_stale_days]);

  // Financeiro (só para quem tem o módulo)
  const fin = useFinance();
  const money = useMemo(() => {
    const t = today();
    const in30 = addDays(t, 30);
    const open = fin.entries.filter((e) => !e.paid_at && e.kind !== 'transferencia');
    const m = monthTotals(fin.entries, monthKey(t));
    return {
      receive30: sum(open.filter((e) => e.kind === 'receita' && e.due_date >= t && e.due_date <= in30).map((e) => e.amount)),
      pay30: sum(open.filter((e) => e.kind === 'despesa' && e.due_date >= t && e.due_date <= in30).map((e) => e.amount)),
      overdueIn: sum(open.filter((e) => e.kind === 'receita' && e.due_date < t).map((e) => e.amount)),
      overdueOut: sum(open.filter((e) => e.kind === 'despesa' && e.due_date < t).map((e) => e.amount)),
      result: Math.round((m.inPaid - m.outPaid) * 100) / 100,
    };
  }, [fin.entries]);

  const calendarConnected = !!(settings.calendar_embed_url || me.calendar_embed_url);
  const attention = home.items.length;
  const maxPhase = Math.max(1, ...charts.phases.map(([, n]) => n));
  const maxStatus = Math.max(1, ...charts.byStatus.map((b) => b.count));

  return (
    <div>
      <PageHeader
        eyebrow={longDate()}
        title="Dashboard do escritório"
        description={
          <>
            {charts.active} em andamento
            {charts.overdue > 0 && (
              <>
                {' · '}
                <span className="text-danger-fg">{charts.overdue} com prazo vencido</span>
              </>
            )}
            {charts.soon > 0 && (
              <>
                {' · '}
                <span className="text-warning-fg">
                  {charts.soon} {charts.soon === 1 ? 'vence' : 'vencem'} em {home.soonDays} dias
                </span>
              </>
            )}
            {charts.lateTasks > 0 && (
              <>
                {' · '}
                <span className="text-danger-fg">
                  {charts.lateTasks} {charts.lateTasks === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}
                </span>
              </>
            )}
            {commercial.followups.length > 0 && (
              <>
                {' · '}
                {commercial.followups.length} {commercial.followups.length === 1 ? 'retorno de lead pendente' : 'retornos de leads pendentes'}
              </>
            )}
            {attention > 0 && (
              <>
                {' · '}
                <ActionLink to="/tarefas?aba=atencao" className="text-[length:inherit]">
                  {attention} {attention === 1 ? 'item pede' : 'itens pedem'} sua atenção
                </ActionLink>
              </>
            )}
          </>
        }
        actions={
          <div className="hidden items-center gap-2 md:flex">
            <Button variant="ghost" icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => openCreate('event')}>
              Reunião
            </Button>
            <Button variant={can('projetos') ? 'ghost' : 'primary'} icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => openCreate('task')}>
              Tarefa
            </Button>
            {can('projetos') && (
              <Button variant="primary" icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => openCreate('project')}>
                Projeto
              </Button>
            )}
          </div>
        }
      />

      <MobileTimerBar className="-mt-3 mb-8" />

      <Tabs<Tab>
        tabs={[
          { id: 'geral', label: 'Visão geral' },
          { id: 'agenda', label: 'Agenda' },
        ]}
        value={tab}
        onChange={setTab}
        underline={1}
        bordered={tab === 'agenda'}
        className="border-hairline"
      />

      {/* Na visão geral, a linha dos números faz a separação das abas. */}
      <div className={tab === 'agenda' ? 'mt-8 md:mt-10' : 'mt-4'}>
        {tab === 'agenda' ? (
          <AgendaView />
        ) : (
          <div className="flex flex-col gap-12 md:gap-14">
            <MetricRow
              label="Projetos"
              items={[
                { label: 'Em andamento', value: charts.active, to: can('projetos') ? '/projetos' : undefined },
                { label: 'Prazo vencido', value: charts.overdue, tone: charts.overdue ? 'text-danger-fg' : undefined },
                { label: `Vencem em ${home.soonDays} dias`, value: charts.soon, tone: charts.soon ? 'text-warning-fg' : undefined },
                { label: 'Tarefas atrasadas', value: charts.lateTasks, tone: charts.lateTasks ? 'text-danger-fg' : undefined },
                {
                  label: 'Tarefas concluídas',
                  value: charts.doneShare === null ? '—' : `${charts.doneShare}%`,
                  sub: `${charts.projectTaskCount} nos projetos ativos`,
                },
                { label: 'Horas na semana', value: formatMinutes(charts.weekMinutes).replace(/ \d+min$/, ''), sub: `${charts.deliveredYear} entregues no ano` },
              ]}
            />

            <div className="grid gap-12 lg:grid-cols-[1fr_300px] lg:gap-16">
              <ProjectsSection projects={home.projects} soonDays={home.soonDays} title="Andamento dos projetos" limit={8} />
              <TodayColumn todayEvents={home.todayEvents} upcoming={home.upcomingEvents} calendarConnected={calendarConnected} />
            </div>

            <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-3 lg:gap-12">
              <section aria-labelledby="por-etapa">
                <SectionHeader id="por-etapa" title="Projetos por etapa" aside={<span className="text-[12.5px] text-faint">etapa atual</span>} />
                <div className="space-y-4 border-t border-hairline pt-4">
                  {charts.phases.length === 0 && <p className="text-[13px] text-faint">Sem projetos ativos.</p>}
                  {charts.phases.map(([phase, n]) => (
                    <BarRow key={phase} label={phase} value={n} max={maxPhase} color={CSS_COLOR.brand(500)} title={`${n} projeto(s) em ${phase}`} />
                  ))}
                </div>
              </section>
              <section aria-labelledby="por-status">
                <SectionHeader id="por-status" title="Tarefas dos projetos" aside={<span className="text-[12.5px] text-faint">projetos ativos</span>} />
                <div className="space-y-4 border-t border-hairline pt-4">
                  {charts.byStatus.map(({ status, count }) => (
                    <BarRow
                      key={status}
                      label={
                        <span className="inline-flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 rounded-full ${TASK_STATUS_STYLE[status].dot}`} aria-hidden />
                          {TASK_STATUS_STYLE[status].label}
                        </span>
                      }
                      value={count}
                      max={maxStatus}
                    />
                  ))}
                </div>
              </section>
              <section aria-labelledby="entregas" className="md:col-span-2 lg:col-span-1">
                <SectionHeader id="entregas" title="Entregas previstas" aside={<span className="text-[12.5px] text-faint">{charts.in30} nos próximos 30 dias</span>} />
                <div className="border-t border-hairline pt-4">
                  <MonthBars title="Por mês de prazo" total={charts.monthsTotal} months={charts.months} caption="nos próximos 6 meses" />
                  {charts.nextDelivery && (
                    <p className="mt-4 text-[12.5px] text-faint">
                      Próxima: <span className="text-ink">{charts.nextDelivery.project.name}</span> · {charts.nextDelivery.project.due_date?.split('-').reverse().slice(0, 2).join('/')}
                    </p>
                  )}
                </div>
              </section>
            </div>

            <MetricRow
              label="Comercial"
              items={[
                { label: 'Oportunidades abertas', value: home.kpis.openLeads, to: '/oportunidades' },
                { label: 'Valor no funil', value: formatCurrency(home.funnelTotal), sub: 'propostas em aberto' },
                { label: 'Retornos pendentes', value: commercial.followups.length, tone: commercial.followups.length ? 'text-warning-fg' : undefined },
                { label: 'Novos leads no mês', value: commercial.newThisMonth },
                { label: 'Conversão', value: home.kpis.conversion === null ? '—' : `${home.kpis.conversion}%`, sub: `90 dias · ${home.kpis.won90} ganhos` },
                { label: `Parados há +${commercial.staleDays} dias`, value: commercial.stale, tone: commercial.stale ? 'text-danger-fg' : undefined },
              ]}
            />

            <div className="grid gap-12 lg:grid-cols-[340px_1fr] lg:gap-16">
              <FunnelSection rows={home.funnel} total={home.funnelTotal} conversion={home.kpis.conversion} />
              <section aria-labelledby="retornos-equipe">
                <SectionHeader
                  id="retornos-equipe"
                  title="Retornos pendentes"
                  aside={<span className="text-[12.5px] text-faint">atrasados e de hoje, de toda a equipe</span>}
                />
                {commercial.followups.length === 0 ? (
                  <p className="border-t border-hairline py-4 text-[13px] text-faint">Nenhum retorno pendente.</p>
                ) : (
                  <ul>
                    {commercial.followups.slice(0, 8).map((l) => {
                      const late = l.next_contact_date! < today();
                      const owner = l.owner_id ? maps.profiles[l.owner_id] : null;
                      return (
                        <li key={l.id}>
                          <Link
                            to={`/oportunidades?lead=${l.id}`}
                            className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t border-hairline py-3 transition-colors hover:bg-ink/[0.025] md:grid-cols-[minmax(0,1fr)_140px_110px]"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[13.5px] text-ink">{l.name}</span>
                              <span className="block truncate text-[12.5px] text-faint">
                                {maps.stages[l.stage_id]?.name} · {l.city}
                              </span>
                            </span>
                            <span className="hidden truncate text-[13px] text-muted md:block">{owner?.name ?? 'Sem responsável'}</span>
                            <span className={cn('text-right text-[12.5px]', late ? 'text-danger-fg' : 'text-warning-fg')}>
                              {late ? `desde ${formatDateShort(l.next_contact_date!)}` : 'hoje'}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                    {commercial.followups.length > 8 && (
                      <li className="border-t border-hairline pt-3 text-[12.5px] text-faint">
                        e mais {commercial.followups.length - 8} · <ActionLink to="/oportunidades" muted>ver no funil</ActionLink>
                      </li>
                    )}
                  </ul>
                )}
              </section>
            </div>

            {can('financeiro') && (
              <MetricRow
                label="Financeiro"
                items={[
                  { label: 'Saldo em contas', value: formatCurrency(fin.totalBalance), to: '/financeiro' },
                  { label: 'A receber em 30 dias', value: formatCurrency(money.receive30), to: '/financeiro?aba=lancamentos' },
                  { label: 'A pagar em 30 dias', value: formatCurrency(money.pay30), to: '/financeiro?aba=lancamentos' },
                  { label: 'A receber vencido', value: formatCurrency(money.overdueIn), tone: money.overdueIn ? 'text-danger-fg' : undefined },
                  { label: 'A pagar vencido', value: formatCurrency(money.overdueOut), tone: money.overdueOut ? 'text-danger-fg' : undefined },
                  { label: 'Resultado do mês', value: formatCurrency(money.result), tone: money.result < 0 ? 'text-danger-fg' : undefined, sub: 'recebido − pago' },
                ]}
              />
            )}

            <TeamSection team={home.team} />
          </div>
        )}
      </div>
    </div>
  );
}
