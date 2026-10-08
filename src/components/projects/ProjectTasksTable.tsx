import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, Flag, ListChecks, MoreVertical, Plus, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { SWATCHES, TASK_PRIORITY, TASK_STATUS_ORDER } from '../../lib/constants';
import { businessDaysBetween, datesForDuration, entryMinutes } from '../../lib/domain';
import { TASK_STATUS_STYLE } from '../../lib/status';
import type { Project, Task, TaskStatus } from '../../lib/types';
import { byPosition, cn, formatDateShort, formatMinutes, formatNumber, today } from '../../lib/utils';
import { Badge, Button, ConfirmDialog, IconButton, Input, MenuItem, Popover } from '../ui';
import { AssigneePicker } from '../tasks/AssigneePicker';
import { commonAssignee } from '../tasks/taskBuckets';

const phaseColor = (i: number) => SWATCHES[i % SWATCHES.length];
/** Tarefas que a troca de responsável da etapa alcança: as abertas (ou todas, se já concluídas). */
const phaseTargets = (all: Task[]) => {
  const open = all.filter((x) => x.status !== 'done');
  return open.length ? open : all;
};
const daysLabel = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
const cols =
  'grid grid-cols-[48px_minmax(0,1fr)_56px_118px_64px_60px_60px_58px_70px_128px_84px_36px] items-center gap-x-2';

/**
 * Tarefas do projeto em tabela por etapas (como a referência): etapas numeradas e recolhíveis
 * com totais; tarefas com checklist, status, duração, início, fim, horas estimadas e realizadas,
 * responsável e prioridade. Clique na tarefa abre a gaveta (checklist e observações).
 */
export function ProjectTasksTable({
  project,
  tasks,
  phases,
  hideDone,
  onOpen,
  bare = false,
  allowAdd = true,
  phaseNumbers,
  taskNumbers,
}: {
  project: Project;
  tasks: Task[];
  phases: string[];
  hideDone: boolean;
  onOpen: (taskId: string) => void;
  /** Sem borda própria (dentro de outro cartão, ex.: Minhas tarefas). */
  bare?: boolean;
  /** Botão "+" para criar tarefa na etapa. */
  allowAdd?: boolean;
  /** Numeração do projeto inteiro quando a tabela mostra só parte das tarefas. */
  phaseNumbers?: Record<string, number>;
  taskNumbers?: Record<string, string>;
}) {
  const { db, maps, me, isAdmin, updateTask, assignTasks, deleteTask, createTask } = useData();
  const toast = useToast();
  const t = today();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState<{ phase: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);

  const minutesByTask = useMemo(() => {
    const ids = new Set(tasks.map((x) => x.id));
    const out: Record<string, number> = {};
    for (const e of db.time_entries) if (ids.has(e.task_id)) out[e.task_id] = (out[e.task_id] ?? 0) + entryMinutes(e);
    return out;
  }, [db.time_entries, tasks]);

  const quickAdd = async () => {
    if (!adding?.title.trim()) return;
    const phaseTasks = tasks.filter((x) => (x.phase || 'Geral') === adding.phase).sort(byPosition);
    const last = phaseTasks[phaseTasks.length - 1];
    try {
      await createTask({
        title: adding.title.trim(),
        project_id: project.id,
        phase: adding.phase === 'Geral' ? null : adding.phase,
        assignee_id: project.manager_id,
        position: last ? last.position + 0.5 : tasks.length,
        start_date: last?.due_date ?? project.start_date,
        due_date: last?.due_date ?? null,
      });
      setAdding({ ...adding, title: '' });
    } catch (e) {
      toast.error(e);
    }
  };

  const setStatus = (task: Task, status: TaskStatus) => updateTask(task.id, { status }).catch(toast.error);
  /** Responsável da etapa inteira de uma vez. */
  const assignPhase = async (phase: string, targets: Task[], id: string | null) => {
    try {
      const n = await assignTasks(targets.map((x) => x.id), id, `“${phase}” (${project.name})`);
      const who = id ? maps.profiles[id]?.name.split(' ')[0] : null;
      if (n) toast.success(`${n} ${n === 1 ? 'tarefa' : 'tarefas'} de ${phase} ${who ? `agora com ${who}` : 'sem responsável'}.`);
    } catch (e) {
      toast.error(e);
    }
  };
  /** Datas digitadas na tabela; mantém o fim depois do início. */
  const setDates = (task: Task, patch: { start_date?: string | null; due_date?: string | null }) => {
    const next = { ...patch };
    if (next.start_date && task.due_date && next.start_date > task.due_date) next.due_date = next.start_date;
    if (next.due_date && task.start_date && next.due_date < task.start_date) next.start_date = next.due_date;
    return updateTask(task.id, next).catch(toast.error);
  };
  const dateCls = (task: Task) => (task.status !== 'done' && task.due_date && task.due_date < t ? 'text-danger-fg' : 'text-stone-600');

  return (
    <div className={cn('overflow-hidden bg-surface', !bare && 'rounded-[16px] border border-line shadow-card')}>
      <div className={cn(cols, 'border-b border-line/70 bg-stone-50 px-3 py-2 text-[11.5px] font-medium text-stone-500')}>
        <span>Nº</span>
        <span>Etapas / tarefas</span>
        <span className="text-center">Checklist</span>
        <span>Status</span>
        <span>Duração</span>
        <span>Início</span>
        <span>Fim</span>
        <span className="text-right">H. est.</span>
        <span className="text-right">H. real.</span>
        <span>Responsável</span>
        <span>Prioridade</span>
        <span />
      </div>

      {phases.map((phase, pi) => {
        const all = tasks.filter((x) => (x.phase || 'Geral') === phase).sort(byPosition);
        const visible = hideDone ? all.filter((x) => x.status !== 'done') : all;
        const starts = all.map((x) => x.start_date).filter(Boolean) as string[];
        const dues = all.map((x) => x.due_date).filter(Boolean) as string[];
        const pStart = starts.sort()[0];
        const pEnd = dues.sort().pop();
        const est = all.reduce((a, x) => a + (x.estimated_hours ?? 0), 0);
        const real = all.reduce((a, x) => a + (minutesByTask[x.id] ?? 0), 0);
        const done = all.filter((x) => x.status === 'done').length;
        const open = !collapsed[phase];
        return (
          <div key={phase} className="border-b border-line/70 last:border-b-0">
            <div className={cn(cols, 'bg-stone-50/60 px-3 py-2.5')}>
              <span className="text-[13px] tabular text-stone-500">{phaseNumbers?.[phase] ?? pi + 1}</span>
              <span className="col-span-3 flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [phase]: open }))}
                  aria-label={open ? `Recolher ${phase}` : `Expandir ${phase}`}
                  className="text-stone-500 hover:text-ink"
                >
                  {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: phaseColor(pi) }} aria-hidden />
                <span className="truncate text-[13.5px] font-semibold text-ink" title={phase}>
                  {phase}
                </span>
                {allowAdd && (
                  <IconButton label={`Adicionar tarefa em ${phase}`} size="xs" onClick={() => setAdding({ phase, title: '' })}>
                    <Plus className="h-3.5 w-3.5" />
                  </IconButton>
                )}
                <span className={cn('shrink-0 text-[12px] tabular', done === all.length && all.length ? 'text-success-fg' : 'text-stone-500')}>
                  {done}/{all.length} {all.length === 1 ? 'tarefa' : 'tarefas'}
                </span>
              </span>
              <span className="text-[12.5px] tabular text-stone-600">{pStart && pEnd ? daysLabel(businessDaysBetween(pStart, pEnd)) : ''}</span>
              <span className="text-[12.5px] tabular text-stone-600">{pStart ? formatDateShort(pStart) : ''}</span>
              <span className="text-[12.5px] tabular text-stone-600">{pEnd ? formatDateShort(pEnd) : ''}</span>
              <span className="text-right text-[12.5px] tabular text-stone-600">{est ? `${formatNumber(est, 1)}h` : ''}</span>
              <span className="text-right text-[12.5px] tabular text-stone-600">{real ? formatMinutes(real) : ''}</span>
              <span className="min-w-0">
                {/* Responsável da etapa: vale para as tarefas abertas (as concluídas ficam como estão) */}
                {all.length > 0 && (
                  <AssigneePicker
                    value={commonAssignee(phaseTargets(all))}
                    label={`Responsável pela etapa ${phase}`}
                    hint={`Vale para ${phaseTargets(all).length === 1 ? 'a tarefa' : `as ${phaseTargets(all).length} tarefas`} ${all.some((x) => x.status !== 'done') ? 'abertas ' : ''}da etapa.`}
                    onChange={(id) => assignPhase(phase, phaseTargets(all), id)}
                  />
                )}
              </span>
              <span />
              <span />
            </div>

            {open &&
              visible.map((task) => {
                const ti = all.indexOf(task);
                const st = TASK_STATUS_STYLE[task.status];
                const pr = TASK_PRIORITY[task.priority];
                const person = task.assignee_id ? maps.profiles[task.assignee_id] : null;
                const checklist = task.checklist ?? [];
                const checked = checklist.filter((c) => c.done).length;
                const canDelete = isAdmin || task.created_by === me.id;
                return (
                  <div key={task.id} data-task-row className={cn(cols, 'group border-t border-line/50 px-3 py-2 hover:bg-stone-50/60')}>
                    <span className="text-[12.5px] tabular text-stone-500">
                      {taskNumbers?.[task.id] ?? `${pi + 1}.${ti + 1}`}
                    </span>
                    <button type="button" onClick={() => onOpen(task.id)} className="min-w-0 pl-6 text-left">
                      <span
                        className={cn(
                          'block truncate text-[13.5px] group-hover:underline group-hover:decoration-stone-300 group-hover:underline-offset-4',
                          task.status === 'done' ? 'text-stone-500' : 'text-ink',
                        )}
                      >
                        {task.title}
                      </span>
                      {task.description && <span className="block truncate text-[12px] text-stone-400">{task.description}</span>}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpen(task.id)}
                      className={cn(
                        'flex items-center justify-center gap-1 text-[12.5px] tabular',
                        !checklist.length ? 'text-stone-300' : checked === checklist.length ? 'text-success-fg' : 'text-stone-600',
                      )}
                      title={checklist.length ? `${checked} de ${checklist.length} itens` : 'Sem checklist'}
                    >
                      <ListChecks className="h-3.5 w-3.5" />
                      {checklist.length ? `${checked}/${checklist.length}` : '—'}
                    </button>
                    <Popover
                      align="left"
                      className="w-48"
                      trigger={({ toggle }) => (
                        <button type="button" onClick={toggle} className="text-left" aria-label={`Status de ${task.title}: ${st.label}`}>
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </button>
                      )}
                    >
                      {(close) => (
                        <div>
                          {TASK_STATUS_ORDER.map((s) => (
                            <MenuItem
                              key={s}
                              active={s === task.status}
                              onClick={() => {
                                close();
                                if (s !== task.status) setStatus(task, s);
                              }}
                            >
                              {TASK_STATUS_STYLE[s].label}
                            </MenuItem>
                          ))}
                        </div>
                      )}
                    </Popover>
                    <DurationCell
                      days={task.start_date && task.due_date ? businessDaysBetween(task.start_date, task.due_date) : null}
                      label={`Duração de ${task.title}`}
                      onChange={(n) => updateTask(task.id, datesForDuration(task, n)).catch(toast.error)}
                    />
                    <DateCell value={task.start_date} label={`Início de ${task.title}`} className="text-stone-600" onChange={(d) => setDates(task, { start_date: d })} />
                    <DateCell value={task.due_date} label={`Fim de ${task.title}`} className={dateCls(task)} onChange={(d) => setDates(task, { due_date: d })} />
                    <span className="text-right text-[12.5px] tabular text-stone-600">{task.estimated_hours ? `${formatNumber(task.estimated_hours, 1)}h` : '—'}</span>
                    <span className="text-right text-[12.5px] tabular text-stone-600">{minutesByTask[task.id] ? formatMinutes(minutesByTask[task.id]) : '—'}</span>
                    <span className="min-w-0">
                      <AssigneePicker
                        value={task.assignee_id}
                        label={`Responsável por ${task.title}: ${person?.name ?? 'ninguém'}`}
                        onChange={(id) => updateTask(task.id, { assignee_id: id }).catch(toast.error)}
                      />
                    </span>
                    <span className={cn('flex items-center gap-1 text-[12.5px]', pr.className)}>
                      <Flag className="h-3.5 w-3.5" />
                      {pr.label}
                    </span>
                    <Popover
                      align="right"
                      className="w-44"
                      trigger={({ toggle }) => (
                        <IconButton label={`Ações de ${task.title}`} size="xs" onClick={toggle}>
                          <MoreVertical className="h-3.5 w-3.5" />
                        </IconButton>
                      )}
                    >
                      {(close) => (
                        <div>
                          <MenuItem
                            onClick={() => {
                              close();
                              onOpen(task.id);
                            }}
                          >
                            Abrir tarefa
                          </MenuItem>
                          {task.status !== 'done' && (
                            <MenuItem
                              onClick={() => {
                                close();
                                setStatus(task, 'done');
                              }}
                            >
                              Concluir
                            </MenuItem>
                          )}
                          {canDelete && (
                            <MenuItem
                              danger
                              onClick={() => {
                                close();
                                setDeleting(task);
                              }}
                            >
                              Excluir
                            </MenuItem>
                          )}
                        </div>
                      )}
                    </Popover>
                  </div>
                );
              })}

            {open && adding?.phase === phase && (
              <form
                className="flex items-center gap-2 border-t border-line/50 bg-surface px-3 py-2 pl-[86px]"
                onSubmit={(e) => {
                  e.preventDefault();
                  quickAdd();
                }}
              >
                <Input
                  value={adding.title}
                  onChange={(e) => setAdding({ ...adding, title: e.target.value })}
                  placeholder={`Nova tarefa em ${phase}`}
                  className="h-8 min-w-0 flex-1"
                  autoFocus
                  aria-label={`Nova tarefa em ${phase}`}
                />
                <Button type="submit" size="sm" variant="primary" disabled={!adding.title.trim()}>
                  Adicionar
                </Button>
                <IconButton label="Fechar" size="xs" onClick={() => setAdding(null)}>
                  <X className="h-3.5 w-3.5" />
                </IconButton>
              </form>
            )}
          </div>
        );
      })}

      {deleting && (
        <ConfirmDialog
          title="Excluir tarefa?"
          danger
          confirmLabel="Excluir"
          message={
            <>
              Excluir <b>{deleting.title}</b>, com o checklist, os comentários e as horas lançadas?
            </>
          }
          onConfirm={async () => {
            try {
              await deleteTask(deleting.id);
              toast.success('Tarefa excluída.');
            } catch (e) {
              toast.error(e);
            }
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

/** Data clicável na tabela: mostra a data (ou um calendário quando vazia) e abre o seletor; grava ao escolher a data. */
function DateCell({ value, label, className, onChange }: { value: string | null; label: string; className?: string; onChange: (d: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!editing) return;
    try {
      input.current?.showPicker?.();
    } catch {
      /* alguns navegadores só abrem o seletor com clique */
    }
  }, [editing]);
  const commit = () => {
    const next = input.current?.value || null;
    setEditing(false);
    if (next !== value) onChange(next);
  };
  if (editing) {
    return (
      <input
        ref={input}
        type="date"
        autoFocus
        defaultValue={value ?? ''}
        aria-label={label}
        className="h-7 w-full min-w-0 rounded-md border border-line bg-surface px-1 text-[12px] tabular text-ink outline-none focus:border-stone-400"
        // Data completa escolhida no calendário (ou ano digitado por inteiro) já grava
        onChange={(e) => {
          if (/^2\d{3}-\d{2}-\d{2}$/.test(e.target.value)) commit();
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={value ? `${label}: ${formatDateShort(value)}` : `Definir ${label.charAt(0).toLowerCase()}${label.slice(1)}`}
      title={value ? 'Alterar data' : 'Definir data'}
      className={cn('flex h-7 items-center rounded-md text-left text-[12.5px] tabular hover:bg-stone-100', className)}
    >
      {value ? formatDateShort(value) : <CalendarDays className="h-3.5 w-3.5 text-stone-400" />}
    </button>
  );
}

/** Duração em dias úteis: sai do início e do fim; editada, recalcula o fim (ou o início, se só houver fim). */
function DurationCell({ days, label, onChange }: { days: number | null; label: string; onChange: (n: number) => void }) {
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const commit = () => {
    const n = Number(input.current?.value);
    setEditing(false);
    if (input.current?.value && Number.isFinite(n) && n >= 1 && Math.round(n) !== days) onChange(n);
  };
  if (editing) {
    return (
      <input
        ref={input}
        type="number"
        min={1}
        autoFocus
        defaultValue={days ?? ''}
        aria-label={label}
        className="h-7 w-full min-w-0 rounded-md border border-line bg-surface px-1.5 text-[12.5px] tabular text-ink outline-none focus:border-stone-400"
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={days != null ? `${label}: ${daysLabel(days)}` : `Definir ${label.charAt(0).toLowerCase()}${label.slice(1)}`}
      title="Calculada pelo início e fim; altere para recalcular o fim"
      className="flex h-7 items-center rounded-md text-left text-[12.5px] tabular text-stone-700 hover:bg-stone-100"
    >
      {days != null ? daysLabel(days) : <span className="text-stone-400">—</span>}
    </button>
  );
}
