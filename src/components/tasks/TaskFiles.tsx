/* eslint-disable react-refresh/only-export-components */
import { useRef, useState } from 'react';
import { FileText, Image as ImageIcon, Paperclip, Upload, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { backend } from '../../lib/backend';
import type { FileAttachment, Task } from '../../lib/types';
import { cn, formatDate, nowIso, uid } from '../../lib/utils';
import { Button, ConfirmDialog, IconButton } from '../ui';

export const TASK_FILES_BUCKET = 'task-files';
const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.dwg,application/pdf,image/*';

const safeName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '-')
    .slice(-80);

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

/** Abre o arquivo em nova aba (link temporário do Storage). */
export async function openTaskFile(att: FileAttachment) {
  // A aba abre já no clique para o navegador não bloquear como pop-up
  const tab = window.open('', '_blank');
  try {
    const url = await backend.fileUrl(TASK_FILES_BUCKET, att.path);
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch (e) {
    tab?.close();
    throw e;
  }
}

/**
 * Arquivos da tarefa: anexar PDF (contrato, planta, orçamento...) ou outro arquivo, abrir e
 * remover. Os arquivos ficam no Storage, num bucket privado só da equipe.
 */
export function TaskFiles({ task }: { task: Task }) {
  const { maps, me, isAdmin, updateTask } = useData();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<FileAttachment | null>(null);
  const files = task.attachments ?? [];

  const add = async (list: FileList | File[] | null) => {
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    const tooBig = picked.find((f) => f.size > MAX_BYTES);
    if (tooBig) return toast.error(`"${tooBig.name}" tem mais de 15 MB.`);
    setBusy(true);
    try {
      const added: FileAttachment[] = [];
      for (const f of picked) {
        const path = `${task.id}/${uid()}-${safeName(f.name)}`;
        await backend.uploadFile(TASK_FILES_BUCKET, path, f);
        added.push({ id: uid(), name: f.name, path, size: f.size, type: f.type, uploaded_at: nowIso(), uploaded_by: me.id });
      }
      // Lista atual da tarefa (pode ter mudado enquanto o envio acontecia)
      const current = maps.tasks[task.id]?.attachments ?? files;
      await updateTask(task.id, { attachments: [...current, ...added] });
      toast.success(added.length === 1 ? 'Arquivo anexado.' : `${added.length} arquivos anexados.`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async (att: FileAttachment) => {
    const current = maps.tasks[task.id]?.attachments ?? files;
    await updateTask(task.id, { attachments: current.filter((a) => a.id !== att.id) });
    await backend.removeFiles(TASK_FILES_BUCKET, [att.path]).catch(() => undefined);
    toast.success('Arquivo removido.');
  };

  return (
    <section
      className="border-t border-hairline-surface py-5"
      aria-labelledby={`arquivos-${task.id}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (!busy) add(e.dataTransfer.files);
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 id={`arquivos-${task.id}`} className="text-[12.5px] text-faint">
          Arquivos{files.length ? ` · ${files.length}` : ''}
        </h3>
        <Button size="xs" variant="ghost" loading={busy} icon={<Upload className="h-3.5 w-3.5" strokeWidth={1.8} />} onClick={() => input.current?.click()}>
          Anexar arquivo
        </Button>
        <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" aria-label="Anexar arquivo à tarefa" onChange={(e) => add(e.target.files)} />
      </div>
      {files.length === 0 ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex w-full items-center gap-2 rounded-[10px] border border-dashed border-line-strong px-3 py-3 text-left text-[13px] text-faint hover:border-stone-300 hover:text-muted"
        >
          <Paperclip className="h-4 w-4 shrink-0" strokeWidth={1.6} />
          Anexe um PDF (contrato, planta, orçamento…) ou arraste o arquivo para cá.
        </button>
      ) : (
        <ul className="space-y-1">
          {files.map((f) => {
            const who = f.uploaded_by ? maps.profiles[f.uploaded_by]?.name.split(' ')[0] : null;
            const image = f.type.startsWith('image/');
            const canRemove = isAdmin || !f.uploaded_by || f.uploaded_by === me.id || task.created_by === me.id;
            return (
              <li key={f.id} className="group flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 hover:bg-ink/[0.03]">
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]', image ? 'bg-stone-100 text-stone-600' : 'bg-danger-bg text-danger-fg')}>
                  {image ? <ImageIcon className="h-4 w-4" strokeWidth={1.6} /> : <FileText className="h-4 w-4" strokeWidth={1.6} />}
                </span>
                <button type="button" onClick={() => openTaskFile(f).catch(toast.error)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[13.5px] text-ink group-hover:underline group-hover:decoration-stone-300 group-hover:underline-offset-4">{f.name}</span>
                  <span className="block text-[12px] text-faint">
                    {formatBytes(f.size)} · {formatDate(f.uploaded_at)}
                    {who && ` · ${who}`}
                  </span>
                </button>
                {canRemove && (
                  <IconButton label={`Remover ${f.name}`} size="xs" className="opacity-60 group-hover:opacity-100" onClick={() => setRemoving(f)}>
                    <X className="h-3.5 w-3.5" />
                  </IconButton>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {removing && (
        <ConfirmDialog
          title="Remover arquivo?"
          message={`"${removing.name}" será apagado da tarefa.`}
          confirmLabel="Remover"
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            const att = removing;
            setRemoving(null);
            await remove(att).catch(toast.error);
          }}
        />
      )}
    </section>
  );
}
