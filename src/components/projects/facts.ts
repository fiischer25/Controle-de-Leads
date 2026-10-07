import type { Profile, Task } from '../../lib/types';
import { byPosition, diffDays } from '../../lib/utils';
import type { ProjectSummary } from './useProjectSummaries';

/** Tarefa em andamento com prazo a até estes dias (ou vencido) gera alerta na lista de projetos. */
export const TASK_ALERT_DAYS = 3;

export interface TaskAlert {
  task: Task;
  assignee: Profile | null;
  /** Dias até o prazo (negativo = atrasada). */
  days: number;
}

export interface ProjectFactsData {
  manager: Profile | null;
  done: number;
  total: number;
  /** Próxima tarefa aberta: a de prazo mais próximo (ou a primeira da ordem, sem prazos). */
  next: { task: Task; assignee: Profile | null; overdue: boolean } | null;
  /** Tarefas em andamento (ou em revisão) atrasadas ou com prazo perto, a mais urgente primeiro. */
  alerts: TaskAlert[];
}

/** Resumo do projeto para a lista: responsável, tarefas, próxima entrega e alertas de prazo. */
export function projectFacts(s: ProjectSummary, profiles: Record<string, Profile>, today: string, active: boolean): ProjectFactsData {
  const open = s.tasks.filter((t) => t.status !== 'done');
  const dated = open.filter((t) => t.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!) || byPosition(a, b));
  const nextTask = dated[0] ?? [...open].sort(byPosition)[0] ?? null;
  const person = (id: string | null) => (id ? (profiles[id] ?? null) : null);
  const alerts = active
    ? dated
        .filter((t) => (t.status === 'doing' || t.status === 'review') && diffDays(today, t.due_date!) <= TASK_ALERT_DAYS)
        .map((t) => ({ task: t, assignee: person(t.assignee_id), days: diffDays(today, t.due_date!) }))
    : [];
  return {
    manager: person(s.project.manager_id),
    done: s.tasks.length - open.length,
    total: s.tasks.length,
    next: nextTask ? { task: nextTask, assignee: person(nextTask.assignee_id), overdue: !!nextTask.due_date && nextTask.due_date < today } : null,
    alerts,
  };
}

/** "atrasada desde 3 out" / "vence hoje" / "vence amanhã" / "vence em 3 dias". */
export function alertWhen(a: TaskAlert, short: (d: string) => string): string {
  if (a.days < 0) return `atrasada · venceu ${short(a.task.due_date!)}`;
  if (a.days === 0) return 'vence hoje';
  if (a.days === 1) return 'vence amanhã';
  return `vence em ${a.days} dias (${short(a.task.due_date!)})`;
}
