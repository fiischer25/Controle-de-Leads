import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useData } from '../context/DataContext';
import { openCreate } from '../lib/create';
import { isProjectActive, totalMinutes } from '../lib/domain';
import { TASK_STATUS_ORDER } from '../lib/constants';
import { CSS_COLOR, TASK_STATUS_STYLE } from '../lib/status';
import { addDays, formatMinutes, MONTHS_FULL, startOfWeek, today, toDateKey } from '../lib/utils';
import { ActionLink, BarRow, Button, MetricRow, PageHeader, SectionHeader, Tabs } from '../components/ui';
import { MobileTimerBar } from '../components/layout/MobileTimerBar';
import { AgendaView } from '../components/agenda/AgendaView';
import { MonthBars } from '../components/charts/MonthBars';
import { useHomeData } from '../components/dashboard/useHomeData';
import { ProjectsSection, TeamSection, TodayColumn } from '../components/dashboard/HomeSections';
import { useProjectSummaries } from '../components/projects/useProjectSummaries';

type Tab = 'geral' | 'agenda';

function longDate() {
  const s = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Painel de Projetos: primeira tela do sistema, visível para toda a equipe.
 * Visão geral do andamento de todos os projetos (números, etapas, tarefas, entregas
 * e carga da equipe) e a agenda do escritório.
 */
export default function DashboardPage() {
  const { db, me, settings, can } = useData();
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

  const home = useHomeData();
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

  const calendarConnected = !!(settings.calendar_embed_url || me.calendar_embed_url);
  const attention = home.items.length;
  const maxPhase = Math.max(1, ...charts.phases.map(([, n]) => n));
  const maxStatus = Math.max(1, ...charts.byStatus.map((b) => b.count));

  return (
    <div>
      <PageHeader
        eyebrow={longDate()}
        title="Painel de projetos"
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

            <TeamSection team={home.team} />
          </div>
        )}
      </div>
    </div>
  );
}
