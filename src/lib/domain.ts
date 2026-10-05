import type { Project, Task, TaskTemplate, TimeEntry } from './types';
import { addBusinessDays, byPosition, nextBusinessDay, nowIso, uid } from './utils';

export interface ScheduledTemplate {
  template: TaskTemplate;
  /** null = duração 0: a tarefa entra sem datas, preenchidas depois no projeto. */
  start: string | null;
  due: string | null;
}

/**
 * Datas das tarefas-modelo a partir de `startDate`, em dias úteis: cada tarefa começa depois
 * da anterior, ou junto com ela quando marcada "começa junto com a anterior". Tarefas com
 * duração 0 ficam sem datas e não mexem na sequência.
 */
export function scheduleTemplates(templates: TaskTemplate[], startDate: string): ScheduledTemplate[] {
  let cursor = nextBusinessDay(startDate);
  let prevStart = cursor;
  let dated = 0;
  return [...templates].sort(byPosition).map((tpl) => {
    if (tpl.duration_days <= 0) return { template: tpl, start: null, due: null };
    const start = tpl.start_with_previous && dated > 0 ? prevStart : cursor;
    const due = addBusinessDays(start, tpl.duration_days - 1);
    const after = addBusinessDays(due, 1);
    if (after > cursor) cursor = after;
    prevStart = start;
    dated++;
    return { template: tpl, start, due };
  });
}

/**
 * Gera as tarefas de um projeto a partir das tarefas-modelo do tipo de projeto: datas em dias
 * úteis a partir do início, checklist, observações, prioridade, horas e responsável do modelo
 * (ou o responsável do projeto quando o modelo não define ou a pessoa está inativa).
 */
export function buildProjectTasks(opts: {
  templates: TaskTemplate[];
  projectId: string;
  startDate: string;
  assigneeId: string | null;
  createdBy: string | null;
  /** Pessoas ativas: responsável do modelo fora desta lista é trocado pelo do projeto. */
  activeUserIds?: Set<string>;
}): Task[] {
  const now = nowIso();
  return scheduleTemplates(opts.templates, opts.startDate).map(({ template: tpl, start, due }, i) => {
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
      start_date: start,
      due_date: due,
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

/** Data de término prevista ao aplicar os modelos a partir de `startDate`. */
export function templatesEndDate(templates: TaskTemplate[], startDate: string): string | null {
  const dues = scheduleTemplates(templates, startDate)
    .map((x) => x.due)
    .filter((d): d is string => !!d);
  if (dues.length === 0) return null;
  return dues.reduce((max, d) => (d > max ? d : max));
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
 * checklist, observações, prioridade e horas; a duração vem das datas (dias úteis), uma tarefa
 * que começa antes da anterior terminar fica "junto com a anterior" e tarefa sem datas fica com
 * duração 0 (datas preenchidas em cada projeto).
 */
export function tasksToTemplates(tasks: Task[], projectTypeId: string, keepAssignees: boolean): TaskTemplate[] {
  const ordered = orderedPhases(tasks).flatMap((p) => tasks.filter((t) => (t.phase || 'Geral') === p).sort(byPosition));
  let prev: Task | null = null; // última tarefa com datas
  return ordered.map((t, i) => {
    const start = t.start_date ?? t.due_date;
    const prevStart = prev ? (prev.start_date ?? prev.due_date) : null;
    const prevEnd = prev ? (prev.due_date ?? prevStart) : null;
    const parallel = !!(start && prevStart && prevEnd && (start <= prevStart || start < prevEnd));
    if (start) prev = t;
    return {
      id: uid(),
      project_type_id: projectTypeId,
      phase: t.phase || 'Geral',
      title: t.title,
      description: t.description,
      duration_days: !start ? 0 : t.due_date ? Math.max(1, businessDaysBetween(start, t.due_date)) : 1,
      position: i,
      checklist: t.checklist.map((c) => c.text.trim()).filter(Boolean),
      assignee_id: keepAssignees ? t.assignee_id : null,
      priority: t.priority,
      estimated_hours: t.estimated_hours,
      start_with_previous: parallel,
    };
  });
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
