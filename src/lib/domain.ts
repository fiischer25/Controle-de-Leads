import type { Project, ProjectStatus, Task, TaskTemplate, TimeEntry } from './types';
import { addBusinessDays, addDays, byPosition, nextBusinessDay, nowIso, today, uid } from './utils';

/**
 * Gera as tarefas de um projeto a partir das tarefas-modelo do tipo de projeto: etapa, ordem,
 * checklist, observações, prioridade, horas e responsável do modelo (ou o responsável do projeto
 * quando o modelo não define ou a pessoa está inativa). As tarefas entram sem datas: início e fim
 * são definidos no projeto e a duração sai deles.
 */
export function buildProjectTasks(opts: {
  templates: TaskTemplate[];
  projectId: string;
  assigneeId: string | null;
  createdBy: string | null;
  /** Pessoas ativas: responsável do modelo fora desta lista é trocado pelo do projeto. */
  activeUserIds?: Set<string>;
}): Task[] {
  const now = nowIso();
  return [...opts.templates].sort(byPosition).map((tpl, i) => {
    const own = tpl.assignee_id && (!opts.activeUserIds || opts.activeUserIds.has(tpl.assignee_id)) ? tpl.assignee_id : null;
    return {
      id: uid(),
      project_id: opts.projectId,
      phase: tpl.phase,
      title: tpl.title,
      description: tpl.description,
      assignee_id: own ?? opts.assigneeId,
      status: 'todo',
      priority: tpl.priority ?? 'media',
      start_date: null,
      due_date: null,
      estimated_hours: tpl.estimated_hours ?? null,
      position: i,
      checklist: (tpl.checklist ?? []).filter((t) => t.trim()).map((text) => ({ id: uid(), text: text.trim(), done: false })),
      completed_at: null,
      created_by: opts.createdBy,
      created_at: now,
      updated_at: now,
    } satisfies Task;
  });
}

/**
 * Datas para uma duração digitada (dias úteis, contando início e fim): mantém o início e
 * recalcula o fim; sem início, conta para trás a partir do fim; sem nenhuma data, começa hoje.
 */
export function datesForDuration(task: Pick<Task, 'start_date' | 'due_date'>, days: number): { start_date: string; due_date: string } {
  const n = Math.max(1, Math.round(days));
  if (task.start_date) return { start_date: task.start_date, due_date: addBusinessDays(task.start_date, n - 1) };
  if (task.due_date) {
    let start = task.due_date;
    for (let left = n - 1; left > 0; ) {
      start = addDays(start, -1);
      if (nextBusinessDay(start) === start) left--;
    }
    return { start_date: start, due_date: task.due_date };
  }
  const start = nextBusinessDay(today());
  return { start_date: start, due_date: addBusinessDays(start, n - 1) };
}

/** Dias úteis entre duas datas, contando as duas pontas (seg→sex = 5). */
export function businessDaysBetween(start: string, end: string): number {
  if (end < start) return 0;
  let n = 0;
  let k = nextBusinessDay(start);
  while (k <= end) {
    n++;
    k = addBusinessDays(k, 1);
  }
  return n;
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

/**
 * Tarefas de um projeto viram tarefas-modelo (projeto usado como modelo): mantém etapas e ordem,
 * checklist, observações, prioridade e horas. Datas e duração não vão para o modelo.
 */
export function tasksToTemplates(tasks: Task[], projectTypeId: string, keepAssignees: boolean): TaskTemplate[] {
  const ordered = orderedPhases(tasks).flatMap((p) => tasks.filter((t) => (t.phase || 'Geral') === p).sort(byPosition));
  return ordered.map((t, i) => ({
    id: uid(),
    project_type_id: projectTypeId,
    phase: t.phase || 'Geral',
    title: t.title,
    description: t.description,
    duration_days: 0,
    position: i,
    checklist: t.checklist.map((c) => c.text.trim()).filter(Boolean),
    assignee_id: keepAssignees ? t.assignee_id : null,
    priority: t.priority,
    estimated_hours: t.estimated_hours,
    start_with_previous: false,
  }));
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
  return p.status === 'em_andamento' || p.status === 'nao_iniciado' || p.status === 'obra' || p.status === 'pausado';
}

/** Status automático pelas tarefas: alguma tarefa saiu de "A fazer" = em andamento. */
export function autoProjectStatus(tasks: Pick<Task, 'status'>[]): ProjectStatus {
  return tasks.some((t) => t.status !== 'todo') ? 'em_andamento' : 'nao_iniciado';
}

/** As tarefas mudam o status só enquanto ele é automático (não iniciado / em andamento). */
export function followsTasks(p: Project): boolean {
  return !p.status_manual && (p.status === 'nao_iniciado' || p.status === 'em_andamento');
}
