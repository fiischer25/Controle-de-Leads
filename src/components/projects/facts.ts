import type { FinanceEntry, Profile, Task } from '../../lib/types';
import { byPosition } from '../../lib/utils';
import type { ProjectSummary } from './useProjectSummaries';

export interface ProjectFactsData {
  manager: Profile | null;
  done: number;
  total: number;
  /** Próxima tarefa aberta: a de prazo mais próximo (ou a primeira da ordem, sem prazos). */
  next: { task: Task; assignee: Profile | null; overdue: boolean } | null;
  /** Honorários do projeto; null sem acesso ao Financeiro ou sem parcelas lançadas. */
  fees: { total: number; received: number; overdue: number; next: FinanceEntry | null } | null;
}

/** Resumo do projeto para a lista: responsável, tarefas, próxima entrega e honorários. */
export function projectFacts(s: ProjectSummary, entries: FinanceEntry[] | null, profiles: Record<string, Profile>, today: string): ProjectFactsData {
  const open = s.tasks.filter((t) => t.status !== 'done');
  const dated = open.filter((t) => t.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!) || byPosition(a, b));
  const nextTask = dated[0] ?? [...open].sort(byPosition)[0] ?? null;
  let fees: ProjectFactsData['fees'] = null;
  if (entries?.length) {
    const unpaid = entries.filter((e) => !e.paid_at).sort((a, b) => a.due_date.localeCompare(b.due_date));
    const sum = (list: FinanceEntry[]) => Math.round(list.reduce((a, e) => a + e.amount * 100, 0)) / 100;
    fees = {
      total: sum(entries),
      received: sum(entries.filter((e) => e.paid_at)),
      overdue: sum(unpaid.filter((e) => e.due_date < today)),
      next: unpaid.find((e) => e.due_date >= today) ?? null,
    };
  }
  return {
    manager: s.project.manager_id ? (profiles[s.project.manager_id] ?? null) : null,
    done: s.tasks.length - open.length,
    total: s.tasks.length,
    next: nextTask
      ? {
          task: nextTask,
          assignee: nextTask.assignee_id ? (profiles[nextTask.assignee_id] ?? null) : null,
          overdue: !!nextTask.due_date && nextTask.due_date < today,
        }
      : null,
    fees,
  };
}
