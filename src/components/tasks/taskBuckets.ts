import type { Task } from '../../lib/types';
import { addDays } from '../../lib/utils';

/** Faixa de prazo de uma tarefa aberta. */
export type DueBucket = 'overdue' | 'today' | 'week' | 'later' | 'nodate';

export function dueBucket(t: Pick<Task, 'due_date'>, today: string): DueBucket {
  if (!t.due_date) return 'nodate';
  if (t.due_date < today) return 'overdue';
  if (t.due_date === today) return 'today';
  return t.due_date <= addDays(today, 7) ? 'week' : 'later';
}

/** Atrasadas primeiro, depois pelo prazo; sem prazo no fim. */
export function byDue(a: Task, b: Task): number {
  return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
}
