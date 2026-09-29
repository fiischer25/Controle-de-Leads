import type { Project, Task, TaskTemplate, TimeEntry } from './types';
import { addBusinessDays, byPosition, nextBusinessDay, nowIso, uid } from './utils';

/**
 * Gera as tarefas de um projeto a partir das tarefas-modelo do tipo de projeto.
 * As tarefas são encadeadas em sequência, em dias úteis, a partir da data de início.
 */
export function buildProjectTasks(opts: {
  templates: TaskTemplate[];
  projectId: string;
  startDate: string;
  assigneeId: string | null;
  createdBy: string | null;
}): Task[] {
  const now = nowIso();
  let cursor = nextBusinessDay(opts.startDate);
  return [...opts.templates].sort(byPosition).map((tpl, i) => {
    const start = cursor;
    const due = addBusinessDays(start, Math.max(1, tpl.duration_days) - 1);
    cursor = addBusinessDays(due, 1);
    return {
      id: uid(),
      project_id: opts.projectId,
      phase: tpl.phase,
      title: tpl.title,
      description: tpl.description,
      assignee_id: opts.assigneeId,
      status: 'todo',
      priority: 'media',
      start_date: start,
      due_date: due,
      estimated_hours: null,
      position: i,
      checklist: [],
      completed_at: null,
      created_by: opts.createdBy,
      created_at: now,
      updated_at: now,
    } satisfies Task;
  });
}

/** Data de término prevista ao aplicar os modelos a partir de `startDate`. */
export function templatesEndDate(templates: TaskTemplate[], startDate: string): string | null {
  if (templates.length === 0) return null;
  const total = templates.reduce((acc, t) => acc + Math.max(1, t.duration_days), 0);
  return addBusinessDays(startDate, total - 1);
}

export function projectProgress(tasks: Task[]): number {
  if (tasks.length === 0) return 0;
  return Math.round((tasks.filter((t) => t.status === 'done').length / tasks.length) * 100);
}

/** Etapa atual = fase da primeira tarefa não concluída, na ordem do cronograma. */
export function projectCurrentPhase(project: Project, tasks: Task[]): string {
  if (project.status === 'concluido') return 'Concluído';
  if (project.status === 'cancelado') return 'Cancelado';
  const ordered = [...tasks].sort(byPosition);
  if (ordered.length === 0) return 'Sem tarefas';
  const pending = ordered.find((t) => t.status !== 'done');
  if (!pending) return 'Finalização';
  return pending.phase || 'Geral';
}

/** Fases em ordem de aparição no cronograma. */
export function orderedPhases(tasks: Task[]): string[] {
  const seen: string[] = [];
  for (const t of [...tasks].sort(byPosition)) {
    const p = t.phase || 'Geral';
    if (!seen.includes(p)) seen.push(p);
  }
  return seen;
}

export function nextProjectCode(projects: Project[], prefix: string, year = new Date().getFullYear()): string {
  const base = `${prefix}-${year}-`;
  const max = projects
    .map((p) => (p.code.startsWith(base) ? Number(p.code.slice(base.length)) : 0))
    .reduce((a, b) => Math.max(a, Number.isFinite(b) ? b : 0), 0);
  return `${base}${String(max + 1).padStart(3, '0')}`;
}

export function entryMinutes(entry: TimeEntry, now = Date.now()): number {
  if (entry.ended_at) return entry.minutes;
  return Math.max(0, (now - new Date(entry.started_at).getTime()) / 60000);
}

export function totalMinutes(entries: TimeEntry[], now = Date.now()): number {
  return entries.reduce((acc, e) => acc + entryMinutes(e, now), 0);
}

export function isTaskOpen(t: Task): boolean {
  return t.status !== 'done';
}

export function isProjectActive(p: Project): boolean {
  return p.status === 'em_andamento' || p.status === 'nao_iniciado' || p.status === 'pausado';
}
