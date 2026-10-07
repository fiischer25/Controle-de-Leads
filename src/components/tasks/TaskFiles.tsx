import { useData } from '../../context/DataContext';
import type { Task } from '../../lib/types';
import { FilesSection } from '../files/FilesSection';

/**
 * Arquivos da tarefa: anexar PDF (contrato, planta, orçamento...) ou outro arquivo, abrir e
 * remover. Os arquivos ficam no Storage, num bucket privado só da equipe.
 */
export function TaskFiles({ task }: { task: Task }) {
  const { maps, me, isAdmin, updateTask } = useData();
  return (
    <FilesSection
      id={`arquivos-${task.id}`}
      title="Arquivos"
      className="border-t border-hairline-surface py-5"
      files={task.attachments ?? []}
      folder={task.id}
      // Lista atual da tarefa (pode ter mudado enquanto o envio acontecia)
      onChange={(next) => updateTask(task.id, { attachments: next })}
      canRemove={(f) => isAdmin || !f.uploaded_by || f.uploaded_by === me.id || maps.tasks[task.id]?.created_by === me.id}
      empty="Anexe um PDF (contrato, planta, orçamento…) ou arraste o arquivo para cá."
      inputLabel="Anexar arquivo à tarefa"
    />
  );
}
