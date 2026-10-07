import { useRef, useState, type ReactNode } from 'react';
import { FileText, Image as ImageIcon, Paperclip, Upload, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { formatBytes, openTeamFile, removeTeamFiles, TEAM_FILES_ACCEPT, uploadTeamFile } from '../../lib/teamFiles';
import type { FileAttachment } from '../../lib/types';
import { cn, formatDate } from '../../lib/utils';
import { Button, ConfirmDialog, IconButton } from '../ui';

/**
 * Lista de arquivos com anexar (botão ou arrastar), abrir e remover. Usada nas tarefas e nos
 * documentos do projeto. `files` é a lista atual; `onChange` grava a lista nova.
 */
export function FilesSection({
  id,
  title,
  files,
  folder,
  onChange,
  canRemove,
  empty,
  inputLabel,
  className,
  heading,
}: {
  id: string;
  title: string;
  files: FileAttachment[];
  /** Pasta no Storage (ex.: id da tarefa ou "projetos/<id>"). */
  folder: string;
  onChange: (next: FileAttachment[]) => Promise<void>;
  canRemove: (f: FileAttachment) => boolean;
  empty: string;
  inputLabel: string;
  className?: string;
  /** Cabeçalho próprio (ex.: SectionHeader do painel); sem ele, título discreto. */
  heading?: (action: ReactNode) => ReactNode;
}) {
  const { maps, me } = useData();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<FileAttachment | null>(null);

  const add = async (list: FileList | File[] | null) => {
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    setBusy(true);
    try {
      const added: FileAttachment[] = [];
      for (const f of picked) added.push(await uploadTeamFile(folder, f, me.id));
      await onChange([...files, ...added]);
      toast.success(added.length === 1 ? 'Arquivo anexado.' : `${added.length} arquivos anexados.`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async (att: FileAttachment) => {
    await onChange(files.filter((a) => a.id !== att.id));
    await removeTeamFiles([att.path]);
    toast.success('Arquivo removido.');
  };

  const action = (
    <>
      <Button size="xs" variant="ghost" loading={busy} icon={<Upload className="h-3.5 w-3.5" strokeWidth={1.8} />} onClick={() => input.current?.click()}>
        Anexar arquivo
      </Button>
      <input ref={input} type="file" multiple accept={TEAM_FILES_ACCEPT} className="hidden" aria-label={inputLabel} onChange={(e) => add(e.target.files)} />
    </>
  );

  return (
    <section
      className={className}
      aria-labelledby={id}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (!busy) add(e.dataTransfer.files);
      }}
    >
      {heading ? (
        heading(action)
      ) : (
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 id={id} className="text-[12.5px] text-faint">
            {title}
            {files.length ? ` · ${files.length}` : ''}
          </h3>
          {action}
        </div>
      )}
      {files.length === 0 ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex w-full items-center gap-2 rounded-[10px] border border-dashed border-line-strong px-3 py-3 text-left text-[13px] text-faint hover:border-stone-300 hover:text-muted"
        >
          <Paperclip className="h-4 w-4 shrink-0" strokeWidth={1.6} />
          {empty}
        </button>
      ) : (
        <ul className="space-y-1">
          {files.map((f) => {
            const who = f.uploaded_by ? maps.profiles[f.uploaded_by]?.name.split(' ')[0] : null;
            const image = f.type.startsWith('image/');
            return (
              <li key={f.id} className="group flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 hover:bg-ink/[0.03]">
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]', image ? 'bg-stone-100 text-stone-600' : 'bg-danger-bg text-danger-fg')}>
                  {image ? <ImageIcon className="h-4 w-4" strokeWidth={1.6} /> : <FileText className="h-4 w-4" strokeWidth={1.6} />}
                </span>
                <button type="button" onClick={() => openTeamFile(f).catch(toast.error)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[13.5px] text-ink group-hover:underline group-hover:decoration-stone-300 group-hover:underline-offset-4">{f.name}</span>
                  <span className="block text-[12px] text-faint">
                    {formatBytes(f.size)} · {formatDate(f.uploaded_at)}
                    {who && ` · ${who}`}
                  </span>
                </button>
                {canRemove(f) && (
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
          message={`"${removing.name}" será apagado.`}
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
