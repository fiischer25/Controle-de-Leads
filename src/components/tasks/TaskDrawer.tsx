import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Plus, Square, Trash2, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { TASK_PRIORITY, TASK_PRIORITY_ORDER, TASK_STATUS, TASK_STATUS_ORDER } from '../../lib/constants';
import { businessDaysBetween, datesForDuration, entryMinutes, totalMinutes } from '../../lib/domain';
import type { Task, TaskPriority } from '../../lib/types';
import { cn, formatClock, formatDate, formatDateTime, formatMinutes, formatRelative, today, toDateKey, uid } from '../../lib/utils';
import { Avatar, Button, Checkbox, ConfirmDialog, Drawer, DueBadge, Field, IconButton, Input, Select, Textarea, UserSelect } from '../ui';

export function TaskDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const { db, maps, me, isAdmin, can, settings, updateTask, deleteTask, addComment, startTimer, stopTimer, runningEntry, addTimeEntry, deleteTimeEntry } =
    useData();
  const toast = useToast();
  const task = maps.tasks[taskId];
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [newItem, setNewItem] = useState('');
  const [comment, setComment] = useState('');
  const [manual, setManual] = useState({ date: today(), hours: '1', minutes: '0', note: '' });
  const [showManual, setShowManual] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
  }, [task?.id, task?.title, task?.description]);

  const isRunningHere = runningEntry?.task_id === taskId;
  useEffect(() => {
    if (!isRunningHere) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isRunningHere]);

  const entries = useMemo(
    () => db.time_entries.filter((e) => e.task_id === taskId).sort((a, b) => b.started_at.localeCompare(a.started_at)),
    [db.time_entries, taskId],
  );
  const comments = useMemo(
    () => db.task_comments.filter((c) => c.task_id === taskId).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [db.task_comments, taskId],
  );

  if (!task) {
    return (
      <Drawer onClose={onClose}>
        <div className="p-8 text-center text-body text-faint">Tarefa não encontrada ou removida.</div>
      </Drawer>
    );
  }

  const project = task.project_id ? maps.projects[task.project_id] : null;
  const creator = task.created_by ? maps.profiles[task.created_by] : null;
  const total = totalMinutes(entries);
  const mine = totalMinutes(entries.filter((e) => e.user_id === me.id));
  const canDelete = isAdmin || task.created_by === me.id;

  const save = (patch: Partial<Task>) => updateTask(task.id, patch).catch(toast.error);

  const addManual = async () => {
    const minutes = Number(manual.hours || 0) * 60 + Number(manual.minutes || 0);
    if (minutes <= 0) return toast.error('Informe o tempo trabalhado.');
    try {
      await addTimeEntry(task.id, manual.date, minutes, manual.note.trim() || null);
      setManual({ date: today(), hours: '1', minutes: '0', note: '' });
      setShowManual(false);
      toast.success('Horas lançadas.');
    } catch (e) {
      toast.error(e);
    }
  };

  const checklist = task.checklist ?? [];
  const doneItems = checklist.filter((c) => c.done).length;

  const sectionTitle = 'mb-3 text-[12.5px] text-faint';
  const overEstimate = !!task.estimated_hours && total > task.estimated_hours * 60;

  return (
    <Drawer onClose={onClose} label={task.title}>
      {/* Cabeçalho */}
      <div className="px-6 pb-4 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-faint">
            {project && !can('projetos') ? (
              <span className="truncate text-stone-700">{project.name}</span>
            ) : project ? (
              <Link to={`/projetos/${project.id}`} onClick={onClose} className="truncate text-stone-700 hover:underline hover:decoration-stone-300 hover:underline-offset-4">
                {project.name}
              </Link>
            ) : (
              <span>Tarefa avulsa</span>
            )}
            {task.phase && <span className="truncate">· {task.phase}</span>}
          </div>
          <IconButton label="Fechar" size="sm" onClick={onClose} className="-mr-2">
            <X className="h-[18px] w-[18px]" strokeWidth={1.6} />
          </IconButton>
        </div>
        <textarea
          value={title}
          rows={1}
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
          onBlur={() => title.trim() && title !== task.title && save({ title: title.trim() })}
          className="mt-1.5 block w-full resize-none rounded-xs bg-transparent font-display text-h2 text-ink outline-none [field-sizing:content] hover:bg-ink/[0.03] focus:bg-ink/[0.03] focus-visible:shadow-none"
          aria-label="Título da tarefa"
        />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {TASK_STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={task.status === s}
              onClick={() => save({ status: s })}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-xs border px-2.5 text-xs font-medium transition-colors',
                task.status === s ? cn('border-transparent', TASK_STATUS[s].badge) : 'border-line text-muted hover:bg-subtle hover:text-ink',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', TASK_STATUS[s].dot)} />
              {TASK_STATUS[s].label}
            </button>
          ))}
        </div>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-6 pb-8">
        {/* Detalhes */}
        <section className="border-t border-hairline-surface py-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[12.5px] text-faint">Detalhes</h3>
            <DueBadge due={task.due_date} done={task.status === 'done'} soonDays={settings.due_soon_days} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Responsável">
              <UserSelect users={db.profiles} value={task.assignee_id} onChange={(id) => save({ assignee_id: id })} />
            </Field>
            <Field label="Prioridade">
              <Select value={task.priority} onChange={(e) => save({ priority: e.target.value as TaskPriority })}>
                {TASK_PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {TASK_PRIORITY[p].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Início">
              <Input type="date" value={task.start_date ?? ''} onChange={(e) => save({ start_date: e.target.value || null })} />
            </Field>
            <Field label="Prazo">
              <Input type="date" value={task.due_date ?? ''} onChange={(e) => save({ due_date: e.target.value || null })} />
            </Field>
            <Field label="Duração (dias úteis)" hint="Sai do início e do prazo; alterar recalcula o prazo.">
              <Input
                key={`${task.start_date}-${task.due_date}`}
                type="number"
                min={1}
                defaultValue={task.start_date && task.due_date ? businessDaysBetween(task.start_date, task.due_date) : ''}
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  const cur = task.start_date && task.due_date ? businessDaysBetween(task.start_date, task.due_date) : null;
                  if (e.target.value && n >= 1 && Math.round(n) !== cur) save(datesForDuration(task, n));
                }}
                aria-label="Duração (dias úteis)"
              />
            </Field>
            <Field label="Horas estimadas">
              <Input
                type="number"
                min={0}
                step="0.5"
                defaultValue={task.estimated_hours ?? ''}
                key={`est-${task.id}`}
                onBlur={(e) => {
                  const val = e.target.value ? Number(e.target.value) : null;
                  if (val !== task.estimated_hours) save({ estimated_hours: val });
                }}
              />
            </Field>
          </div>
          <Field label="Observações" className="mt-4">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => (description || null) !== task.description && save({ description: description || null })}
              rows={3}
              placeholder="Orientações, referências, links, pendências…"
            />
          </Field>
        </section>

        {/* Tempo */}
        <section className="border-t border-hairline-surface py-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[12.5px] text-faint">Tempo</h3>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" strokeWidth={1.8} />} onClick={() => setShowManual((s) => !s)}>
                Lançar horas
              </Button>
              {isRunningHere ? (
                <Button size="sm" variant="danger" icon={<Square className="h-3 w-3 fill-current" strokeWidth={0} />} onClick={() => stopTimer().catch(toast.error)}>
                  Parar <span className="font-mono text-xs tabular">{formatClock((Date.now() - new Date(runningEntry!.started_at).getTime()) / 1000)}</span>
                </Button>
              ) : (
                <Button size="sm" variant="primary" icon={<Play className="h-3 w-3 fill-current" strokeWidth={0} />} onClick={() => startTimer(task.id).catch(toast.error)}>
                  Iniciar cronômetro
                </Button>
              )}
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-6">
            <div>
              <dt className="text-[12.5px] text-faint">Total</dt>
              <dd className="mt-0.5 font-display text-[22px] leading-7 tracking-[-0.02em] tabular text-ink">{formatMinutes(total)}</dd>
            </div>
            <div>
              <dt className="text-[12.5px] text-faint">Meu tempo</dt>
              <dd className="mt-0.5 font-display text-[22px] leading-7 tracking-[-0.02em] tabular text-ink">{formatMinutes(mine)}</dd>
            </div>
            <div>
              <dt className="text-[12.5px] text-faint">Estimado</dt>
              <dd className={cn('mt-0.5 font-display text-[22px] leading-7 tracking-[-0.02em] tabular', overEstimate ? 'text-danger-fg' : 'text-ink')}>
                {task.estimated_hours ? `${task.estimated_hours}h` : '—'}
              </dd>
            </div>
          </dl>
          {showManual && (
            <div className="mt-4 grid gap-2 rounded-lg bg-subtle p-3 sm:grid-cols-[1fr_72px_72px]">
              <Input type="date" value={manual.date} max={today()} onChange={(e) => setManual({ ...manual, date: e.target.value })} aria-label="Data" />
              <Input type="number" min={0} value={manual.hours} onChange={(e) => setManual({ ...manual, hours: e.target.value })} aria-label="Horas" placeholder="h" />
              <Input
                type="number"
                min={0}
                max={59}
                step={5}
                value={manual.minutes}
                onChange={(e) => setManual({ ...manual, minutes: e.target.value })}
                aria-label="Minutos"
                placeholder="min"
              />
              <Input className="sm:col-span-3" value={manual.note} onChange={(e) => setManual({ ...manual, note: e.target.value })} placeholder="O que foi feito? (opcional)" />
              <div className="flex justify-end gap-2 sm:col-span-3">
                <Button size="sm" variant="ghost" onClick={() => setShowManual(false)}>
                  Cancelar
                </Button>
                <Button size="sm" variant="primary" onClick={addManual}>
                  Salvar lançamento
                </Button>
              </div>
            </div>
          )}
          {entries.length > 0 && (
            <ul className="scrollbar-thin mt-4 max-h-56 overflow-y-auto">
              {entries.map((e) => {
                const user = maps.profiles[e.user_id];
                return (
                  <li key={e.id} className="group flex items-center gap-3 border-t border-hairline-surface py-2 text-[13px]">
                    <Avatar user={user} size="xs" />
                    <span className="flex-1 truncate text-muted">
                      {formatDate(toDateKey(new Date(e.started_at)))}
                      {e.note && <span className="text-faint"> · {e.note}</span>}
                      {!e.ended_at && <span className="ml-1 text-accent-fg">· em andamento</span>}
                    </span>
                    <span className="tabular text-ink">{formatMinutes(entryMinutes(e))}</span>
                    {(e.user_id === me.id || isAdmin) && e.ended_at && (
                      <IconButton
                        label="Excluir lançamento"
                        className="h-6 w-6 opacity-0 hover:text-danger-fg focus-visible:opacity-100 group-hover:opacity-100"
                        onClick={() => deleteTimeEntry(e.id).catch(toast.error)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Checklist */}
        <section className="border-t border-hairline-surface py-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[12.5px] text-faint">Checklist</h3>
            {checklist.length > 0 && (
              <span className={cn('text-[12.5px] tabular', doneItems === checklist.length ? 'text-success-fg' : 'text-faint')}>
                {doneItems}/{checklist.length}
              </span>
            )}
          </div>
          <ul>
            {checklist.map((item) => (
              <li key={item.id} className="group flex items-center gap-2.5 py-1.5">
                <Checkbox
                  checked={item.done}
                  onChange={() => save({ checklist: checklist.map((c) => (c.id === item.id ? { ...c, done: !c.done } : c)) })}
                  label={<span className={cn('text-body', item.done ? 'text-faint line-through decoration-stone-300' : 'text-ink')}>{item.text}</span>}
                  className="flex-1"
                />
                <button
                  type="button"
                  className="rounded-xs text-faint opacity-0 hover:text-danger-fg focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={() => save({ checklist: checklist.filter((c) => c.id !== item.id) })}
                  aria-label={`Remover ${item.text}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mt-1 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newItem.trim()) return;
              save({ checklist: [...checklist, { id: uid(), text: newItem.trim(), done: false }] });
              setNewItem('');
            }}
          >
            <Plus className="h-4 w-4 shrink-0 text-faint" strokeWidth={1.6} />
            <input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Adicionar item…"
              aria-label="Novo item do checklist"
              className="flex-1 rounded-xs bg-transparent py-1.5 text-body outline-none placeholder:text-faint focus-visible:shadow-none"
            />
            {newItem.trim() && (
              <Button size="xs" type="submit" variant="primary">
                Adicionar
              </Button>
            )}
          </form>
        </section>

        {/* Comentários */}
        <section className="border-t border-hairline-surface py-5">
          <h3 className={sectionTitle}>Comentários{comments.length ? ` · ${comments.length}` : ''}</h3>
          <ul>
            {comments.map((c) => {
              const user = maps.profiles[c.user_id];
              return (
                <li key={c.id} className="flex gap-3 border-b border-hairline-surface py-3 first:pt-0">
                  <Avatar user={user} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] text-faint">
                      <span className="text-stone-700">{user?.name ?? 'Usuário'}</span> ·{' '}
                      <span title={formatDateTime(c.created_at)}>{formatRelative(c.created_at)}</span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-body text-stone-800">{c.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 rounded-lg border border-line bg-surface transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-[0_0_0_3px_rgb(var(--accent)/0.22)]">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Escreva um comentário…"
              aria-label="Novo comentário"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && comment.trim()) {
                  addComment(task.id, comment.trim()).then(() => setComment('')).catch(toast.error);
                }
              }}
              className="block w-full resize-none rounded-t-lg bg-transparent px-3 pb-1 pt-2.5 text-body text-ink outline-none placeholder:text-faint focus-visible:shadow-none"
            />
            <div className="flex items-center justify-between gap-2 px-3 pb-1.5">
              <span className="text-[11.5px] text-faint">Ctrl + Enter envia</span>
              <Button
                size="xs"
                variant="primary"
                disabled={!comment.trim()}
                onClick={() => addComment(task.id, comment.trim()).then(() => setComment('')).catch(toast.error)}
              >
                Comentar
              </Button>
            </div>
          </div>
        </section>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-hairline-surface px-6 py-3 text-[12px] text-faint">
        <span className="min-w-0 truncate">
          Criada por {creator?.name.split(' ')[0] ?? '—'} em {formatDateTime(task.created_at)}
          {task.completed_at && <> · concluída em {formatDateTime(task.completed_at)}</>}
        </span>
        {canDelete && (
          <Button size="xs" variant="ghost" className="shrink-0 hover:bg-danger-bg hover:text-danger-fg" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirmDelete(true)}>
            Excluir
          </Button>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Excluir tarefa"
          message={
            <>
              Excluir <b>{task.title}</b>? Os lançamentos de horas e comentários também serão removidos.
            </>
          }
          confirmLabel="Excluir"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await deleteTask(task.id);
            toast.success('Tarefa excluída.');
            onClose();
          }}
        />
      )}
    </Drawer>
  );
}
