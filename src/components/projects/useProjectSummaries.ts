import { useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { projectCurrentPhase, projectProgress, totalMinutes } from '../../lib/domain';
import type { Client, Profile, Project, ProjectType, Task } from '../../lib/types';
import { deadlineState, today, type DeadlineState } from '../../lib/utils';

export interface ProjectSummary {
  project: Project;
  client: Client | undefined;
  type: ProjectType | undefined;
  tasks: Task[];
  progress: number;
  phase: string;
  openTasks: number;
  overdueTasks: number;
  /** Pessoas à frente do projeto: responsável, equipe e responsáveis por tarefas abertas. */
  people: Profile[];
  deadline: DeadlineState;
  minutes: number;
}

export function useProjectSummaries(): ProjectSummary[] {
  const { db, maps, settings } = useData();
  return useMemo(() => {
    const t = today();
    const tasksByProject: Record<string, Task[]> = {};
    for (const task of db.tasks) if (task.project_id) (tasksByProject[task.project_id] ||= []).push(task);
    const minutesByTask: Record<string, number> = {};
    for (const e of db.time_entries) minutesByTask[e.task_id] = (minutesByTask[e.task_id] ?? 0) + totalMinutes([e]);

    return db.projects.map((project) => {
      const tasks = tasksByProject[project.id] ?? [];
      const open = tasks.filter((x) => x.status !== 'done');
      const ids = new Set<string>();
      if (project.manager_id) ids.add(project.manager_id);
      project.member_ids.forEach((m) => ids.add(m));
      open.forEach((x) => x.assignee_id && ids.add(x.assignee_id));
      const finished = project.status === 'concluido' || project.status === 'cancelado';
      return {
        project,
        client: maps.clients[project.client_id],
        type: maps.types[project.project_type_id],
        tasks,
        progress: project.status === 'concluido' ? 100 : projectProgress(tasks),
        phase: projectCurrentPhase(project, tasks),
        openTasks: open.length,
        overdueTasks: open.filter((x) => x.due_date && x.due_date < t).length,
        people: [...ids].map((id) => maps.profiles[id]).filter(Boolean),
        deadline: deadlineState(project.due_date, finished, settings.due_soon_days),
        minutes: tasks.reduce((acc, x) => acc + (minutesByTask[x.id] ?? 0), 0),
      };
    });
  }, [db.projects, db.tasks, db.time_entries, maps, settings.due_soon_days]);
}
