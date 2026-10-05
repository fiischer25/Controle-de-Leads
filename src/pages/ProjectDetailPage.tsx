import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { ProjectFinanceTab } from '../components/finance/ProjectFinanceTab';
import { ProjectTasksTable } from '../components/projects/ProjectTasksTable';
import { ClientEditModal } from '../components/clients/ClientEditModal';
import { WonDealModal } from '../components/leads/WonDealModal';
import { planSummary } from '../lib/paymentPlan';
import { SaveAsTemplateModal } from '../components/projects/SaveAsTemplateModal';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useToast } from '../context/ToastContext';
import { PROJECT_STATUS, PROJECT_STATUS_ORDER } from '../lib/constants';
import { orderedPhases, totalMinutes } from '../lib/domain';
import type { Project, ProjectStatus, Task } from '../lib/types';
import {
  byPosition,
  cn,
  deadlineState,
  dueLabel,
  formatDate,
  formatDateShort,
  formatDateTime,
  formatMinutes,
  formatMoney,
  formatNumber,
  formatRelative,
  today,
  uid,
} from '../lib/utils';
import { CSS_COLOR } from '../lib/status';
import {
  ActionLink,
  Avatar,
  BackLink,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Listbox,
  MetricRow,
  Modal,
  PageHeader,
  SectionHeader,
  Select,
  Switch,
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

type Tab = 'tasks' | 'timeline' | 'team' | 'info' | 'finance' | 'activity';

export default function ProjectDetailPage() {
  const { id } = useParams();
  const { db, maps, isAdmin, settings, updateProject, deleteProject, applyTemplates, createTask, can } = useData();
  const summary = useProjectSummaries().find((s) => s.project.id === id);
  const toast = useToast();
  const navigate = useNavigate();
  const openTask = useOpenTask();
  const [params] = useSearchParams();
  // ?aba=financeiro abre direto no Financeiro (link da Rentabilidade)
  const [tab, setTab] = useState<Tab>(() => (params.get('aba') === 'financeiro' && can('financeiro') ? 'finance' : 'tasks'));
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newTask, setNewTask] = useState<{ phase: string | null } | null>(null);
  const [quick, setQuick] = useState<Record<string, string>>({});
  const [hideDone, setHideDone] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  // Tela larga: tabela por etapas (como a referência); celular e tablet: lista
  const wide = useMediaQuery('(min-width: 1180px)');

  if (!summary) {
    return (
      <div>
        <BackLink to="/projetos">Projetos</BackLink>
        <EmptyState title="Projeto não encontrado" description="Ele pode ter sido excluído." className="py-20" />
      </div>
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
  const dueState = deadlineState(project.due_date, finished, settings.due_soon_days);
  const currentIdx = project.status === 'concluido' ? phases.length : open.length === 0 && tasks.length ? phases.length : phases.indexOf(phase);

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
      <BackLink to="/projetos">Projetos</BackLink>
      <PageHeader
        className="md:pt-4"
        eyebrow={[project.code, type?.name, project.site_city].filter(Boolean).join(' · ')}
        title={project.name}
        description={
          <>
            {client ? (
              <Link to={`/clientes/${client.id}`} className="hover:text-ink hover:underline hover:decoration-stone-300 hover:underline-offset-4">
                {client.name}
              </Link>
            ) : (
              'Cliente removido'
            )}
            {manager && <> · responsável {manager.name}</>}
          </>
        }
        actions={
          <>
            <div className="w-44">
              <Listbox
                value={project.status}
                onChange={(v) => updateProject(project.id, { status: v as ProjectStatus }).catch(toast.error)}
                options={PROJECT_STATUS_ORDER.map((s) => ({
                  value: s,
                  label: PROJECT_STATUS[s].label,
                  icon: <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', PROJECT_STATUS[s].dot)} />,
                }))}
                aria-label="Status do projeto"
                className={cn('border-transparent font-medium', st.badge)}
              />
            </div>
            <IconButton label="Editar projeto" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" strokeWidth={1.6} />
            </IconButton>
            {isAdmin && (
              <IconButton label="Excluir projeto" onClick={() => setConfirmDelete(true)} className="hover:text-danger-fg">
                <Trash2 className="h-4 w-4" strokeWidth={1.6} />
              </IconButton>
            )}
            <Button variant="primary" icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => setNewTask({ phase: null })}>
              Tarefa
            </Button>
          </>
        }
      />

      {/* Trilho de etapas */}
      {phases.length > 0 && (
        <section aria-label="Etapas" className="scrollbar-none -mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
          <div className="flex min-w-[560px] gap-[3px]">
            {phases.map((p, i) => {
              const state = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'next';
              return (
                <div key={p} className="min-w-0 flex-1">
                  <div
                    className="h-0.5 rounded-full"
                    style={{ backgroundColor: state === 'done' ? CSS_COLOR.stone(800) : state === 'current' ? CSS_COLOR.accent : CSS_COLOR.lineStrong }}
                  />
                  <div className={cn('mt-2 truncate pr-2 text-[12px]', state === 'current' ? 'font-medium text-ink' : 'text-faint')} title={p}>
                    {p}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <MetricRow
        className="mt-10"
        label="Visão geral"
        items={[
          { label: 'Progresso', value: `${progress}%`, sub: finished ? PROJECT_STATUS[project.status].label : `Etapa: ${phase}` },
          {
            label: 'Prazo de entrega',
            value: project.due_date ? formatDateShort(project.due_date) : '—',
            tone: dueState === 'overdue' ? 'text-danger-fg' : dueState === 'soon' || dueState === 'today' ? 'text-warning-fg' : undefined,
            sub: project.due_date ? (finished ? `início ${formatDate(project.start_date)}` : dueLabel(project.due_date)) : 'sem prazo definido',
          },
          {
            label: 'Tarefas concluídas',
            value: (
              <>
                {tasks.length - open.length}
                <span className="text-faint">/{tasks.length}</span>
              </>
            ),
            sub: overdue.length ? <span className="text-danger-fg">{overdue.length} {overdue.length === 1 ? 'atrasada' : 'atrasadas'}</span> : `${open.length} em aberto`,
          },
          { label: 'Horas registradas', value: formatMinutes(minutes), sub: estimated ? `de ${formatNumber(estimated)}h estimadas` : 'sem estimativa' },
        ]}
      />

      <Tabs<Tab>
        className="mt-12 md:mt-14"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'tasks', label: 'Tarefas', count: tasks.length },
          { id: 'timeline', label: 'Cronograma' },
          { id: 'team', label: 'Equipe e horas', count: people.length },
          { id: 'info', label: 'Informações' },
          ...(can('financeiro') ? [{ id: 'finance' as const, label: 'Financeiro' }] : []),
          { id: 'activity', label: 'Atividade' },
        ]}
      />

      <div className="mt-6">
        {tab === 'tasks' && (
          <div className="space-y-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Switch checked={hideDone} onChange={setHideDone} label={<span className="text-[13px] text-muted">Ocultar concluídas</span>} />
              {tasks.length === 0 && (
                <ActionLink onClick={() => applyTemplates(project.id, project.manager_id).catch(toast.error)}>
                  Gerar tarefas do modelo “{type?.name}”
                </ActionLink>
              )}
              {tasks.length > 0 && can('configuracoes') && <ActionLink onClick={() => setSavingTemplate(true)}>Usar como modelo</ActionLink>}
            </div>
            {tasks.length === 0 && (
              <EmptyState title="Nenhuma tarefa neste projeto" description="Gere as tarefas a partir do modelo ou crie manualmente." className="py-12" />
            )}
            {wide && tasks.length > 0 && (
              <ProjectTasksTable project={project} tasks={tasks} phases={phases} hideDone={hideDone} onOpen={openTask} />
            )}
            {!wide && phases.map((p, i) => {
              const pt = tasks.filter((t) => (t.phase || 'Geral') === p).sort(byPosition);
              const visible = hideDone ? pt.filter((t) => t.status !== 'done') : pt;
              const done = pt.filter((t) => t.status === 'done').length;
              const pMinutes = totalMinutes(db.time_entries.filter((e) => pt.some((t) => t.id === e.task_id)));
              return (
                <section key={p} aria-label={p}>
                  <div className="flex items-baseline justify-between gap-3 border-b border-hairline pb-2.5">
                    <h3 className="flex min-w-0 items-baseline gap-2">
                      <span className="text-[12.5px] tabular text-faint">{i + 1}.</span>
                      <span className="truncate font-display text-[15px] font-semibold text-ink">{p}</span>
                      <span className={cn('text-[12.5px] tabular', done === pt.length ? 'text-success-fg' : 'text-faint')}>
                        {done}/{pt.length}
                      </span>
                    </h3>
                    {pMinutes > 0 && <span className="shrink-0 text-[12.5px] tabular text-faint">{formatMinutes(pMinutes)}</span>}
                  </div>
                  <div className="divide-y divide-hairline-surface [&>div]:px-0 md:[&>div]:px-2">
                    {visible.map((t) => (
                      <TaskRow key={t.id} task={t} onOpen={() => openTask(t.id)} />
                    ))}
                  </div>
                  <form
                    className="flex items-center gap-2 border-t border-hairline-surface py-2 md:px-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      addQuick(p);
                    }}
                  >
                    <Plus className="h-4 w-4 shrink-0 text-faint" strokeWidth={1.6} />
                    <input
                      value={quick[p] ?? ''}
                      onChange={(e) => setQuick((q) => ({ ...q, [p]: e.target.value }))}
                      placeholder={`Adicionar tarefa em ${p}…`}
                      aria-label={`Adicionar tarefa em ${p}`}
                      className="flex-1 rounded-xs bg-transparent py-1.5 text-body outline-none placeholder:text-faint focus-visible:shadow-none"
                    />
                    {quick[p]?.trim() && (
                      <Button size="xs" type="submit" variant="primary">
                        Adicionar
                      </Button>
                    )}
                  </form>
                </section>
              );
            })}
            {phases.length > 0 && <ActionLink onClick={() => setNewTask({ phase: null })}>Nova tarefa em outra etapa</ActionLink>}
          </div>
        )}

        {tab === 'timeline' && <GanttChart tasks={tasks} profiles={maps.profiles} projectDue={project.due_date} onOpen={openTask} />}

        {tab === 'team' && <TeamTab project={project} tasks={tasks} />}

        {tab === 'info' && <InfoTab project={project} onEditProject={() => setEditing(true)} />}

        {tab === 'finance' && can('financeiro') && <ProjectFinanceTab project={project} />}

        {tab === 'activity' &&
          (activity.length === 0 ? (
            <EmptyState title="Sem atividades registradas" className="py-12" />
          ) : (
            <ol>
              {activity.map((a) => {
                const u = a.user_id ? maps.profiles[a.user_id] : null;
                return (
                  <li key={a.id} className="flex items-start gap-3 border-b border-hairline py-3 text-body">
                    <Avatar user={u} size="sm" />
                    <div className="min-w-0">
                      <span className="text-ink">{u?.name.split(' ')[0] ?? 'Sistema'}</span> <span className="text-muted">{a.description}</span>
                      <div className="text-[12.5px] text-faint" title={formatDateTime(a.created_at)}>
                        {formatRelative(a.created_at)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          ))}
      </div>

      {editing && <EditProjectModal project={project} onClose={() => setEditing(false)} />}
      {newTask && (
        <TaskFormModal
          onClose={() => setNewTask(null)}
          defaults={{ project_id: project.id, phase: newTask.phase, assignee_id: project.manager_id, start_date: today() }}
        />
      )}
      {savingTemplate && <SaveAsTemplateModal project={project} tasks={tasks} onClose={() => setSavingTemplate(false)} />}
      {confirmDelete && (
        <ConfirmDialog
          title="Excluir projeto"
          danger
          confirmLabel="Excluir definitivamente"
          message={
            <>
              Excluir <b>{project.name}</b> e todas as suas {tasks.length} tarefas, horas e comentários? Esta ação não pode ser desfeita.
            </>
          }
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
    <div className="grid gap-12 lg:grid-cols-[1fr_300px] lg:gap-16">
      <section aria-label="Pessoas e horas">
        <div className="hidden grid-cols-[minmax(0,1fr)_64px_64px_64px_minmax(0,1fr)] gap-6 border-b border-hairline pb-2.5 text-[12.5px] text-faint md:grid">
          <span>Pessoa</span>
          <span className="text-right">Abertas</span>
          <span className="text-right">Feitas</span>
          <span className="text-right">Atrasadas</span>
          <span>Horas</span>
        </div>
        {rows.length === 0 && <p className="py-6 text-[13px] text-faint">Ninguém ligado a este projeto ainda.</p>}
        <ul>
          {rows.map((r) => (
            <li
              key={r.user.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 border-b border-hairline py-3.5 md:grid-cols-[minmax(0,1fr)_64px_64px_64px_minmax(0,1fr)]"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar user={r.user} size="sm" />
                <div className="min-w-0">
                  <div className="truncate text-body text-ink">{r.user.name}</div>
                  <div className="truncate text-[12.5px] text-faint">{r.user.id === project.manager_id ? 'Responsável pelo projeto' : r.user.job_title}</div>
                </div>
              </div>
              <span className="hidden text-right text-[13px] tabular text-muted md:block">{r.open}</span>
              <span className="hidden text-right text-[13px] tabular text-muted md:block">{r.done}</span>
              <span className={cn('hidden text-right text-[13px] tabular md:block', r.overdue ? 'text-danger-fg' : 'text-faint')}>{r.overdue}</span>
              <div className="flex items-center gap-3">
                <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-hairline max-md:w-16">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${(r.minutes / maxMin) * 100}%` }} />
                </div>
                <span className="w-16 text-right text-[13px] tabular text-muted">{formatMinutes(r.minutes)}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <aside className="space-y-6">
        <Field label="Responsável pelo projeto">
          <UserSelect users={db.profiles} value={project.manager_id} onChange={(id) => updateProject(project.id, { manager_id: id }).catch(toast.error)} />
        </Field>
        <Field label="Equipe do projeto">
          <MemberPicker users={db.profiles} value={project.member_ids} onChange={(ids) => updateProject(project.id, { member_ids: ids }).catch(toast.error)} />
        </Field>
      </aside>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-t border-hairline py-3">
      <dt className="text-[12.5px] text-faint">{label}</dt>
      <dd className="mt-0.5 text-body text-ink">{children}</dd>
    </div>
  );
}

function InfoTab({ project, onEditProject }: { project: Project; onEditProject: () => void }) {
  const { maps, updateProject, closeDeal, can } = useData();
  const toast = useToast();
  const client = maps.clients[project.client_id];
  // Oportunidade que originou o projeto (forma de pagamento do contrato)
  const lead = project.lead_id ? maps.leads[project.lead_id] : null;
  const [editingClient, setEditingClient] = useState(false);
  const [editingPlan, setEditingPlan] = useState(false);
  const [notes, setNotes] = useState(project.notes ?? '');
  const [link, setLink] = useState({ label: '', url: '' });

  const addLink = async () => {
    if (!link.url.trim()) return;
    const url = /^https?:\/\//.test(link.url) ? link.url.trim() : `https://${link.url.trim()}`;
    await updateProject(project.id, { links: [...(project.links ?? []), { id: uid(), label: link.label.trim() || url, url }] }).catch(toast.error);
    setLink({ label: '', url: '' });
  };

  return (
    <div className="grid gap-12 lg:grid-cols-3 lg:gap-12">
      <section aria-labelledby="info-projeto" className="panel">
        <SectionHeader id="info-projeto" title="Projeto" aside={<ActionLink onClick={onEditProject}>Editar</ActionLink>} />
        <dl>
          <InfoRow label="Área">{project.area_m2 ? `${formatNumber(project.area_m2)} m²` : '—'}</InfoRow>
          <InfoRow label="Início">{formatDate(project.start_date)}</InfoRow>
          <InfoRow label="Endereço da obra">
            {project.site_address || '—'}
            {project.site_city ? ` · ${project.site_city}` : ''}
          </InfoRow>
          <InfoRow label="Escopo">
            <span className="whitespace-pre-wrap text-stone-700">{project.description || '—'}</span>
          </InfoRow>
          {project.completed_at && <InfoRow label="Concluído em">{formatDateTime(project.completed_at)}</InfoRow>}
        </dl>
      </section>
      <section aria-labelledby="info-cliente" className="panel">
        <SectionHeader
          id="info-cliente"
          title="Cliente"
          aside={
            client && (
              <span className="flex items-center gap-4">
                <ActionLink to={`/clientes/${client.id}`} muted>
                  Abrir
                </ActionLink>
                <ActionLink onClick={() => setEditingClient(true)}>Editar</ActionLink>
              </span>
            )
          }
        />
        {client ? (
          <dl>
            <InfoRow label="Nome">{client.name}</InfoRow>
            <InfoRow label="CPF / CNPJ">{client.document || '—'}</InfoRow>
            <InfoRow label="Telefone">{client.phone}</InfoRow>
            <InfoRow label="E-mail">
              <span className="break-all">{client.email}</span>
            </InfoRow>
            <InfoRow label="Endereço">
              {client.street}, {client.number}
              {client.complement ? ` - ${client.complement}` : ''}
              <span className="block text-[13px] text-muted">
                {client.neighborhood} · {client.city}/{client.state} · {client.cep}
              </span>
            </InfoRow>
          </dl>
        ) : (
          <p className="text-[13px] text-faint">Cliente não encontrado.</p>
        )}
      </section>
      {lead && (can('comercial') || can('financeiro')) && (
        <section aria-labelledby="info-contrato" className="panel">
          <SectionHeader
            id="info-contrato"
            title="Contrato"
            aside={<ActionLink onClick={() => setEditingPlan(true)}>{lead.payment_plan ? 'Editar' : 'Definir'}</ActionLink>}
          />
          {lead.payment_plan ? (
            <dl>
              <InfoRow label="Valor fechado">{formatMoney(lead.payment_plan.total)}</InfoRow>
              <InfoRow label="Forma de pagamento">{planSummary(lead.payment_plan.rows)}</InfoRow>
              {lead.payment_plan.rows.map((r, i) => (
                <InfoRow key={i} label={r.label || `Parcela ${i + 1}`}>
                  <span className="tabular">
                    {formatMoney(r.value ?? (lead.payment_plan!.total * (Number(r.percent) || 0)) / 100)} · {Number(r.percent).toLocaleString('pt-BR')}% ·{' '}
                    {formatDate(r.due_date)}
                  </span>
                </InfoRow>
              ))}
            </dl>
          ) : (
            <p className="text-[13px] text-faint">Forma de pagamento ainda não definida.</p>
          )}
        </section>
      )}
      <section aria-labelledby="info-links" className="panel">
        <SectionHeader id="info-links" title="Links e arquivos" />
        <ul>
          {(project.links ?? []).map((l) => (
            <li key={l.id} className="group flex items-center gap-2 border-t border-hairline py-3 text-body">
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-faint" strokeWidth={1.8} />
              <a href={l.url} target="_blank" rel="noreferrer" className="flex-1 truncate text-accent-fg hover:underline">
                {l.label}
              </a>
              <button
                type="button"
                onClick={() => updateProject(project.id, { links: project.links.filter((x) => x.id !== l.id) }).catch(toast.error)}
                className="rounded-xs text-faint opacity-0 hover:text-danger-fg focus-visible:opacity-100 group-hover:opacity-100"
                aria-label={`Remover ${l.label}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {(project.links ?? []).length === 0 && <li className="border-t border-hairline py-3 text-[13px] text-faint">Pasta do Drive, pranchas, contrato, fotos da obra…</li>}
        </ul>
        <div className="mt-3 space-y-2">
          <Input value={link.label} onChange={(e) => setLink({ ...link, label: e.target.value })} placeholder="Nome (ex.: Pasta no Drive)" className="h-8" />
          <div className="flex gap-2">
            <Input value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} placeholder="https://…" className="h-8" />
            <Button size="sm" onClick={addLink} disabled={!link.url.trim()}>
              Adicionar
            </Button>
          </div>
        </div>
      </section>
      <section aria-labelledby="info-notas" className="panel lg:col-span-3">
        <SectionHeader id="info-notas" title="Anotações" aside={<span className="text-[12.5px] text-faint">salva ao sair do campo</span>} />
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() =>
            (notes || null) !== project.notes &&
            updateProject(project.id, { notes: notes || null })
              .then(() => toast.success('Anotações salvas.'))
              .catch(toast.error)
          }
          rows={6}
          placeholder="Decisões do cliente, pendências, observações de obra…"
        />
      </section>
      {editingClient && client && <ClientEditModal client={client} onClose={() => setEditingClient(false)} />}
      {editingPlan && lead && (
        <WonDealModal
          lead={lead}
          mode="edit"
          onClose={() => setEditingPlan(false)}
          onSubmit={async (plan, launch) => {
            if (!plan) return;
            const n = await closeDeal(lead.id, plan, launch, true);
            toast.success(n > 0 ? `Contrato salvo e ${n} ${n === 1 ? 'parcela atualizada' : 'parcelas atualizadas'} no Financeiro.` : 'Contrato salvo.');
          }}
        />
      )}
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
