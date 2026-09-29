import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { suggestProjectName, today } from '../../lib/utils';
import { ClientFormModal } from '../clients/ClientFormModal';
import { Button, Field, Modal, Select } from '../ui';
import { ProjectFields, validateProject, type ProjectDraft, type ProjectErrors } from './ProjectFields';

/** Novo projeto para um cliente já cadastrado (ex.: cliente recorrente). */
export function ProjectFormModal({ onClose, clientId: initialClient }: { onClose: () => void; clientId?: string }) {
  const { db, createProject } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const [clientId, setClientId] = useState(initialClient ?? '');
  const [clientError, setClientError] = useState<string | null>(null);
  const [newClient, setNewClient] = useState(false);
  const [draft, setDraft] = useState<ProjectDraft>(() => {
    const c = initialClient ? db.clients.find((x) => x.id === initialClient) : null;
    return {
      name: c ? suggestProjectName(c.name) : '',
      project_type_id: '',
      manager_id: null,
      member_ids: [],
      start_date: today(),
      due_date: null,
      area_m2: null,
      site_address: null,
      site_city: c?.city ?? null,
      description: null,
      default_assignee_id: null,
    };
  });
  const [errors, setErrors] = useState<ProjectErrors>({});
  const [busy, setBusy] = useState(false);

  const pickClient = (id: string) => {
    setClientId(id);
    setClientError(null);
    const c = db.clients.find((x) => x.id === id);
    if (c) setDraft((d) => ({ ...d, name: d.name || suggestProjectName(c.name), site_city: d.site_city || c.city }));
  };

  const save = async () => {
    const errs = validateProject(draft);
    setErrors(errs);
    if (!clientId) setClientError('Selecione o cliente');
    if (Object.keys(errs).length || !clientId) return;
    setBusy(true);
    try {
      const p = await createProject({ ...draft, client_id: clientId });
      toast.success(`Projeto ${p.name} criado.`);
      onClose();
      navigate(`/projetos/${p.id}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        title="Novo projeto"
        subtitle="As tarefas do tipo de projeto escolhido são criadas automaticamente."
        onClose={onClose}
        size="lg"
        footer={
          <>
            <Button onClick={onClose}>Cancelar</Button>
            <Button variant="primary" loading={busy} onClick={save}>Criar projeto</Button>
          </>
        }
      >
        <div className="mb-5 flex items-end gap-2">
          <Field label="Cliente" required error={clientError} className="flex-1">
            <Select value={clientId} onChange={(e) => pickClient(e.target.value)} invalid={!!clientError}>
              <option value="">Selecione o cliente…</option>
              {[...db.clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                <option key={c.id} value={c.id}>{c.name} · {c.city}</option>
              ))}
            </Select>
          </Field>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setNewClient(true)} className={clientError ? 'mb-5' : ''}>
            Novo cliente
          </Button>
        </div>
        <ProjectFields value={draft} onChange={setDraft} errors={errors} />
      </Modal>
      {newClient && <ClientFormModal onClose={() => setNewClient(false)} onSaved={(c) => pickClient(c.id)} />}
    </>
  );
}
