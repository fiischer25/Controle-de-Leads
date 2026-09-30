import { Check, Clock, MessageSquare, Timer } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { TASK_PRIORITY, TASK_STATUS, TASK_STATUS_ORDER } from '../../lib/constants';
import { totalMinutes } from '../../lib/domain';
import type { Task, TaskStatus } from '../../lib/types';
import { cn, formatDateShort, formatMinutes } from '../../lib/utils';
import { Avatar, DueBadge } from '../ui';

/** Linha de tarefa: checkbox de conclusão, status, responsável, datas e tempo. */
export function TaskRow({
  task,
  onOpen,
  showProject,
  showDates = true,
}: {
  task: Task;
  onOpen: () => void;
  showProject?: boolean;
  showDates?: boolean;
}) {
  const { db, maps, settings, updateTask, runningEntry } = useData();
  const toast = useToast();
  const done = task.status === 'done';
  const assignee = task.assignee_id ? maps.profiles[task.assignee_id] : null;
  const project = task.project_id ? maps.projects[task.project_id] : null;
  const minutes = totalMinutes(db.time_entries.filter((e) => e.task_id === task.id));
  const comments = db.task_comments.filter((c) => c.task_id === task.id).length;
  const running = runningEntry?.task_id === task.id;

  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-stone-50',
        done && 'bg-stone-50/40',
      )}
    >
      <button
        onClick={() => updateTask(task.id, { status: done ? 'todo' : 'done' }).catch(toast.error)}
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-stone-300 hover:border-emerald-500',
        )}
        aria-label={done ? 'Reabrir tarefa' : 'Concluir tarefa'}
        title={done ? 'Reabrir tarefa' : 'Concluir tarefa'}
      >
        {done && <Check className="h-3 w-3" strokeWidth={3} />}
      </button>

      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className={cn('truncate text-sm font-medium', done ? 'text-stone-400 line-through' : 'text-ink-900')}>{task.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-500">
          {showProject && <span className="font-medium text-stone-600">{project ? project.name : 'Avulsa'}</span>}
          {showProject && task.phase && <span>{task.phase}</span>}
          {task.priority !== 'media' && <span className={TASK_PRIORITY[task.priority].className}>● {TASK_PRIORITY[task.priority].label}</span>}
          {minutes > 0 && (
            <span className={cn('inline-flex items-center gap-1', running && 'font-medium text-brand-700')}>
              {running ? <Timer className="h-3 w-3 animate-pulse" /> : <Clock className="h-3 w-3" />}
              {formatMinutes(minutes)}
            </span>
          )}
          {comments > 0 && (
            <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{comments}</span>
          )}
          {task.checklist?.length > 0 && (
            <span>☑ {task.checklist.filter((c) => c.done).length}/{task.checklist.length}</span>
          )}
        </div>
      </button>

      {showDates && (
        <div className="hidden w-32 shrink-0 text-xs text-stone-500 tabular md:block">
          {task.start_date ? formatDateShort(task.start_date) : '—'} → {task.due_date ? formatDateShort(task.due_date) : '—'}
        </div>
      )}
      <div className="hidden w-36 shrink-0 sm:block">
        <DueBadge due={task.due_date} done={done} soonDays={settings.due_soon_days} compact />
      </div>
      <select
        value={task.status}
        onChange={(e) => updateTask(task.id, { status: e.target.value as TaskStatus }).catch(toast.error)}
        className={cn('hidden h-7 w-32 shrink-0 cursor-pointer rounded-full border-0 px-2.5 text-xs font-medium ring-1 ring-inset lg:block', TASK_STATUS[task.status].badge)}
        aria-label="Status"
      >
        {TASK_STATUS_ORDER.map((s) => <option key={s} value={s}>{TASK_STATUS[s].label}</option>)}
      </select>
      <Avatar user={assignee} size="sm" />
    </div>
  );
}
