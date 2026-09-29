import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarRange,
  Check,
  Clock,
  ExternalLink,
  GanttChartSquare,
  Info,
  Layers,
  Link2,
  ListChecks,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
  Users,
  History,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { PROJECT_STATUS, PROJECT_STATUS_ORDER } from '../lib/constants';
import { orderedPhases, totalMinutes } from '../lib/domain';
import type { Project, ProjectStatus, Task } from '../lib/types';
import { byPosition, cn, diffDays, formatDate, formatDateTime, formatMinutes, formatNumber, formatRelative, today, uid } from '../lib/utils';
import {
  Avatar,
  AvatarStack,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DueBadge,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  ProgressBar,
  Select,
  Tabs,
  Textarea,
  UserSelect,
} from '../components/ui';
import { TaskRow } from '../components/tasks/TaskRow';
import { TaskFormModal } from '../components/tasks/TaskFormModal';
import { useOpenTask } from '../components/tasks/useOpenTask';
import { GanttChart } from '../components/projects/GanttChart';
import { MemberPicker } from '../components/projects/ProjectFields';
import { useProjectSummaries } from '../components/projects/useProjectSummaries';

type Tab = 'tasks' | 'timeline' | 'team' | 'info' | 'activity';

export default function ProjectDetailPage() {
  const { id } = useParams();
  const { db, maps, isAdmin, settings, updateProject, deleteProject, applyTemplates, createTask } = useData();
  const summary = useProjectSummaries().find((s) => s.project.id === id);
  const toast = useToast();
  const navigate = useNavigate();
  const openTask = useOpenTask();
  const [tab, setTab] = useState<Tab>('tasks');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newTask, setNewTask] = useState<{ phase: string | null } | null>(null);
  const [quick, setQuick] = useState<Record<string, string>>({});
  const [hideDone, setHideDone] = useState(false);

  if (!summary) {
    return (
      <Card>
        <EmptyState title="Projeto não encontrado" action={<Link to="/projetos"><Button>Voltar para projetos</Button></Link>} />
      </Card>
    );
  }

  const { project, client, type, tasks, progress, phase, people } = summary;
  const st = PROJECT_STATUS[project.status];
  const finished = project.status === 'concluido' || project.status === 'cancelado';
  const phases = orderedPhases(tasks);
  const open = tasks.filter((t) => t.status !== 'done');
  const overdue = open.filter((t) => t.due_date && t.due_date < today());
  const minutes = summary.minutes;
  const estimated = tasks.reduce((a, t) => a + (t.estimated_hours ?? 0), 0);
  const manager = project.manager_id ? maps.profiles[project.manager_id] : null;
  const daysLeft = project.due_date ? diffDays(today(), project.due_date) : null;

  const addQuick = async (phaseName: string) => {
    const title = quick[phaseName]?.trim();
    if (!title) return;
    const phaseTasks = tasks.filter((t) => (t.phase || 'Geral') === phaseName).sort(byPosition);
    const last = phaseTasks[phaseTasks.length - 1];
    try {
      await createTask({
        title,
        project_id: project.id,
        phase: phaseName === 'Geral' ? null : phaseName,
        assignee_id: project.manager_id,
        position: last ? last.position + 0.5 : tasks.length,
        start_date: last?.due_date ?? project.start_date,
        due_date: last?.due_date ?? null,
      });
      setQuick((q) => ({ ...q, [phaseName]: '' }));
    } catch (e) {
      toast.error(e);
    }
  };

  const activity = db.activity_log
    .filter((a) => a.entity_id === project.id || (a.entity === 'task' && tasks.some((t) => t.id === a.entity_id)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 60);

  return (
    <div>
      <Link to="/projetos" className="mb-4 inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800">
        <ArrowLeft className="h-4 w-4" /> Projetos
      </Link>

      {/* Cabeçalho */}
      <div className="card relative mb-5 overflow-hidden">
        <div className="h-1.5" style={{ backgroundColor: type?.color ?? '#d6d3d1' }} />
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
              <span className="font-semibold uppercase tracking-wider">{project.code}</span>
              {type && <span className="rounded-md px-1.5 py-0.5 font-medium" style={{ backgroundColor: `${type.color}14`, color: type.color }}>{type.name}</span>}
              {project.site_city && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{project.site_city}</span>}
            </div>
            <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-stone-900">{project.name}</h1>
            <div className="mt-1 text-sm text-stone-500">
              Cliente: {client ? <Link to={`/clientes/${client.id}`} className="font-medium text-brand-700 hover:underline">{client.name}</Link> : '—'}
              {manager && <> · Responsável: <span className="font-medium text-stone-700">{manager.name}</span></>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={project.status}
              onChange={(e) => updateProject(project.id, { status: e.target.value as ProjectStatus }).catch(toast.error)}
              className={cn('h-9 cursor-pointer rounded-lg border-0 px-3 text-sm font-medium ring-1 ring-inset', st.badge)}
              aria-label="Status do projeto"
            >
              {PROJECT_STATUS_ORDER.map((s) => <option key={s} value={s}>{PROJECT_STATUS[s].label}</option>)}
            </select>
            <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Editar</Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setNewTask({ phase: null })}>Tarefa</Button>
            {isAdmin && (
              <IconButton label="Excluir projeto" onClick={() => setConfirmDelete(true)} className="text-stone-400 hover:text-rose-600">
                <Trash2 className="h-4 w-4" />
              </IconButton>
            )}
          </div>
        </div>

        <div className="grid border-t border-stone-100 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-stone-100">
          <Metric label="Progresso" icon={<Layers className="h-4 w-4" />}>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold tabular">{progress}%</span>
              <span className="truncate text-xs text-stone-500">Etapa: {phase}</span>
            </div>
            <ProgressBar value={progress} className="mt-2" color={project.status === 'concluido' ? '#10b981' : undefined} />
          </Metric>
          <Metric label="Prazo de entrega" icon={<CalendarRange className="h-4 w-4" />}>
            <div className="font-display text-lg font-bold">{formatDate(project.due_date)}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-stone-500">
              <DueBadge due={project.due_date} done={finished} soonDays={settings.due_soon_days} />
              {!finished && daysLeft !== null && daysLeft >= 0 && <span>início {formatDate(project.start_date)}</span>}
            </div>
          </Metric>
          <Metric label="Tarefas" icon={<ListChecks className="h-4 w-4" />}>
            <div className="font-display text-2xl font-bold tabular">
              {tasks.length - open.length}<span className="text-base font-medium text-stone-400">/{tasks.length}</span>
            </div>
            <div className={cn('mt-1 text-xs', overdue.length ? 'font-medium text-rose-600' : 'text-stone-500')}>
              {overdue.length ? `${overdue.length} atrasada${overdue.length > 1 ? 's' : ''}` : `${open.length} em aberto`}
            </div>
          </Metric>
          <Metric label="Horas registradas" icon={<Clock className="h-4 w-4" />}>
            <div className="font-display text-2xl font-bold tabular">{formatMinutes(minutes)}</div>
            <div className="mt-1 flex items-center justify-between text-xs text-stone-500">
              <span>{estimated ? `de ${formatNumber(estimated)}h estimadas` : 'sem estimativa'}</span>
              <AvatarStack users={people} max={5} size="xs" />
            </div>
          </Metric>
        </div>

        {/* Etapas */}
        {phases.length > 0 && (
          <div className="scrollbar-thin flex gap-1 overflow-x-auto border-t border-stone-100 px-5 py-3">
            {phases.map((p, i) => {
              const pt = tasks.filter((t) => (t.phase || 'Geral') === p);
              const done = pt.filter((t) => t.status === 'done').length;
              const complete = done === pt.length;
              const current = p === phase;
              return (
                <div key={p} className="min-w-[120px] flex-1">
                  <div className={cn('h-1.5 rounded-full', complete ? 'bg-emerald-500' : current ? 'bg-brand-500' : 'bg-stone-200')}>
                    {!complete && done > 0 && <div className="h-full rounded-full bg-brand-300" style={{ width: `${(done / pt.length) * 100}%` }} />}
                  </div>
                  <div className={cn('mt-1.5 flex items-center gap-1 text-[11px]', current ? 'font-semibold text-stone-900' : 'text-stone-500')}>
                    {complete ? <Check className="h-3 w-3 text-emerald-600" /> : <span className="text-stone-400">{i + 1}.</span>}
                    <span className="truncate">{p}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Tabs<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'tasks', label: <span className="inline-flex items-center gap-1.5"><ListChecks className="h-4 w-4" />Tarefas</span>, count: tasks.length },
          { id: 'timeline', label: <span className="inline-flex items-center gap-1.5"><GanttChartSquare className="h-4 w-4" />Cronograma</span> },
          { id: 'team', label: <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" />Equipe e horas</span> },
          { id: 'info', label: <span className="inline-flex items-center gap-1.5"><Info className="h-4 w-4" />Informações</span> },
          { id: 'activity', label: <span className="inline-flex items-center gap-1.5"><History className="h-4 w-4" />Atividade</span> },
        ]}
      />

      {tab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-2 text-sm text-stone-600">
              <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="accent-brand-600" />
              Ocultar concluídas
            </label>
            {tasks.length === 0 && (
              <Button size="sm" onClick={() => applyTemplates(project.id, project.start_date, project.manager_id).catch(toast.error)}>
                Gerar tarefas do modelo “{type?.name}”
              </Button>
            )}
          </div>
          {tasks.length === 0 && (
            <Card>
              <EmptyState icon={<ListChecks className="h-6 w-6" />} title="Nenhuma tarefa neste projeto" description="Gere as tarefas a partir do modelo ou crie manualmente." />
            </Card>
          )}
          {phases.map((p) => {
            const pt = tasks.filter((t) => (t.phase || 'Geral') === p).sort(byPosition);
            const visible = hideDone ? pt.filter((t) => t.status !== 'done') : pt;
            const done = pt.filter((t) => t.status === 'done').length;
            const pMinutes = totalMinutes(db.time_entries.filter((e) => pt.some((t) => t.id === e.task_id)));
            return (
              <div key={p} className="card overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 bg-stone-50/60 px-4 py-2.5">
                  <h3 className="font-display text-sm font-bold text-stone-900">{p}</h3>
                  <span className="text-xs text-stone-500 tabular">{done}/{pt.length}</span>
                  <ProgressBar value={(done / pt.length) * 100} className="w-24" color={done === pt.length ? '#10b981' : undefined} />
                  <span className="ml-auto text-xs text-stone-500">{pMinutes > 0 && formatMinutes(pMinutes)}</span>
                </div>
                <div className="divide-y divide-stone-100">
                  {visible.map((t) => <TaskRow key={t.id} task={t} onOpen={() => openTask(t.id)} />)}
                </div>
                <form
                  className="flex items-center gap-2 border-t border-stone-100 px-4 py-2"
                  onSubmit={(e) => { e.preventDefault(); addQuick(p); }}
                >
                  <Plus className="h-4 w-4 text-stone-400" />
                  <input
                    value={quick[p] ?? ''}
                    onChange={(e) => setQuick((q) => ({ ...q, [p]: e.target.value }))}
                    placeholder={`Adicionar tarefa em ${p}…`}
                    className="flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-stone-400"
                  />
                  {quick[p]?.trim() && <Button size="xs" type="submit" variant="dark">Adicionar</Button>}
                </form>
              </div>
            );
          })}
          {phases.length > 0 && (
            <Button variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setNewTask({ phase: null })}>
              Nova tarefa em outra etapa
            </Button>
          )}
        </div>
      )}

      {tab === 'timeline' && (
        <GanttChart tasks={tasks} profiles={maps.profiles} projectDue={project.due_date} onOpen={openTask} />
      )}

      {tab === 'team' && <TeamTab project={project} tasks={tasks} />}

      {tab === 'info' && <InfoTab project={project} />}

      {tab === 'activity' && (
        <Card className="p-5">
          {activity.length === 0 ? (
            <EmptyState title="Sem atividades registradas" />
          ) : (
            <ol className="space-y-3">
              {activity.map((a) => {
                const u = a.user_id ? maps.profiles[a.user_id] : null;
                return (
                  <li key={a.id} className="flex items-start gap-3 text-sm">
                    <Avatar user={u} size="sm" />
                    <div>
                      <span className="font-medium text-stone-900">{u?.name ?? 'Sistema'}</span>{' '}
                      <span className="text-stone-600">{a.description}</span>
                      <div className="text-xs text-stone-400" title={formatDateTime(a.created_at)}>{formatRelative(a.created_at)}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      )}

      {editing && <EditProjectModal project={project} onClose={() => setEditing(false)} />}
      {newTask && (
        <TaskFormModal
          onClose={() => setNewTask(null)}
          defaults={{ project_id: project.id, phase: newTask.phase, assignee_id: project.manager_id, start_date: today() }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Excluir projeto"
          danger
          confirmLabel="Excluir definitivamente"
          message={<>Excluir <b>{project.name}</b> e todas as suas {tasks.length} tarefas, horas e comentários? Esta ação não pode ser desfeita.</>}
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await deleteProject(project.id);
            toast.success('Projeto excluído.');
            navigate('/projetos');
          }}
        />
      )}
    </div>
  );
}

function Metric({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="border-stone-100 px-5 py-4 max-lg:border-t">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-stone-500">
        <span className="text-stone-400">{icon}</span>
        {label}
      </div>
      {children}
    </div>
  );
}

function TeamTab({ project, tasks }: { project: Project; tasks: Task[] }) {
  const { db, maps, updateProject } = useData();
  const toast = useToast();
  const rows = useMemo(() => {
    const ids = new Set<string>([...project.member_ids, ...(project.manager_id ? [project.manager_id] : [])]);
    tasks.forEach((t) => t.assignee_id && ids.add(t.assignee_id));
    const taskIds = new Set(tasks.map((t) => t.id));
    const entries = db.time_entries.filter((e) => taskIds.has(e.task_id));
    entries.forEach((e) => ids.add(e.user_id));
    return [...ids]
      .map((id) => {
        const mine = tasks.filter((t) => t.assignee_id === id);
        return {
          user: maps.profiles[id],
          open: mine.filter((t) => t.status !== 'done').length,
          done: mine.filter((t) => t.status === 'done').length,
          overdue: mine.filter((t) => t.status !== 'done' && t.due_date && t.due_date < today()).length,
          minutes: totalMinutes(entries.filter((e) => e.user_id === id)),
        };
      })
      .filter((r) => r.user)
      .sort((a, b) => b.minutes - a.minutes);
  }, [project, tasks, db.time_entries, maps.profiles]);
  const maxMin = Math.max(1, ...rows.map((r) => r.minutes));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Pessoa</th>
              <th className="px-4 py-2.5 text-right font-medium">Abertas</th>
              <th className="px-4 py-2.5 text-right font-medium">Concluídas</th>
              <th className="px-4 py-2.5 text-right font-medium">Atrasadas</th>
              <th className="w-1/3 px-4 py-2.5 font-medium">Horas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r) => (
              <tr key={r.user.id}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar user={r.user} size="sm" />
                    <div>
                      <div className="font-medium">{r.user.name}</div>
                      <div className="text-xs text-stone-500">{r.user.id === project.manager_id ? 'Responsável pelo projeto' : r.user.job_title}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular">{r.open}</td>
                <td className="px-4 py-3 text-right tabular">{r.done}</td>
                <td className={cn('px-4 py-3 text-right tabular', r.overdue && 'font-semibold text-rose-600')}>{r.overdue}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
                      <div className="h-full rounded-full" style={{ width: `${(r.minutes / maxMin) * 100}%`, backgroundColor: r.user.color }} />
                    </div>
                    <span className="w-16 text-right text-xs font-medium tabular">{formatMinutes(r.minutes)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className="space-y-4 p-5">
        <Field label="Responsável pelo projeto">
          <UserSelect users={db.profiles} value={project.manager_id} onChange={(id) => updateProject(project.id, { manager_id: id }).catch(toast.error)} />
        </Field>
        <Field label="Equipe do projeto">
          <MemberPicker users={db.profiles} value={project.member_ids} onChange={(ids) => updateProject(project.id, { member_ids: ids }).catch(toast.error)} />
        </Field>
      </Card>
    </div>
  );
}

function InfoTab({ project }: { project: Project }) {
  const { maps, updateProject } = useData();
  const toast = useToast();
  const client = maps.clients[project.client_id];
  const [notes, setNotes] = useState(project.notes ?? '');
  const [link, setLink] = useState({ label: '', url: '' });

  const addLink = async () => {
    if (!link.url.trim()) return;
    const url = /^https?:\/\//.test(link.url) ? link.url.trim() : `https://${link.url.trim()}`;
    await updateProject(project.id, { links: [...(project.links ?? []), { id: uid(), label: link.label.trim() || url, url }] }).catch(toast.error);
    setLink({ label: '', url: '' });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-5">
        <h3 className="mb-3 font-display text-sm font-bold">Cliente</h3>
        {client ? (
          <div className="space-y-2 text-sm">
            <Link to={`/clientes/${client.id}`} className="font-semibold text-brand-700 hover:underline">{client.name}</Link>
            <div className="text-stone-500">{client.document}</div>
            <div className="flex items-center gap-2 text-stone-700"><Phone className="h-4 w-4 text-stone-400" />{client.phone}</div>
            <div className="flex items-center gap-2 text-stone-700"><Mail className="h-4 w-4 text-stone-400" />{client.email}</div>
            <div className="flex items-start gap-2 text-stone-700">
              <MapPin className="mt-0.5 h-4 w-4 text-stone-400" />
              <span>{client.street}, {client.number}{client.complement ? ` - ${client.complement}` : ''}<br />{client.neighborhood} · {client.city}/{client.state} · {client.cep}</span>
            </div>
          </div>
        ) : <p className="text-sm text-stone-500">Cliente não encontrado.</p>}
      </Card>
      <Card className="p-5">
        <h3 className="mb-3 font-display text-sm font-bold">Dados do projeto</h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-stone-500">Área</dt><dd className="font-medium">{project.area_m2 ? `${formatNumber(project.area_m2)} m²` : '—'}</dd></div>
          <div><dt className="text-xs text-stone-500">Início</dt><dd className="font-medium">{formatDate(project.start_date)}</dd></div>
          <div className="col-span-2"><dt className="text-xs text-stone-500">Endereço da obra</dt><dd className="font-medium">{project.site_address || '—'}{project.site_city ? ` · ${project.site_city}` : ''}</dd></div>
          <div className="col-span-2"><dt className="text-xs text-stone-500">Escopo</dt><dd className="whitespace-pre-wrap text-stone-700">{project.description || '—'}</dd></div>
          {project.completed_at && <div className="col-span-2"><dt className="text-xs text-stone-500">Concluído em</dt><dd className="font-medium">{formatDateTime(project.completed_at)}</dd></div>}
        </dl>
      </Card>
      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-bold"><Link2 className="h-4 w-4 text-stone-400" />Links e arquivos</h3>
        <ul className="space-y-1.5">
          {(project.links ?? []).map((l) => (
            <li key={l.id} className="group flex items-center gap-2 text-sm">
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-stone-400" />
              <a href={l.url} target="_blank" rel="noreferrer" className="flex-1 truncate text-brand-700 hover:underline">{l.label}</a>
              <button onClick={() => updateProject(project.id, { links: project.links.filter((x) => x.id !== l.id) }).catch(toast.error)} className="text-stone-300 opacity-0 hover:text-rose-600 group-hover:opacity-100" aria-label="Remover link">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {(project.links ?? []).length === 0 && <li className="text-xs text-stone-500">Pasta do Drive, pranchas, contrato, fotos da obra…</li>}
        </ul>
        <div className="mt-3 space-y-2">
          <Input value={link.label} onChange={(e) => setLink({ ...link, label: e.target.value })} placeholder="Nome (ex.: Pasta no Drive)" className="h-8 py-1" />
          <div className="flex gap-2">
            <Input value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} placeholder="https://…" className="h-8 py-1" />
            <Button size="sm" onClick={addLink} disabled={!link.url.trim()}>Adicionar</Button>
          </div>
        </div>
      </Card>
      <Card className="p-5 lg:col-span-3">
        <h3 className="mb-3 font-display text-sm font-bold">Anotações do projeto</h3>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => (notes || null) !== project.notes && updateProject(project.id, { notes: notes || null }).then(() => toast.success('Anotações salvas.')).catch(toast.error)}
          rows={6}
          placeholder="Decisões do cliente, pendências, observações de obra… (salva automaticamente)"
        />
      </Card>
    </div>
  );
}

function EditProjectModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const { db, updateProject } = useData();
  const toast = useToast();
  const [v, setV] = useState(project);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Project>(k: K, value: Project[K]) => setV((p) => ({ ...p, [k]: value }));
  const save = async () => {
    if (!v.name.trim()) return toast.error('Informe o nome do projeto.');
    setBusy(true);
    try {
      await updateProject(project.id, {
        name: v.name.trim(), client_id: v.client_id, project_type_id: v.project_type_id, status: v.status,
        manager_id: v.manager_id, member_ids: v.member_ids, start_date: v.start_date, due_date: v.due_date,
        area_m2: v.area_m2, site_address: v.site_address, site_city: v.site_city, description: v.description,
      });
      toast.success('Projeto atualizado.');
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Editar projeto"
      onClose={onClose}
      size="lg"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} onClick={save}>Salvar</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-6">
        <Field label="Nome" className="sm:col-span-3"><Input value={v.name} onChange={(e) => set('name', e.target.value.toUpperCase())} /></Field>
        <Field label="Cliente" className="sm:col-span-3">
          <Select value={v.client_id} onChange={(e) => set('client_id', e.target.value)}>
            {db.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Tipo de projeto" className="sm:col-span-3" hint="Mudar o tipo não recria as tarefas existentes.">
          <Select value={v.project_type_id} onChange={(e) => set('project_type_id', e.target.value)}>
            {db.project_types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Status" className="sm:col-span-3">
          <Select value={v.status} onChange={(e) => set('status', e.target.value as ProjectStatus)}>
            {PROJECT_STATUS_ORDER.map((s) => <option key={s} value={s}>{PROJECT_STATUS[s].label}</option>)}
          </Select>
        </Field>
        <Field label="Início" className="sm:col-span-2"><Input type="date" value={v.start_date} onChange={(e) => set('start_date', e.target.value)} /></Field>
        <Field label="Prazo de entrega" className="sm:col-span-2"><Input type="date" value={v.due_date ?? ''} onChange={(e) => set('due_date', e.target.value || null)} /></Field>
        <Field label="Área (m²)" className="sm:col-span-2"><Input type="number" value={v.area_m2 ?? ''} onChange={(e) => set('area_m2', e.target.value ? Number(e.target.value) : null)} /></Field>
        <Field label="Endereço da obra" className="sm:col-span-4"><Input value={v.site_address ?? ''} onChange={(e) => set('site_address', e.target.value || null)} /></Field>
        <Field label="Cidade" className="sm:col-span-2"><Input value={v.site_city ?? ''} onChange={(e) => set('site_city', e.target.value || null)} /></Field>
        <Field label="Responsável" className="sm:col-span-6"><UserSelect users={db.profiles} value={v.manager_id} onChange={(id) => set('manager_id', id)} /></Field>
        <Field label="Equipe" className="sm:col-span-6"><MemberPicker users={db.profiles} value={v.member_ids} onChange={(ids) => set('member_ids', ids)} /></Field>
        <Field label="Escopo" className="sm:col-span-6"><Textarea value={v.description ?? ''} onChange={(e) => set('description', e.target.value || null)} /></Field>
      </div>
      <p className="mt-4 text-xs text-stone-500"><Badge>Dica</Badge> Para alterar datas de tarefas específicas, abra a tarefa na aba Tarefas ou no Cronograma.</p>
    </Modal>
  );
}
