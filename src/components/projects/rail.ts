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

/** Etapa macro que não é uma fase das tarefas: reunião marcada com o cliente. */
export const CLIENT_MEETING_STAGE = 'Reunião com cliente';

/** Etapa macro de acompanhamento da obra. */
export const CONSTRUCTION_STAGE = 'Obra';

/**
 * Etapa macro da lista de projetos: a escolhida à mão ou, no automático, a etapa atual pelas
 * tarefas (ou "Finalizado", "Etapas concluídas", "Sem tarefas").
 */
export function macroStage(
  project: { status: string; macro_stage?: string | null },
  rail: { phases: string[]; current: number },
  fallback = '',
): { label: string; auto: boolean; autoLabel: string } {
  const { phases, current } = rail;
  const autoLabel =
    project.status === 'concluido'
      ? 'Finalizado'
      : project.status === 'obra'
        ? CONSTRUCTION_STAGE
        : current >= 0 && current < phases.length
        ? phases[current]
        : current >= phases.length && phases.length
          ? 'Etapas concluídas'
          : fallback || 'Sem tarefas';
  const manual = project.macro_stage?.trim();
  return manual ? { label: manual, auto: false, autoLabel } : { label: autoLabel, auto: true, autoLabel };
}

/** O projeto está em obra na lista (escolhido na lista ou pelo status interno)? */
export const isObraStage = (
  project: { status: string; macro_stage?: string | null },
  rail: { phases: string[]; current: number },
  fallback = '',
) => macroStage(project, rail, fallback).label === CONSTRUCTION_STAGE;
