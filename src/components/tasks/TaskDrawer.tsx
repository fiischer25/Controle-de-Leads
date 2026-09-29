import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, CheckSquare, Clock, MessageSquare, Play, Plus, Send, Square, Trash2, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { TASK_PRIORITY, TASK_PRIORITY_ORDER, TASK_STATUS, TASK_STATUS_ORDER } from '../../lib/constants';
import { entryMinutes, totalMinutes } from '../../lib/domain';
import type { Task, TaskPriority, TaskStatus } from '../../lib/types';
import { cn, formatClock, formatDate, formatDateTime, formatMinutes, formatRelative, today, toDateKey, uid } from '../../lib/utils';
import { Avatar, Button, ConfirmDialog, Drawer, DueBadge, Field, IconButton, Input, Select, Textarea, UserSelect } from '../ui';

export function TaskDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const { db, maps, me, isAdmin, settings, updateTask, deleteTask, addComment, startTimer, stopTimer, runningEntry, addTimeEntry, deleteTimeEntry } =
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
        <div className="p-8 text-center text-sm text-stone-500">Tarefa não encontrada ou removida.</div>
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

  return (
    <Drawer onClose={onClose}>
      <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-6 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
            {project ? (
              <Link to={`/projetos/${project.id}`} onClick={onClose} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
                <Briefcase className="h-3.5 w-3.5" /> {project.name}
              </Link>
            ) : (
              <span>Tarefa avulsa</span>
            )}
            {task.phase && <span>· {task.phase}</span>}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== task.title && save({ title: title.trim() })}
            className="mt-1 w-full rounded-md bg-transparent font-display text-xl font-bold text-stone-900 outline-none focus:bg-stone-50"
            aria-label="Título da tarefa"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <DueBadge due={task.due_date} done={task.status === 'done'} soonDays={settings.due_soon_days} />
          </div>
        </div>
        <IconButton label="Fechar" onClick={onClose}><X className="h-5 w-5" /></IconButton>
      </div>

      <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {/* Status rápido */}
        <div className="flex flex-wrap gap-1.5">
          {TASK_STATUS_ORDER.map((s) => (
            <button
              key={s}
              onClick={() => save({ status: s })}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors',
                task.status === s ? TASK_STATUS[s].badge + ' ring-2' : 'bg-white text-stone-500 ring-stone-200 hover:bg-stone-50',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', TASK_STATUS[s].dot)} />
              {TASK_STATUS[s].label}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Responsável">
            <UserSelect users={db.profiles} value={task.assignee_id} onChange={(id) => save({ assignee_id: id })} />
          </Field>
          <Field label="Prioridade">
            <Select value={task.priority} onChange={(e) => save({ priority: e.target.value as TaskPriority })}>
              {TASK_PRIORITY_ORDER.map((p) => <option key={p} value={p}>{TASK_PRIORITY[p].label}</option>)}
            </Select>
          </Field>
          <Field label="Data de início">
            <Input type="date" value={task.start_date ?? ''} onChange={(e) => save({ start_date: e.target.value || null })} />
          </Field>
          <Field label="Data de término (prazo)">
            <Input type="date" value={task.due_date ?? ''} onChange={(e) => save({ due_date: e.target.value || null })} />
          </Field>
          <Field label="Status">
            <Select value={task.status} onChange={(e) => save({ status: e.target.value as TaskStatus })}>
              {TASK_STATUS_ORDER.map((s) => <option key={s} value={s}>{TASK_STATUS[s].label}</option>)}
            </Select>
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

        <Field label="Descrição">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => (description || null) !== task.description && save({ description: description || null })}
            rows={3}
            placeholder="Detalhes, referências, links…"
          />
        </Field>

        {/* Tempo */}
        <section className="rounded-2xl border border-stone-200">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-brand-600" />
              <span className="font-display text-sm font-bold">Tempo na tarefa</span>
            </div>
            <div className="flex gap-2">
              {isRunningHere ? (
                <Button size="sm" variant="danger" icon={<Square className="h-3.5 w-3.5 fill-current" />} onClick={() => stopTimer().catch(toast.error)}>
                  Parar {formatClock((Date.now() - new Date(runningEntry!.started_at).getTime()) / 1000)}
                </Button>
              ) : (
                <Button size="sm" variant="dark" icon={<Play className="h-3.5 w-3.5 fill-current" />} onClick={() => startTimer(task.id).catch(toast.error)}>
                  Iniciar cronômetro
                </Button>
              )}
              <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setShowManual((s) => !s)}>
                Lançar horas
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-stone-100 text-center">
            <div className="px-3 py-3">
              <div className="text-[11px] uppercase tracking-wide text-stone-500">Total</div>
              <div className="font-display text-lg font-bold tabular">{formatMinutes(total)}</div>
            </div>
            <div className="px-3 py-3">
              <div className="text-[11px] uppercase tracking-wide text-stone-500">Meu tempo</div>
              <div className="font-display text-lg font-bold tabular">{formatMinutes(mine)}</div>
            </div>
            <div className="px-3 py-3">
              <div className="text-[11px] uppercase tracking-wide text-stone-500">Estimado</div>
              <div className={cn('font-display text-lg font-bold tabular', task.estimated_hours && total > task.estimated_hours * 60 && 'text-rose-600')}>
                {task.estimated_hours ? `${task.estimated_hours}h` : '—'}
              </div>
            </div>
          </div>
          {showManual && (
            <div className="grid gap-2 border-t border-stone-100 bg-stone-50 p-4 sm:grid-cols-[1fr_70px_70px]">
              <Input type="date" value={manual.date} max={today()} onChange={(e) => setManual({ ...manual, date: e.target.value })} aria-label="Data" />
              <Input type="number" min={0} value={manual.hours} onChange={(e) => setManual({ ...manual, hours: e.target.value })} aria-label="Horas" placeholder="h" />
              <Input type="number" min={0} max={59} step={5} value={manual.minutes} onChange={(e) => setManual({ ...manual, minutes: e.target.value })} aria-label="Minutos" placeholder="min" />
              <Input className="sm:col-span-3" value={manual.note} onChange={(e) => setManual({ ...manual, note: e.target.value })} placeholder="O que foi feito? (opcional)" />
              <div className="flex justify-end gap-2 sm:col-span-3">
                <Button size="sm" variant="ghost" onClick={() => setShowManual(false)}>Cancelar</Button>
                <Button size="sm" variant="primary" onClick={addManual}>Salvar lançamento</Button>
              </div>
            </div>
          )}
          {entries.length > 0 && (
            <ul className="max-h-56 divide-y divide-stone-100 overflow-y-auto border-t border-stone-100 scrollbar-thin">
              {entries.map((e) => {
                const user = maps.profiles[e.user_id];
                return (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <Avatar user={user} size="xs" />
                    <span className="flex-1 truncate text-stone-600">
                      {formatDate(toDateKey(new Date(e.started_at)))}
                      {e.note && <span className="text-stone-400"> · {e.note}</span>}
                      {!e.ended_at && <span className="ml-1 font-medium text-brand-700">· em andamento</span>}
                    </span>
                    <span className="font-medium tabular">{formatMinutes(entryMinutes(e))}</span>
                    {(e.user_id === me.id || isAdmin) && e.ended_at && (
                      <IconButton label="Excluir lançamento" className="h-6 w-6" onClick={() => deleteTimeEntry(e.id).catch(toast.error)}>
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
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-display text-sm font-bold"><CheckSquare className="h-4 w-4 text-stone-400" /> Checklist</h3>
            {checklist.length > 0 && <span className="text-xs text-stone-500 tabular">{doneItems}/{checklist.length}</span>}
          </div>
          <ul className="space-y-1">
            {checklist.map((item) => (
              <li key={item.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-stone-50">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => save({ checklist: checklist.map((c) => (c.id === item.id ? { ...c, done: !c.done } : c)) })}
                  className="h-4 w-4 accent-brand-600"
                />
                <span className={cn('flex-1 text-sm', item.done && 'text-stone-400 line-through')}>{item.text}</span>
                <button
                  className="text-stone-300 opacity-0 hover:text-rose-600 group-hover:opacity-100"
                  onClick={() => save({ checklist: checklist.filter((c) => c.id !== item.id) })}
                  aria-label="Remover item"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mt-1 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newItem.trim()) return;
              save({ checklist: [...checklist, { id: uid(), text: newItem.trim(), done: false }] });
              setNewItem('');
            }}
          >
            <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Adicionar item…" className="h-8 py-1" />
            <Button size="sm" type="submit" disabled={!newItem.trim()}>Adicionar</Button>
          </form>
        </section>

        {/* Comentários */}
        <section>
          <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-bold"><MessageSquare className="h-4 w-4 text-stone-400" /> Comentários</h3>
          <ul className="space-y-3">
            {comments.map((c) => {
              const user = maps.profiles[c.user_id];
              return (
                <li key={c.id} className="flex gap-3">
                  <Avatar user={user} size="sm" />
                  <div className="min-w-0 flex-1 rounded-xl bg-stone-50 px-3 py-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-stone-800">{user?.name ?? 'Usuário'}</span>
                      <span className="text-stone-400" title={formatDateTime(c.created_at)}>{formatRelative(c.created_at)}</span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-stone-700">{c.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex gap-2">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Escreva um comentário… (Ctrl+Enter para enviar)"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && comment.trim()) {
                  addComment(task.id, comment.trim()).then(() => setComment('')).catch(toast.error);
                }
              }}
            />
            <Button
              variant="dark"
              className="self-end"
              disabled={!comment.trim()}
              onClick={() => addComment(task.id, comment.trim()).then(() => setComment('')).catch(toast.error)}
              aria-label="Enviar comentário"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </section>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-stone-100 px-6 py-3 text-xs text-stone-500">
        <span>
          Criada por {creator?.name ?? '—'} em {formatDateTime(task.created_at)}
          {task.completed_at && <> · concluída em {formatDateTime(task.completed_at)}</>}
        </span>
        {canDelete && (
          <Button size="xs" variant="ghost" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirmDelete(true)}>
            Excluir
          </Button>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Excluir tarefa"
          message={<>Excluir <b>{task.title}</b>? Os lançamentos de horas e comentários também serão removidos.</>}
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
