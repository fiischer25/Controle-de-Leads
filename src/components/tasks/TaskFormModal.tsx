import { useState } from 'react';
import { useData, type TaskInput } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { TASK_PRIORITY, TASK_PRIORITY_ORDER } from '../../lib/constants';
import { orderedPhases } from '../../lib/domain';
import type { TaskPriority } from '../../lib/types';
import { today } from '../../lib/utils';
import { Button, Field, Input, Modal, Select, Textarea, UserSelect } from '../ui';

/** Criar tarefa e designar a qualquer membro (avulsa ou dentro de um projeto). */
export function TaskFormModal({
  onClose,
  defaults,
  title = 'Nova tarefa',
}: {
  onClose: () => void;
  defaults?: Partial<TaskInput>;
  title?: string;
}) {
  const { db, me, createTask } = useData();
  const toast = useToast();
  const [v, setV] = useState<TaskInput>({
    title: '',
    description: null,
    assignee_id: me.id,
    project_id: null,
    phase: null,
    priority: 'media',
    start_date: today(),
    due_date: null,
    estimated_hours: null,
    ...defaults,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof TaskInput>(k: K, value: TaskInput[K]) => setV((p) => ({ ...p, [k]: value }));

  const projectTasks = v.project_id ? db.tasks.filter((t) => t.project_id === v.project_id) : [];
  const phases = orderedPhases(projectTasks);
  const activeProjects = db.projects
    .filter((p) => p.status !== 'cancelado' && p.status !== 'concluido')
    .sort((a, b) => a.name.localeCompare(b.name));

  const save = async () => {
    if (!v.title.trim()) return setError('Descreva a tarefa.');
    if (v.due_date && v.start_date && v.due_date < v.start_date) return setError('O prazo deve ser depois do início.');
    setBusy(true);
    try {
      await createTask({ ...v, title: v.title.trim() });
      const who = v.assignee_id && v.assignee_id !== me.id ? db.profiles.find((p) => p.id === v.assignee_id)?.name : null;
      toast.success(who ? `Tarefa designada para ${who}.` : 'Tarefa criada.');
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Criar tarefa
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="O que precisa ser feito?" required error={error} className="sm:col-span-2">
          <Input value={v.title} onChange={(e) => { set('title', e.target.value); setError(null); }} autoFocus placeholder="Ex.: Revisar planta do 2º pavimento" />
        </Field>
        <Field label="Designar para" className="sm:col-span-1">
          <UserSelect users={db.profiles} value={v.assignee_id ?? null} onChange={(id) => set('assignee_id', id)} />
        </Field>
        <Field label="Prioridade">
          <Select value={v.priority} onChange={(e) => set('priority', e.target.value as TaskPriority)}>
            {TASK_PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>{TASK_PRIORITY[p].label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Projeto (opcional)">
          <Select value={v.project_id ?? ''} onChange={(e) => setV((p) => ({ ...p, project_id: e.target.value || null, phase: null }))}>
            <option value="">Tarefa avulsa</option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {p.code}</option>
            ))}
          </Select>
        </Field>
        <Field label="Etapa">
          <Input
            list="task-phases"
            value={v.phase ?? ''}
            onChange={(e) => set('phase', e.target.value || null)}
            placeholder={v.project_id ? 'Escolha ou digite' : '—'}
            disabled={!v.project_id}
          />
          <datalist id="task-phases">
            {phases.map((p) => <option key={p} value={p} />)}
          </datalist>
        </Field>
        <Field label="Início">
          <Input type="date" value={v.start_date ?? ''} onChange={(e) => set('start_date', e.target.value || null)} />
        </Field>
        <Field label="Prazo">
          <Input type="date" value={v.due_date ?? ''} onChange={(e) => set('due_date', e.target.value || null)} />
        </Field>
        <Field label="Horas estimadas">
          <Input type="number" min={0} step="0.5" value={v.estimated_hours ?? ''} onChange={(e) => set('estimated_hours', e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <Field label="Detalhes" className="sm:col-span-2">
          <Textarea value={v.description ?? ''} onChange={(e) => set('description', e.target.value || null)} rows={3} />
        </Field>
      </div>
    </Modal>
  );
}
