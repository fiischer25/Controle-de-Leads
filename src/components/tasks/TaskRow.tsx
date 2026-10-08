import { Clock, Flag, MessageSquare, Paperclip, Timer } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { TASK_STATUS_ORDER } from '../../lib/constants';
import { totalMinutes } from '../../lib/domain';
import { PRIORITY_STYLE, TASK_STATUS_STYLE } from '../../lib/status';
import type { Task, TaskStatus } from '../../lib/types';
import { cn, formatDateShort, formatMinutes, today } from '../../lib/utils';
import { DueBadge, Listbox, TaskCheck } from '../ui';
import { AssigneePicker } from './AssigneePicker';

/** Linha de tarefa: concluir, título, contexto, prazo, status e responsável. */
export function TaskRow({
  task,
  onOpen,
  showProject,
  showPhase,
  showDates = true,
}: {
  task: Task;
  onOpen: () => void;
  showProject?: boolean;
  /** Só a etapa (a lista já está agrupada por projeto). */
  showPhase?: boolean;
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
  const overdue = !done && !!task.due_date && task.due_date < today();
  const status = TASK_STATUS_STYLE[task.status];

  return (
    <div data-task-row className="group flex items-center gap-3 px-4 py-2.5 transition-colors duration-[120ms] hover:bg-subtle">
      <TaskCheck
        done={done}
        overdue={overdue}
        onToggle={() => updateTask(task.id, { status: done ? 'todo' : 'done' }).catch(toast.error)}
      />

      <button type="button" onClick={onOpen} className="min-w-0 flex-1 rounded-xs text-left">
        <div className={cn('truncate text-body font-medium', done ? 'text-faint line-through decoration-stone-300' : 'text-ink')}>
          {task.title}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
          {showProject && <span className="font-medium text-stone-700">{project ? project.name : 'Avulsa'}</span>}
          {(showProject || showPhase) && task.phase && <span className={showPhase && !showProject ? 'font-medium text-stone-700' : undefined}>{task.phase}</span>}
          {task.priority !== 'media' && (
            <span className={cn('inline-flex items-center gap-1', PRIORITY_STYLE[task.priority].text)}>
              <Flag className="h-3 w-3" strokeWidth={1.8} />
              {PRIORITY_STYLE[task.priority].label}
            </span>
          )}
          {minutes > 0 && (
            <span className={cn('inline-flex items-center gap-1', running && 'font-medium text-accent-fg')}>
              {running ? <Timer className="h-3 w-3 animate-timer-dot" /> : <Clock className="h-3 w-3" />}
              {formatMinutes(minutes)}
            </span>
          )}
          {comments > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {comments}
            </span>
          )}
          {task.checklist?.length > 0 && (
            <span>
              ☑ {task.checklist.filter((c) => c.done).length}/{task.checklist.length}
            </span>
          )}
          {(task.attachments?.length ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1" title="Arquivos anexados">
              <Paperclip className="h-3 w-3" aria-label={`${task.attachments!.length} arquivo(s)`} />
              {task.attachments!.length}
            </span>
          )}
        </div>
      </button>

      {showDates && (
        <div className="hidden w-32 shrink-0 text-xs tabular text-muted md:block">
          {task.start_date ? formatDateShort(task.start_date) : '—'} → {task.due_date ? formatDateShort(task.due_date) : '—'}
        </div>
      )}
      <div className="hidden w-36 shrink-0 sm:block">
        <DueBadge due={task.due_date} done={done} soonDays={settings.due_soon_days} compact />
      </div>
      <div className="hidden w-36 shrink-0 lg:block">
        <Listbox
          value={task.status}
          onChange={(v) => updateTask(task.id, { status: v as TaskStatus }).catch(toast.error)}
          options={TASK_STATUS_ORDER.map((s) => ({
            value: s,
            label: TASK_STATUS_STYLE[s].label,
            icon: <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TASK_STATUS_STYLE[s].dot)} />,
          }))}
          aria-label="Status"
          className={cn('h-7 rounded-xs border-transparent px-2 text-xs font-medium', status.badge)}
        />
      </div>
      <span className={done ? 'opacity-60' : undefined}>
        <AssigneePicker
          variant="avatar"
          value={task.assignee_id}
          label={`Responsável por ${task.title}: ${assignee?.name ?? 'ninguém'}`}
          onChange={(id) => updateTask(task.id, { assignee_id: id }).catch(toast.error)}
        />
      </span>
    </div>
  );
}
