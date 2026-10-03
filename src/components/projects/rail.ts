import { orderedPhases } from '../../lib/domain';
import type { TaskTemplate } from '../../lib/types';
import { byPosition } from '../../lib/utils';
import type { ProjectSummary } from './useProjectSummaries';

/** Etapas (fases) de cada tipo de projeto, na ordem das tarefas-modelo. */
export function templatePhasesByType(templates: TaskTemplate[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const tpl of [...templates].sort(byPosition)) {
    const list = (out[tpl.project_type_id] ||= []);
    if (!list.includes(tpl.phase)) list.push(tpl.phase);
  }
  return out;
}

/**
 * Trilho de etapas de um projeto: as fases das tarefas (ou do modelo do tipo) e o
 * índice da etapa atual (-1 = sem tarefas; phases.length = tudo concluído).
 */
export function projectRail(summary: ProjectSummary, templatePhases: string[] = []): { phases: string[]; current: number } {
  const fromTasks = orderedPhases(summary.tasks);
  const phases = fromTasks.length ? fromTasks : templatePhases;
  if (summary.project.status === 'concluido') return { phases, current: phases.length };
  if (summary.tasks.length === 0) return { phases, current: -1 };
  const pending = summary.tasks.some((x) => x.status !== 'done');
  return { phases, current: pending ? phases.indexOf(summary.phase) : phases.length };
}
