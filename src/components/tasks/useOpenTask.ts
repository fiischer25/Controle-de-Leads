import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Abre o painel lateral da tarefa (o painel é renderizado pelo AppLayout). */
export function useOpenTask() {
  const [params, setParams] = useSearchParams();
  return useCallback(
    (taskId: string) => {
      const next = new URLSearchParams(params);
      next.set('tarefa', taskId);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );
}
