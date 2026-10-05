import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { orderedPhases } from '../../lib/domain';
import type { Project, Task } from '../../lib/types';
import { byPosition } from '../../lib/utils';
import { Button, Checkbox, Field, Input, Modal, Segmented, Select } from '../ui';

/**
 * Usa as tarefas do projeto como modelo: substitui as tarefas-modelo de um tipo de projeto
 * (por padrão o do próprio projeto) ou cria um tipo novo. Depois é só ajustar em Configurações.
 */
export function SaveAsTemplateModal({ project, tasks, onClose }: { project: Project; tasks: Task[]; onClose: () => void }) {
  const { db, saveProjectAsTemplate } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const types = useMemo(() => [...db.project_types].sort(byPosition), [db.project_types]);
  const [mode, setMode] = useState<'replace' | 'new'>('replace');
  const [typeId, setTypeId] = useState(types.some((t) => t.id === project.project_type_id) ? project.project_type_id : (types[0]?.id ?? ''));
  const [name, setName] = useState('');
  const [keepAssignees, setKeepAssignees] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const phases = orderedPhases(tasks).length;
  const current = db.task_templates.filter((t) => t.project_type_id === typeId).length;
  const typeName = types.find((t) => t.id === typeId)?.name ?? '';

  const submit = async () => {
    if (mode === 'new' && !name.trim()) return setError('Informe o nome do novo tipo de projeto.');
    if (mode === 'replace' && !typeId) return setError('Escolha o tipo de projeto.');
    setError('');
    setBusy(true);
    try {
      const { type, count } = await saveProjectAsTemplate(project.id, mode === 'new' ? { newTypeName: name } : { typeId }, keepAssignees);
      toast.success(`Modelo “${type.name}” salvo com ${count} tarefas.`);
      onClose();
      navigate(`/configuracoes?aba=tipos&tipo=${type.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o modelo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Usar como modelo"
      subtitle={`As ${tasks.length} tarefas de ${project.name} (${phases} ${phases === 1 ? 'etapa' : 'etapas'}) viram o modelo de um tipo de projeto.`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            Salvar modelo
          </Button>
        </>
      }
    >
      <Segmented<'replace' | 'new'>
        value={mode}
        onChange={setMode}
        options={[
          { id: 'replace', label: 'Atualizar um tipo existente' },
          { id: 'new', label: 'Criar um tipo novo' },
        ]}
      />
      <div className="mt-4">
        {mode === 'replace' ? (
          <Field label="Tipo de projeto">
            <Select value={typeId} onChange={(e) => setTypeId(e.target.value)} aria-label="Tipo de projeto">
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Nome do novo tipo">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Arquitetura e Interiores (completo)" aria-label="Nome do novo tipo" autoFocus />
          </Field>
        )}
      </div>
      <div className="mt-4">
        <Checkbox checked={keepAssignees} onChange={setKeepAssignees} label="Manter quem está à frente de cada tarefa" />
        <p className="mt-1 pl-6 text-[12.5px] text-faint">Desmarcado, as tarefas ficam com o responsável de cada projeto novo.</p>
      </div>
      <div className="mt-5 rounded-[12px] bg-canvas px-4 py-3 text-[13px] text-muted">
        Etapas, ordem, checklist, observações, prioridade e horas estimadas são copiados. Datas e duração não vão para o modelo:
        em cada projeto novo elas são definidas por quem cuida dele.
        {mode === 'replace' && current > 0 && (
          <span className="mt-1.5 block text-warning-fg">
            As {current} tarefas-modelo atuais de “{typeName}” serão substituídas. Projetos já criados não mudam.
          </span>
        )}
      </div>
      {error && <p className="mt-3 text-[13px] text-danger-fg">{error}</p>}
    </Modal>
  );
}
