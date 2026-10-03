import { useEffect, useState } from 'react';
import { useData } from '../../context/DataContext';
import { formatClock } from '../../lib/utils';

function useTick(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

/** Cronômetro em andamento do usuário, atualizado a cada segundo. */
export function useRunningTimer() {
  const { runningEntry, maps } = useData();
  useTick(!!runningEntry);
  if (!runningEntry) return null;
  const task = maps.tasks[runningEntry.task_id];
  const project = task?.project_id ? maps.projects[task.project_id] : null;
  return {
    entry: runningEntry,
    task,
    project,
    label: task ? (project ? `${task.title} · ${project.name}` : task.title) : 'Tarefa',
    elapsed: formatClock((Date.now() - new Date(runningEntry.started_at).getTime()) / 1000),
  };
}

