import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, ChevronDown, Plus } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { TASK_PRIORITY, TASK_STATUS_ORDER } from '../lib/constants';
import { totalMinutes } from '../lib/domain';
import { TASK_STATUS_STYLE } from '../lib/status';
import type { Task, TaskStatus } from '../lib/types';
import { addDays, cn, diffDays, formatMinutes, matches, startOfWeek, today, toDateKey } from '../lib/utils';
import { ActionLink, Avatar, Button, DueBadge, EmptyState, FilterPick, PageHeader, SearchField, Tabs, Toolbar } from '../components/ui';
import { TaskRow } from '../components/tasks/TaskRow';
import { TaskFormModal } from '../components/tasks/TaskFormModal';
import { useOpenTask } from '../components/tasks/useOpenTask';
import { TasksByProject } from '../components/tasks/TasksByProject';
import { dueBucket } from '../components/tasks/taskBuckets';
import { AttentionPanel } from '../components/dashboard/AttentionPanel';
import { useHomeData } from '../components/dashboard/useHomeData';

type Scope = 'assigned' | 'delegated';
type View = 'projeto' | 'prazo' | 'board';
/** Recorte pelo resumo do topo. */
type Focus = '' | 'overdue' | 'today' | 'week' | 'doing' | 'nodate';
const VIEW_KEY = 'airos:tarefas-visao';
type PageTab = 'tarefas' | 'atencao';

/** Minhas tarefas, com a aba "Pede sua atenção" (fila que antes ficava no Início). */
export default function TasksPage() {
  const [params, setParams] = useSearchParams();
  const { items } = useHomeData();
  const tab: PageTab = params.get('aba') === 'atencao' ? 'atencao' : 'tarefas';
  const tabs = (
    <Tabs<PageTab>
      tabs={[
        { id: 'tarefas', label: 'Tarefas' },
        { id: 'atencao', label: 'Pede sua atenção', count: items.length },
      ]}
      value={tab}
      onChange={(t) =>
        setParams(
          (p) => {
            const next = new URLSearchParams(p);
            if (t === 'atencao') next.set('aba', 'atencao');
            else next.delete('aba');
            return next;
          },
          { replace: true },
        )
      }
      underline={1}
      className="mb-6 border-hairline md:mb-8"
    />
  );
  if (tab === 'tarefas') return <TaskList tabs={tabs} />;
  return (
    <div>
      <PageHeader
        title="Pede sua atenção"
        description={items.length ? `${items.length} ${items.length === 1 ? 'item atrasado, para hoje ou desta semana' : 'itens atrasados, para hoje ou desta semana'}` : 'Tudo em dia.'}
      />
      {tabs}
      <AttentionPanel items={items} />
    </div>
  );
}

function TaskList({ tabs }: { tabs: ReactNode }) {
  const { db, me, maps, can } = useData();
  // Sem o módulo Projetos, a pessoa vê apenas as próprias tarefas.
  const teamView = can('projetos');
  const openTask = useOpenTask();
  const [scope, setScope] = useState<Scope>('assigned');
  const [view, setViewState] = useState<View>(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      return v === 'prazo' || v === 'board' ? v : 'projeto';
    } catch {
      return 'projeto';
    }
  });
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* só lembra neste navegador */
    }
  };
  const [focus, setFocus] = useState<Focus>('');
  const [personPick, setPerson] = useState<string>(me.id);
  const person = teamView ? personPick : me.id;
  const [query, setQuery] = useState('');
  const [project, setProject] = useState('');
  const [creating, setCreating] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const viewing = person ? maps.profiles[person] : null;

  const base = useMemo(() => {
    return db.tasks.filter((t) => {
      if (scope === 'assigned') {
        if (person && t.assignee_id !== person) return false;
      } else if (t.created_by !== me.id || t.assignee_id === me.id) return false;
      if (project === 'none' && t.project_id) return false;
      if (project && project !== 'none' && t.project_id !== project) return false;
      const p = t.project_id ? maps.projects[t.project_id] : null;
      if (p && p.status === 'cancelado') return false;
      return matches(query, t.title, t.phase, p?.name);
    });
  }, [db.tasks, scope, person, me.id, project, query, maps.projects]);

  const t = today();
  const allOpen = useMemo(() => base.filter((x) => x.status !== 'done'), [base]);
  // Resumo do topo: quantas em cada faixa (sobre todas as abertas) e o recorte escolhido
  const counts = useMemo(() => {
    const c = { overdue: 0, today: 0, week: 0, doing: 0, nodate: 0 };
    for (const x of allOpen) {
      const b = dueBucket(x, t);
      if (b !== 'later') c[b]++;
      if (x.status === 'doing' || x.status === 'review') c.doing++;
    }
    return c;
  }, [allOpen, t]);
  const visibleOpen = useMemo(
    () => (!focus ? allOpen : allOpen.filter((x) => (focus === 'doing' ? x.status === 'doing' || x.status === 'review' : dueBucket(x, t) === focus))),
    [allOpen, focus, t],
  );
  const groups = useMemo(() => {
    const open = visibleOpen;
    const sortFn = (a: Task, b: Task) =>
      (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || TASK_PRIORITY[b.priority].weight - TASK_PRIORITY[a.priority].weight;
    const week = addDays(t, 7);
    return {
      overdue: open.filter((x) => x.due_date && x.due_date < t).sort(sortFn),
      today: open.filter((x) => x.due_date === t).sort(sortFn),
      week: open.filter((x) => x.due_date && x.due_date > t && x.due_date <= week).sort(sortFn),
      later: open.filter((x) => x.due_date && x.due_date > week).sort(sortFn),
      noDate: open.filter((x) => !x.due_date).sort(sortFn),
      done: base
        .filter((x) => x.status === 'done')
        .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
        .slice(0, 50),
    };
  }, [base, visibleOpen, t]);

  const weekMinutes = useMemo(() => {
    const ws = startOfWeek(t);
    return totalMinutes(db.time_entries.filter((e) => (!person || e.user_id === person) && toDateKey(new Date(e.started_at)) >= ws));
  }, [db.time_entries, person, t]);

  const openCount = base.filter((x) => x.status !== 'done').length;
  const soonCount = groups.today.length + groups.week.length;
  const delegatedCount = db.tasks.filter((x) => x.created_by === me.id && x.assignee_id !== me.id && x.status !== 'done').length;

  const projectsWithTasks = useMemo(() => {
    const ids = new Set(db.tasks.map((x) => x.project_id).filter(Boolean) as string[]);
    return db.projects.filter((p) => ids.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [db.tasks, db.projects]);

  const title =
    scope === 'delegated'
      ? 'Tarefas que designei'
      : person === me.id
        ? 'Minhas tarefas'
        : viewing
          ? `Tarefas de ${viewing.name.split(' ')[0]}`
          : 'Tarefas da equipe';

  const sections: Array<{ key: string; title: string; color: string; tasks: Task[] }> = [
    { key: 'overdue', title: 'Atrasadas', color: 'text-danger-fg', tasks: groups.overdue },
    { key: 'today', title: 'Hoje', color: 'text-warning-fg', tasks: groups.today },
    { key: 'week', title: 'Próximos 7 dias', color: 'text-stone-700', tasks: groups.week },
    { key: 'later', title: 'Mais adiante', color: 'text-stone-700', tasks: groups.later },
    { key: 'noDate', title: 'Sem prazo', color: 'text-stone-700', tasks: groups.noDate },
  ];

  return (
    <div>
      <PageHeader
        title={title}
        description={
          <>
            {openCount} {openCount === 1 ? 'pendente' : 'pendentes'}
            {groups.overdue.length > 0 && (
              <>
                {' · '}
                <span className="text-danger-fg">
                  {groups.overdue.length} {groups.overdue.length === 1 ? 'atrasada' : 'atrasadas'}
                </span>
              </>
            )}
            {soonCount > 0 && (
              <>
                {' · '}
                <span className="text-warning-fg">
                  {soonCount} {soonCount === 1 ? 'vence' : 'vencem'} em 7 dias
                </span>
              </>
            )}
            {scope === 'assigned' && <> · {formatMinutes(weekMinutes)} registradas nesta semana</>}
          </>
        }
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => setCreating(true)}>
            Tarefa
          </Button>
        }
      />

      {tabs}

      <Toolbar
        search={<SearchField value={query} onChange={setQuery} placeholder="Buscar tarefa ou projeto…" label="Buscar tarefas" />}
        filters={
          <>
            {scope === 'assigned' && teamView && (
              <FilterPick
                label="Pessoa"
                allLabel="Toda a equipe"
                value={person}
                onChange={setPerson}
                options={[
                  { value: me.id, label: 'Eu', icon: <Avatar user={me} size="xs" /> },
                  ...db.profiles.filter((p) => p.id !== me.id && p.active).map((p) => ({ value: p.id, label: p.name, icon: <Avatar user={p} size="xs" /> })),
                ]}
              />
            )}
            <FilterPick
              label="Projeto"
              allLabel="Todos os projetos"
              value={project}
              onChange={setProject}
              options={[{ value: 'none', label: 'Somente avulsas' }, ...projectsWithTasks.map((p) => ({ value: p.id, label: p.name }))]}
            />
          </>
        }
        aside={
          <>
            <Tabs<Scope>
              tabs={[
                { id: 'assigned', label: 'Designadas' },
                { id: 'delegated', label: 'Que designei', count: delegatedCount },
              ]}
              value={scope}
              onChange={setScope}
              size="sm"
              underline={1}
              bordered={false}
            />
            <span className="h-4 w-px bg-line max-md:hidden" aria-hidden />
            <Tabs<View>
              tabs={[
                { id: 'projeto', label: 'Por projeto' },
                { id: 'prazo', label: 'Por prazo' },
                { id: 'board', label: 'Quadro' },
              ]}
              value={view}
              onChange={setView}
              size="sm"
              underline={1}
              bordered={false}
            />
          </>
        }
      />

      {view !== 'board' && base.length > 0 && (
        <div
          className="scrollbar-none -mx-5 mt-6 flex gap-2.5 overflow-x-auto px-5 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0"
          role="group"
          aria-label="Resumo das tarefas"
        >
          {(
            [
              ['overdue', 'Atrasadas', counts.overdue, 'danger'],
              ['today', 'Para hoje', counts.today, 'warning'],
              ['week', 'Próximos 7 dias', counts.week, 'neutral'],
              ['doing', 'Em andamento', counts.doing, 'info'],
              ['nodate', 'Sem prazo', counts.nodate, 'neutral'],
            ] as const
          ).map(([id, label, n, tone]) => {
            const active = focus === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => setFocus(active ? '' : id)}
                className={cn(
                  'min-w-[124px] shrink-0 rounded-[14px] border px-4 py-3 text-left transition-colors sm:min-w-0',
                  active ? 'border-ink bg-surface shadow-card' : 'border-line bg-surface hover:border-stone-300',
                  n === 0 && !active && 'opacity-60',
                )}
              >
                <div className="text-[12.5px] text-muted">{label}</div>
                <div
                  className={cn(
                    'mt-1 font-display text-[24px] font-semibold leading-7 tabular',
                    n > 0 && tone === 'danger' ? 'text-danger-fg' : n > 0 && tone === 'warning' ? 'text-warning-fg' : n > 0 && tone === 'info' ? 'text-info-fg' : 'text-ink',
                  )}
                >
                  {n}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {focus && view !== 'board' && (
        <p className="mt-3 text-[13px] text-muted">
          Mostrando só: {{ overdue: 'atrasadas', today: 'para hoje', week: 'próximos 7 dias', doing: 'em andamento', nodate: 'sem prazo' }[focus]}.{' '}
          <button type="button" className="text-ink underline decoration-stone-300 underline-offset-4" onClick={() => setFocus('')}>
            Ver todas
          </button>
        </p>
      )}

      <div className="mt-6 md:mt-8">
        {view === 'board' ? (
          <TaskBoard tasks={base} onOpen={openTask} />
        ) : base.length === 0 ? (
          <div className="rounded-[16px] border border-line bg-surface shadow-card">
            <EmptyState
              tone="success"
              icon={<CheckCircle2 strokeWidth={1.6} />}
              title="Nenhuma tarefa por aqui"
              description="Quando alguém designar uma tarefa para você, ela aparece nesta tela."
              action={<ActionLink onClick={() => setCreating(true)}>Criar tarefa</ActionLink>}
              className="py-14"
            />
          </div>
        ) : (
          <>
            {visibleOpen.length === 0 ? (
              <p className="py-6 text-[13px] text-faint">Nenhuma tarefa pendente{focus ? ' neste recorte' : ''}.</p>
            ) : view === 'projeto' ? (
              <TasksByProject tasks={visibleOpen} onOpen={openTask} />
            ) : (
              <div className="overflow-hidden rounded-[16px] border border-line bg-surface pb-1.5 shadow-card">
                {sections
                  .filter((s) => s.tasks.length > 0)
                  .map((s) => (
                    <div key={s.key} role="group" aria-label={s.title}>
                      <div className={cn('px-4 pb-2 pt-[18px] text-[12.5px] font-medium md:px-6', s.color)}>
                        {s.title} <span className="ml-1 font-normal text-faint">{s.tasks.length}</span>
                      </div>
                      <div className="divide-y divide-hairline-surface border-t border-hairline-surface md:[&>div]:px-6">
                        {s.tasks.map((x) => (
                          <TaskRow key={x.id} task={x} onOpen={() => openTask(x.id)} showProject />
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
            {groups.done.length > 0 && (
              <div className="mt-6">
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-[13px] text-faint hover:text-ink"
                  onClick={() => setShowDone((s) => !s)}
                  aria-expanded={showDone}
                >
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !showDone && '-rotate-90')} />
                  Concluídas recentemente <span className="tabular">{groups.done.length}</span>
                </button>
                {showDone && (
                  <div className="mt-3 divide-y divide-hairline border-y border-hairline [&>div]:px-0 md:[&>div]:px-2">
                    {groups.done.map((x) => (
                      <TaskRow key={x.id} task={x} onOpen={() => openTask(x.id)} showProject />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {creating && (
        <TaskFormModal
          title={scope === 'delegated' ? 'Designar tarefa' : 'Nova tarefa'}
          defaults={{ assignee_id: person || me.id }}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function TaskBoard({ tasks, onOpen }: { tasks: Task[]; onOpen: (id: string) => void }) {
  const { maps, settings, updateTask } = useData();
  const toast = useToast();
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const t = today();
  return (
    <div className="scrollbar-thin -mx-5 overflow-x-auto px-5 pb-6 md:-mx-8 md:px-8 xl:-mx-12 xl:px-12">
      <div className="flex gap-6">
        {TASK_STATUS_ORDER.map((status) => {
          const style = TASK_STATUS_STYLE[status];
          const items = tasks
            .filter((x) => x.status === status)
            .filter((x) => status !== 'done' || !x.completed_at || diffDays(toDateKey(new Date(x.completed_at)), t) <= 14)
            .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
          const target = over === status && dragging && maps.tasks[dragging]?.status !== status;
          return (
            <section
              key={status}
              aria-label={style.label}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                setDragging(null);
                const id = e.dataTransfer.getData('text/plain');
                if (id) updateTask(id, { status }).catch(toast.error);
              }}
              className="flex w-[272px] shrink-0 flex-col"
            >
              <header className="flex items-center gap-2 border-b border-hairline pb-3">
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} aria-hidden />
                <h2 className="text-[13.5px] font-medium text-ink">{style.label}</h2>
                <span className="text-[13px] tabular text-faint">{items.length}</span>
              </header>
              <div className="min-h-[200px] space-y-2.5 pt-3">
                {target && (
                  <div className="flex h-14 items-center justify-center rounded-lg border-[1.5px] border-dashed border-brand-300 bg-brand-50 text-[13px] text-brand-700">
                    Soltar em {style.label}
                  </div>
                )}
                {items.map((x) => {
                  const project = x.project_id ? maps.projects[x.project_id] : null;
                  return (
                    <article
                      key={x.id}
                      draggable
                      tabIndex={0}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', x.id);
                        const el = e.currentTarget;
                        el.classList.add('drag-ghost');
                        requestAnimationFrame(() => el.classList.remove('drag-ghost'));
                        setDragging(x.id);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                      onClick={() => onOpen(x.id)}
                      onKeyDown={(e) => e.key === 'Enter' && onOpen(x.id)}
                      className={cn(
                        'cursor-pointer rounded-lg border border-line bg-surface p-3.5 transition-[border-color,box-shadow,opacity] hover:border-stone-300 hover:shadow-sm',
                        dragging === x.id && 'opacity-40',
                      )}
                    >
                      <div className="truncate text-[12.5px] text-faint">
                        {project ? project.name : 'Avulsa'}
                        {x.phase ? ` · ${x.phase}` : ''}
                      </div>
                      <div className={cn('mt-0.5 text-[14px] font-medium leading-5', x.status === 'done' ? 'text-faint line-through decoration-stone-300' : 'text-ink')}>
                        {x.title}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <DueBadge due={x.due_date} done={x.status === 'done'} soonDays={settings.due_soon_days} compact />
                        <Avatar user={x.assignee_id ? maps.profiles[x.assignee_id] : null} size="xs" />
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
