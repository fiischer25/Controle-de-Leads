import { useState } from 'react';
import { ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { PRIORITY_STYLE } from '../../lib/status';
import { removeTeamFiles } from '../../lib/teamFiles';
import type { ObraIssue, TaskPriority } from '../../lib/types';
import { cn, formatDate, nowIso, today, uid } from '../../lib/utils';
import { Button, ConfirmDialog, EmptyState, Field, IconButton, Input, Modal, Segmented, Select, TaskCheck, Textarea } from '../ui';
import { PhotoEditor, PhotoGrid } from './parts';
import { useObraActions } from './useObraActions';
import type { ObraSummary } from './useObraSummaries';

/** Pendências da obra (punch list): o que falta corrigir ou terminar, com responsável, prazo e fotos. */
export function ObraIssues({ summary }: { summary: ObraSummary }) {
  const { issues, stages } = summary;
  const { saveIssue, deleteIssue } = useObraActions();
  const toast = useToast();
  const [view, setView] = useState<'aberta' | 'resolvida'>('aberta');
  const [editing, setEditing] = useState<ObraIssue | 'new' | null>(null);
  const [removing, setRemoving] = useState<ObraIssue | null>(null);
  const t = today();
  const order: Record<TaskPriority, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };
  const list = issues
    .filter((i) => i.status === view)
    .sort((a, b) =>
      view === 'aberta'
        ? order[a.priority] - order[b.priority] || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
        : (b.resolved_at ?? '').localeCompare(a.resolved_at ?? ''),
    );
  const stageName = (id: string | null) => (id ? stages.find((s) => s.id === id)?.name : null);
  const toggle = (i: ObraIssue) =>
    saveIssue({ ...i, status: i.status === 'aberta' ? 'resolvida' : 'aberta', resolved_at: i.status === 'aberta' ? nowIso() : null }, false)
      .then(() => toast.success(i.status === 'aberta' ? 'Pendência resolvida.' : 'Pendência reaberta.'))
      .catch(toast.error);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<'aberta' | 'resolvida'>
          value={view}
          onChange={setView}
          options={[
            { id: 'aberta', label: `Abertas (${issues.filter((i) => i.status === 'aberta').length})` },
            { id: 'resolvida', label: `Resolvidas (${issues.filter((i) => i.status === 'resolvida').length})` },
          ]}
        />
        <Button variant="primary" icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => setEditing('new')}>
          Pendência
        </Button>
      </div>
      {list.length === 0 ? (
        <div className="rounded-[16px] border border-line bg-surface shadow-card">
          <EmptyState
            icon={<ClipboardList strokeWidth={1.6} />}
            title={view === 'aberta' ? 'Nenhuma pendência aberta' : 'Nada resolvido ainda'}
            description={view === 'aberta' ? 'Anote o que falta corrigir ou terminar, quem resolve e até quando — com foto.' : undefined}
            className="py-12"
          />
        </div>
      ) : (
        <ul className="divide-y divide-hairline-surface overflow-hidden rounded-[16px] border border-line bg-surface shadow-card">
          {list.map((i) => {
            const pr = PRIORITY_STYLE[i.priority];
            const late = i.status === 'aberta' && i.due_date && i.due_date < t;
            return (
              <li key={i.id} className="flex gap-3 px-5 py-3.5" data-issue>
                <TaskCheck done={i.status === 'resolvida'} overdue={!!late} onToggle={() => toggle(i)} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className={cn('text-[14px] font-medium', i.status === 'resolvida' ? 'text-muted line-through decoration-stone-300' : 'text-ink')}>{i.title}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12.5px] text-faint">
                    {i.priority !== 'media' && <span className={pr.text}>{pr.label}</span>}
                    {stageName(i.stage_id) && <span>{stageName(i.stage_id)}</span>}
                    {i.responsible && <span>{i.responsible}</span>}
                    {i.due_date && <span className={cn(late && 'text-danger-fg')}>até {formatDate(i.due_date)}</span>}
                    {i.resolved_at && <span>resolvida em {formatDate(i.resolved_at.slice(0, 10))}</span>}
                  </div>
                  {i.description && <p className="mt-1 whitespace-pre-line text-[13px] text-muted">{i.description}</p>}
                  {i.photos.length > 0 && <PhotoGrid className="mt-2 max-w-md !grid-cols-4" photos={i.photos} max={4} />}
                </div>
                <span className="flex shrink-0 items-start">
                  <IconButton label={`Editar ${i.title}`} onClick={() => setEditing(i)}>
                    <Pencil className="h-4 w-4" strokeWidth={1.6} />
                  </IconButton>
                  <IconButton label={`Excluir ${i.title}`} onClick={() => setRemoving(i)} className="hover:text-danger-fg">
                    <Trash2 className="h-4 w-4" strokeWidth={1.6} />
                  </IconButton>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {editing && <IssueModal summary={summary} issue={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {removing && (
        <ConfirmDialog
          title="Excluir pendência?"
          message={removing.title}
          confirmLabel="Excluir"
          danger
          onConfirm={() => deleteIssue(removing).catch(toast.error)}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function IssueModal({ summary, issue, onClose }: { summary: ObraSummary; issue: ObraIssue | null; onClose: () => void }) {
  const { me, db } = useData();
  const { saveIssue } = useObraActions();
  const toast = useToast();
  const { obra, stages } = summary;
  const [form, setForm] = useState<ObraIssue>(
    () =>
      issue ?? {
        id: uid(),
        obra_id: obra.id,
        stage_id: null,
        title: '',
        description: null,
        responsible: null,
        due_date: null,
        priority: 'media',
        status: 'aberta',
        photos: [],
        resolved_at: null,
        created_by: me.id,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
  );
  const [busy, setBusy] = useState(false);
  const set = (c: Partial<ObraIssue>) => setForm((f) => ({ ...f, ...c }));
  const people = [...new Set([...db.obra_suppliers.filter((s) => s.active).map((s) => s.name), ...db.profiles.filter((p) => p.active).map((p) => p.name)])];
  const original = issue?.photos ?? [];
  const close = () => {
    const kept = new Set(original.map((p) => p.path));
    removeTeamFiles(form.photos.filter((p) => !kept.has(p.path)).map((p) => p.path));
    onClose();
  };
  const save = async () => {
    if (!form.title.trim()) return toast.error('Descreva a pendência.');
    setBusy(true);
    try {
      await saveIssue(form, !issue);
      const now = new Set(form.photos.map((p) => p.path));
      removeTeamFiles(original.filter((p) => !now.has(p.path)).map((p) => p.path));
      toast.success('Pendência salva.');
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={issue ? 'Editar pendência' : 'Nova pendência'}
      subtitle={`${obra.code} · ${obra.name}`}
      onClose={close}
      footer={
        <>
          <Button onClick={close}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="O que precisa ser feito" required className="sm:col-span-2">
            <Input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: Rejunte manchado no box da suíte" autoFocus />
          </Field>
          <Field label="Quem resolve">
            <Input value={form.responsible ?? ''} list="issue-people" onChange={(e) => set({ responsible: e.target.value || null })} />
            <datalist id="issue-people">
              {people.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
          <Field label="Até quando">
            <Input type="date" value={form.due_date ?? ''} onChange={(e) => set({ due_date: e.target.value || null })} />
          </Field>
          <Field label="Etapa">
            <Select value={form.stage_id ?? ''} onChange={(e) => set({ stage_id: e.target.value || null })}>
              <option value="">Sem etapa</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prioridade">
            <Select value={form.priority} onChange={(e) => set({ priority: e.target.value as TaskPriority })}>
              {(Object.keys(PRIORITY_STYLE) as TaskPriority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_STYLE[p].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Detalhes" className="sm:col-span-2">
            <Textarea value={form.description ?? ''} onChange={(e) => set({ description: e.target.value || null })} />
          </Field>
        </div>
        <PhotoEditor obraId={obra.id} photos={form.photos} onChange={(photos) => set({ photos })} label="Fotos da pendência" />
      </div>
    </Modal>
  );
}
