import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Plus } from 'lucide-react';
import { useData } from '../context/DataContext';
import { openCreate } from '../lib/create';
import { isProjectActive, totalMinutes } from '../lib/domain';
import { TASK_PRIORITY } from '../lib/constants';
import type { Task } from '../lib/types';
import { addDays, cn, formatDateShort, formatMinutes, startOfWeek, today, toDateKey } from '../lib/utils';
import { ActionLink, Button, EmptyState, MetricRow, PageHeader, SectionHeader, Tabs } from '../components/ui';
import { MobileTimerBar } from '../components/layout/MobileTimerBar';
import { AgendaView } from '../components/agenda/AgendaView';
import { TaskRow } from '../components/tasks/TaskRow';
import { useOpenTask } from '../components/tasks/useOpenTask';
import { useHomeData } from '../components/dashboard/useHomeData';
import { ProjectsSection, TodayColumn } from '../components/dashboard/HomeSections';

type Tab = 'geral' | 'agenda';

/** Quantas tarefas mostrar por grupo antes do "ver todas". */
const GROUP_LIMIT = 5;

function longDate() {
  const s = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

/**
 * Meu painel: tela inicial de cada pessoa. Minhas tarefas (atrasadas, de hoje e da semana),
 * meus projetos e prazos, retornos de leads e a minha agenda.
 */
export default function HomePage() {
  const { db, maps, me, settings, can } = useData();
  const openTask = useOpenTask();
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

  const home = useHomeData('me');

  const mine = useMemo(() => {
    const t = today();
    const week = addDays(t, 7);
    const sortFn = (a: Task, b: Task) =>
      (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || TASK_PRIORITY[b.priority].weight - TASK_PRIORITY[a.priority].weight;
    const open = db.tasks
      .filter((x) => {
        if (x.assignee_id !== me.id || x.status === 'done') return false;
        const p = x.project_id ? maps.projects[x.project_id] : null;
        return !p || isProjectActive(p);
      })
      .sort(sortFn);
    const projects = home.myProjects;
    const followups = can('comercial')
      ? db.leads
          .filter((l) => l.owner_id === me.id && maps.stages[l.stage_id]?.kind === 'open' && l.next_contact_date && l.next_contact_date <= t)
          .sort((a, b) => (a.next_contact_date ?? '').localeCompare(b.next_contact_date ?? ''))
      : [];
    const ws = startOfWeek(t);
    return {
      open,
      overdue: open.filter((x) => x.due_date && x.due_date < t),
      today: open.filter((x) => x.due_date === t),
      week: open.filter((x) => x.due_date && x.due_date > t && x.due_date <= week),
      projects,
      projectsOverdue: projects.filter((p) => p.summary.deadline === 'overdue').length,
      projectsSoon: projects.filter((p) => p.summary.deadline === 'soon' || p.summary.deadline === 'today').length,
      followups,
      followupsToday: followups.filter((l) => l.next_contact_date === t).length,
      weekMinutes: totalMinutes(db.time_entries.filter((e) => e.user_id === me.id && toDateKey(new Date(e.started_at)) >= ws)),
    };
  }, [db.tasks, db.leads, db.time_entries, maps.projects, maps.stages, me.id, home.myProjects, can]);

  const attention = home.items.length;
  const pieces: Array<{ text: string; tone?: string }> = [];
  if (mine.overdue.length) pieces.push({ text: `${mine.overdue.length} ${mine.overdue.length === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}`, tone: 'text-danger-fg' });
  if (mine.today.length) pieces.push({ text: `${mine.today.length} ${mine.today.length === 1 ? 'vence hoje' : 'vencem hoje'}`, tone: 'text-warning-fg' });
  if (mine.projectsOverdue) pieces.push({ text: `${mine.projectsOverdue} ${mine.projectsOverdue === 1 ? 'projeto com prazo vencido' : 'projetos com prazo vencido'}`, tone: 'text-danger-fg' });
  if (mine.projectsSoon) pieces.push({ text: `${mine.projectsSoon} ${mine.projectsSoon === 1 ? 'projeto vence' : 'projetos vencem'} em ${home.soonDays} dias`, tone: 'text-warning-fg' });
  if (mine.followups.length) pieces.push({ text: `${mine.followups.length} ${mine.followups.length === 1 ? 'retorno de lead' : 'retornos de leads'}` });

  const groups: Array<{ key: string; title: string; color: string; tasks: Task[] }> = [
    { key: 'overdue', title: 'Atrasadas', color: 'text-danger-fg', tasks: mine.overdue },
    { key: 'today', title: 'Vencem hoje', color: 'text-warning-fg', tasks: mine.today },
    { key: 'week', title: 'Próximos 7 dias', color: 'text-stone-700', tasks: mine.week },
  ];
  const upcomingCount = mine.overdue.length + mine.today.length + mine.week.length;

  return (
    <div>
      <PageHeader
        eyebrow={longDate()}
        title={`${greeting()}, ${me.name.split(' ')[0]}`}
        description={
          pieces.length === 0 ? (
            'Tudo em dia por aqui.'
          ) : (
            <>
              {pieces.map((p, i) => (
                <span key={p.text}>
                  {i > 0 && ' · '}
                  <span className={p.tone}>{p.text}</span>
                </span>
              ))}
              {attention > 0 && (
                <>
                  {' · '}
                  <ActionLink to="/tarefas?aba=atencao" className="text-[length:inherit]">
                    ver o que pede atenção
                  </ActionLink>
                </>
              )}
            </>
          )
        }
        actions={
          <div className="hidden items-center gap-2 md:flex">
            <Button variant="ghost" icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => openCreate('event')}>
              Reunião
            </Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => openCreate('task')}>
              Tarefa
            </Button>
          </div>
        }
      />

      <MobileTimerBar className="-mt-3 mb-8" />

      <Tabs<Tab>
        tabs={[
          { id: 'geral', label: 'Visão geral' },
          { id: 'agenda', label: 'Minha agenda' },
        ]}
        value={tab}
        onChange={setTab}
        underline={1}
        bordered={tab === 'agenda'}
        className="border-hairline"
      />

      <div className={tab === 'agenda' ? 'mt-8 md:mt-10' : 'mt-4'}>
        {tab === 'agenda' ? (
          <AgendaView mine />
        ) : (
          <div className="flex flex-col gap-12 md:gap-14">
            <MetricRow
              items={[
                { label: 'Tarefas abertas', value: mine.open.length, to: '/tarefas' },
                { label: 'Atrasadas', value: mine.overdue.length, tone: mine.overdue.length ? 'text-danger-fg' : undefined },
                { label: 'Vencem hoje', value: mine.today.length, tone: mine.today.length ? 'text-warning-fg' : undefined },
                { label: 'Próximos 7 dias', value: mine.week.length },
                {
                  label: 'Meus projetos',
                  value: mine.projects.length,
                  sub: mine.projectsOverdue || mine.projectsSoon ? `${mine.projectsOverdue + mine.projectsSoon} com prazo pedindo atenção` : 'prazos em dia',
                },
                { label: 'Minhas horas', value: formatMinutes(mine.weekMinutes).replace(/ \d+min$/, ''), sub: 'nesta semana' },
              ]}
            />

            <div className="grid gap-12 lg:grid-cols-[1fr_300px] lg:gap-16">
              <div className="flex min-w-0 flex-col gap-12">
                <section aria-labelledby="minhas-tarefas">
                  <SectionHeader
                    id="minhas-tarefas"
                    title="Minhas tarefas"
                    aside={
                      <ActionLink to="/tarefas" muted>
                        {mine.open.length > upcomingCount ? `Ver todas (${mine.open.length})` : 'Abrir'}
                      </ActionLink>
                    }
                  />
                  {upcomingCount === 0 ? (
                    <div className="rounded-[16px] bg-surface shadow-surface">
                      <EmptyState
                        tone="success"
                        icon={<CheckCircle2 strokeWidth={1.6} />}
                        title="Nada atrasado nem vencendo nos próximos 7 dias"
                        description={mine.open.length ? `${mine.open.length} ${mine.open.length === 1 ? 'tarefa aberta' : 'tarefas abertas'} com prazo mais adiante ou sem prazo.` : 'Quando alguém designar uma tarefa para você, ela aparece aqui.'}
                        className="py-10"
                      />
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-[16px] bg-surface pb-1.5 shadow-surface">
                      {groups
                        .filter((g) => g.tasks.length > 0)
                        .map((g) => (
                          <div key={g.key} role="group" aria-label={g.title}>
                            <div className={cn('flex items-baseline justify-between px-4 pb-2 pt-[18px] text-[12.5px] font-medium md:px-6', g.color)}>
                              <span>
                                {g.title} <span className="ml-1 font-normal text-faint">{g.tasks.length}</span>
                              </span>
                              {g.tasks.length > GROUP_LIMIT && (
                                <Link to="/tarefas" className="font-normal text-faint hover:text-ink">
                                  +{g.tasks.length - GROUP_LIMIT}
                                </Link>
                              )}
                            </div>
                            <div className="divide-y divide-hairline-surface border-t border-hairline-surface md:[&>div]:px-6">
                              {g.tasks.slice(0, GROUP_LIMIT).map((x) => (
                                <TaskRow key={x.id} task={x} onOpen={() => openTask(x.id)} showProject />
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </section>

                {mine.followups.length > 0 && (
                  <section aria-labelledby="retornos">
                    <SectionHeader id="retornos" title="Retornos de leads" aside={<ActionLink to="/oportunidades" muted>Oportunidades</ActionLink>} />
                    <ul>
                      {mine.followups.slice(0, 6).map((l) => {
                        const late = l.next_contact_date! < today();
                        return (
                          <li key={l.id}>
                            <Link
                              to={`/oportunidades?lead=${l.id}`}
                              className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t border-hairline py-3 transition-colors hover:bg-ink/[0.025]"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-[13.5px] text-ink">{l.name}</span>
                                <span className="block truncate text-[12.5px] text-faint">
                                  {maps.stages[l.stage_id]?.name} · {l.city}
                                </span>
                              </span>
                              <span className={cn('text-[12.5px]', late ? 'text-danger-fg' : 'text-warning-fg')}>
                                {late ? `desde ${formatDateShort(l.next_contact_date!)}` : 'hoje'}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
              </div>
              <TodayColumn todayEvents={home.todayEvents} upcoming={home.upcomingEvents} calendarConnected={!!(settings.calendar_embed_url || me.calendar_embed_url)} />
            </div>

            <ProjectsSection projects={mine.projects} soonDays={home.soonDays} title="Meus projetos" limit={8} empty="Você não está em nenhum projeto ativo." />
          </div>
        )}
      </div>
    </div>
  );
}
