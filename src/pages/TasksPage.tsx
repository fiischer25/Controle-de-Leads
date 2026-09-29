import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, Clock, Columns3, List, ListChecks, Plus, Search, Send } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { TASK_PRIORITY, TASK_STATUS, TASK_STATUS_ORDER } from '../lib/constants';
import { totalMinutes } from '../lib/domain';
import type { Task, TaskStatus } from '../lib/types';
import { addDays, cn, diffDays, formatMinutes, matches, startOfWeek, today, toDateKey } from '../lib/utils';
import { Avatar, Button, DueBadge, EmptyState, Input, PageHeader, Segmented, Select, Tabs } from '../components/ui';
import { TaskRow } from '../components/tasks/TaskRow';
import { TaskFormModal } from '../components/tasks/TaskFormModal';
import { useOpenTask } from '../components/tasks/useOpenTask';

type Scope = 'assigned' | 'delegated';
type View = 'list' | 'board';

export default function TasksPage() {
  const { db, me, maps } = useData();
  const openTask = useOpenTask();
  const [scope, setScope] = useState<Scope>('assigned');
  const [view, setView] = useState<View>('list');
  const [person, setPerson] = useState<string>(me.id);
  const [query, setQuery] = useState('');
  const [project, setProject] = useState('');
  const [creating, setCreating] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const viewing = person === 'all' ? null : maps.profiles[person];

  const base = useMemo(() => {
    return db.tasks.filter((t) => {
      if (scope === 'assigned') {
        if (person !== 'all' && t.assignee_id !== person) return false;
      } else {
        if (t.created_by !== me.id || t.assignee_id === me.id) return false;
      }
      if (project === 'none' && t.project_id) return false;
      if (project && project !== 'none' && t.project_id !== project) return false;
      const p = t.project_id ? maps.projects[t.project_id] : null;
      if (p && (p.status === 'cancelado')) return false;
      return matches(query, t.title, t.phase, p?.name);
    });
  }, [db.tasks, scope, person, me.id, project, query, maps.projects]);

  const t = today();
  const groups = useMemo(() => {
    const open = base.filter((x) => x.status !== 'done');
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
  }, [base, t]);

  const weekMinutes = useMemo(() => {
    const ws = startOfWeek(t);
    const uidFilter = person === 'all' ? null : person;
    return totalMinutes(
      db.time_entries.filter((e) => (!uidFilter || e.user_id === uidFilter) && toDateKey(new Date(e.started_at)) >= ws),
    );
  }, [db.time_entries, person, t]);

  const openCount = base.filter((x) => x.status !== 'done').length;
  const delegatedCount = db.tasks.filter((x) => x.created_by === me.id && x.assignee_id !== me.id && x.status !== 'done').length;

  const projectsWithTasks = useMemo(() => {
    const ids = new Set(db.tasks.map((x) => x.project_id).filter(Boolean) as string[]);
    return db.projects.filter((p) => ids.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [db.tasks, db.projects]);

  return (
    <div>
      <PageHeader
        eyebrow="Produção"
        title={scope === 'assigned' && person === me.id ? 'Minhas tarefas' : scope === 'assigned' ? (viewing ? `Tarefas de ${viewing.name.split(' ')[0]}` : 'Tarefas da equipe') : 'Tarefas que designei'}
        description="Tudo o que está com você — de projetos e tarefas avulsas designadas pela equipe."
        actions={
          <>
            <Segmented<View>
              value={view}
              onChange={setView}
              options={[
                { id: 'list', label: 'Lista', icon: <List className="h-4 w-4" /> },
                { id: 'board', label: 'Quadro', icon: <Columns3 className="h-4 w-4" /> },
              ]}
            />
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              Nova tarefa
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<ListChecks className="h-4 w-4" />} label="Pendentes" value={openCount} />
        <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="Atrasadas" value={groups.overdue.length} tone={groups.overdue.length ? 'bad' : undefined} />
        <Kpi icon={<CalendarDays className="h-4 w-4" />} label="Vencem em 7 dias" value={groups.today.length + groups.week.length} tone={groups.today.length + groups.week.length ? 'warn' : undefined} />
        <Kpi icon={<Clock className="h-4 w-4" />} label="Horas nesta semana" value={formatMinutes(weekMinutes)} />
      </div>

      <Tabs<Scope>
        className="mb-4"
        value={scope}
        onChange={setScope}
        tabs={[
          { id: 'assigned', label: 'Designadas a mim', count: undefined },
          { id: 'delegated', label: <span className="inline-flex items-center gap-1.5"><Send className="h-3.5 w-3.5" /> Que designei a outros</span>, count: delegatedCount },
        ]}
      />

      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tarefa…" className="pl-9" />
        </div>
        {scope === 'assigned' && (
          <Select value={person} onChange={(e) => setPerson(e.target.value)} className="w-auto">
            <option value={me.id}>Minhas tarefas</option>
            {db.profiles.filter((p) => p.id !== me.id && p.active).map((p) => (
              <option key={p.id} value={p.id}>Tarefas de {p.name}</option>
            ))}
            <option value="all">Toda a equipe</option>
          </Select>
        )}
        <Select value={project} onChange={(e) => setProject(e.target.value)} className="w-auto">
          <option value="">Todos os projetos</option>
          <option value="none">Somente avulsas</option>
          {projectsWithTasks.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>

      {view === 'list' ? (
        base.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<CheckCircle2 className="h-6 w-6" />}
              title="Nenhuma tarefa por aqui"
              description="Quando alguém designar uma tarefa para você, ela aparece nesta tela."
              action={<Button variant="primary" onClick={() => setCreating(true)} icon={<Plus className="h-4 w-4" />}>Criar tarefa</Button>}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <Group title="Atrasadas" tone="bad" tasks={groups.overdue} onOpen={openTask} />
            <Group title="Hoje" tone="warn" tasks={groups.today} onOpen={openTask} />
            <Group title="Próximos 7 dias" tasks={groups.week} onOpen={openTask} />
            <Group title="Mais adiante" tasks={groups.later} onOpen={openTask} />
            <Group title="Sem prazo" tasks={groups.noDate} onOpen={openTask} />
            {groups.done.length > 0 && (
              <div className="card overflow-hidden">
                <button className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-stone-600" onClick={() => setShowDone((s) => !s)}>
                  <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Concluídas recentemente ({groups.done.length})</span>
                  <ChevronDown className={cn('h-4 w-4 transition-transform', showDone && 'rotate-180')} />
                </button>
                {showDone && <div className="divide-y divide-stone-100 border-t border-stone-100">{groups.done.map((x) => <TaskRow key={x.id} task={x} onOpen={() => openTask(x.id)} showProject />)}</div>}
              </div>
            )}
          </div>
        )
      ) : (
        <TaskBoard tasks={base} onOpen={openTask} />
      )}

      {creating && (
        <TaskFormModal
          title={scope === 'delegated' ? 'Designar tarefa' : 'Nova tarefa'}
          defaults={{ assignee_id: person !== 'all' ? person : me.id }}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: ReactNode; label: string; value: ReactNode; tone?: 'bad' | 'warn' }) {
  return (
    <div className="card px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-stone-500">
        <span className={cn(tone === 'bad' ? 'text-rose-600' : tone === 'warn' ? 'text-amber-600' : 'text-stone-400')}>{icon}</span>
        {label}
      </div>
      <div className={cn('mt-1 font-display text-2xl font-bold', tone === 'bad' ? 'text-rose-700' : 'text-stone-900')}>{value}</div>
    </div>
  );
}

function Group({ title, tasks, tone, onOpen }: { title: string; tasks: Task[]; tone?: 'bad' | 'warn'; onOpen: (id: string) => void }) {
  if (tasks.length === 0) return null;
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-2.5">
        <span className={cn('h-2 w-2 rounded-full', tone === 'bad' ? 'bg-rose-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-stone-300')} />
        <h3 className="text-sm font-semibold text-stone-800">{title}</h3>
        <span className="text-xs text-stone-500 tabular">{tasks.length}</span>
      </div>
      <div className="divide-y divide-stone-100">
        {tasks.map((x) => (
          <TaskRow key={x.id} task={x} onOpen={() => onOpen(x.id)} showProject />
        ))}
      </div>
    </div>
  );
}

function TaskBoard({ tasks, onOpen }: { tasks: Task[]; onOpen: (id: string) => void }) {
  const { maps, settings, updateTask } = useData();
  const toast = useToast();
  const [over, setOver] = useState<TaskStatus | null>(null);
  const t = today();
  return (
    <div className="scrollbar-thin -mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex gap-3">
        {TASK_STATUS_ORDER.map((status) => {
          const items = tasks
            .filter((x) => x.status === status)
            .filter((x) => status !== 'done' || !x.completed_at || diffDays(toDateKey(new Date(x.completed_at)), t) <= 14)
            .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
          return (
            <section
              key={status}
              onDragOver={(e) => { e.preventDefault(); setOver(status); }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData('text/plain');
                if (id) updateTask(id, { status }).catch(toast.error);
              }}
              className={cn('flex w-[280px] shrink-0 flex-col rounded-2xl border bg-stone-100/70', over === status ? 'border-brand-300 bg-brand-50/60' : 'border-transparent')}
            >
              <header className="flex items-center gap-2 px-3 pb-2 pt-3">
                <span className={cn('h-2 w-2 rounded-full', TASK_STATUS[status].dot)} />
                <h3 className="text-sm font-semibold">{TASK_STATUS[status].label}</h3>
                <span className="rounded-full bg-white px-1.5 text-xs text-stone-500 tabular">{items.length}</span>
              </header>
              <div className="min-h-[200px] space-y-2 px-2 pb-3">
                {items.map((x) => {
                  const project = x.project_id ? maps.projects[x.project_id] : null;
                  return (
                    <article
                      key={x.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', x.id)}
                      onClick={() => onOpen(x.id)}
                      className="cursor-pointer rounded-xl border border-stone-200 bg-white p-3 shadow-card hover:border-stone-300"
                    >
                      <div className="text-[11px] font-medium text-stone-500">{project ? project.name : 'Avulsa'}{x.phase ? ` · ${x.phase}` : ''}</div>
                      <div className="mt-0.5 text-sm font-medium text-stone-900">{x.title}</div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <DueBadge due={x.due_date} done={x.status === 'done'} soonDays={settings.due_soon_days} compact />
                        <Avatar user={x.assignee_id ? maps.profiles[x.assignee_id] : null} size="sm" />
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
