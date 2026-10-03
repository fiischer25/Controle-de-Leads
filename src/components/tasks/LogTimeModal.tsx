import { useMemo, useState } from 'react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { isProjectActive } from '../../lib/domain';
import { today } from '../../lib/utils';
import { Button, Field, Input, Listbox, Modal } from '../ui';

/** Lançamento manual de horas em uma tarefa (atalho "Lançar horas" do menu Criar). */
export function LogTimeModal({ onClose, taskId }: { onClose: () => void; taskId?: string }) {
  const { db, maps, me, addTimeEntry } = useData();
  const toast = useToast();
  const [task, setTask] = useState(taskId ?? '');
  const [date, setDate] = useState(today());
  const [hours, setHours] = useState('1');
  const [minutes, setMinutes] = useState('0');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Minhas tarefas abertas primeiro, depois as demais tarefas abertas do escritório.
  const options = useMemo(() => {
    const open = db.tasks.filter((t) => {
      if (t.status === 'done') return false;
      const p = t.project_id ? maps.projects[t.project_id] : null;
      return !p || isProjectActive(p);
    });
    const label = (id: string) => {
      const t = maps.tasks[id];
      const p = t?.project_id ? maps.projects[t.project_id] : null;
      return p ? `${t.title} · ${p.name}` : `${t.title} · Avulsa`;
    };
    const mine = open.filter((t) => t.assignee_id === me.id);
    const others = open.filter((t) => t.assignee_id !== me.id);
    return [...mine, ...others].map((t) => ({ value: t.id, label: label(t.id) }));
  }, [db.tasks, maps, me.id]);

  const submit = async () => {
    const total = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
    if (!task) return setError('Escolha a tarefa.');
    if (total <= 0) return setError('Informe o tempo trabalhado.');
    setBusy(true);
    try {
      await addTimeEntry(task, date, total, note.trim() || null);
      toast.success('Horas lançadas.');
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Lançar horas"
      subtitle="Registre o tempo trabalhado em uma tarefa."
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} loadingText="Salvando…" onClick={submit}>
            Lançar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Tarefa" required error={error && !task ? error : null}>
          <Listbox value={task} onChange={setTask} options={options} placeholder="Escolha a tarefa" invalid={!!error && !task} aria-label="Tarefa" />
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Data" className="col-span-2 sm:col-span-1">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Horas">
            <Input type="number" min={0} inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
          </Field>
          <Field label="Minutos">
            <Input type="number" min={0} max={59} step={5} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </Field>
        </div>
        {error && task && <p className="text-xs text-danger-fg">{error}</p>}
        <Field label="Observação">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
        </Field>
      </div>
    </Modal>
  );
}
