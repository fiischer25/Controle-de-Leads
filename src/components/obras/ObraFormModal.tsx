import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { budgetTotals, OBRA_STATUS, OBRA_STATUS_ORDER } from '../../lib/obras';
import type { Budget, Obra, ObraStatus } from '../../lib/types';
import { addBusinessDays, formatDate, formatMoney, today } from '../../lib/utils';
import { Button, Checkbox, Field, Input, Modal, Select, Textarea, UserSelect } from '../ui';
import { MoneyInput } from '../finance/MoneyInput';
import { MemberPicker } from '../projects/ProjectFields';
import { ClientChooser, type ClientValue } from './parts';
import { useObraActions, type ObraInput } from './useObraActions';

/**
 * Nova obra, edição da obra ou conversão de um orçamento em obra (as partes do orçamento viram as
 * etapas do cronograma, com valores, itens e datas pelos prazos de cada parte).
 */
export function ObraFormModal({ obra, budget, onClose }: { obra?: Obra; budget?: Budget; onClose: () => void }) {
  const { db, me, can } = useData();
  const { createObra, convertBudget, updateObra } = useObraActions();
  const toast = useToast();
  const navigate = useNavigate();
  const totals = useMemo(() => (budget ? budgetTotals(budget.data, budget.area_m2) : null), [budget]);
  const projectFromBudget = budget?.project_id ? db.projects.find((p) => p.id === budget.project_id) : null;

  const [form, setForm] = useState<ObraInput & { status: ObraStatus }>(() =>
    obra
      ? { ...obra }
      : {
          name: budget?.name ?? '',
          client_id: budget?.client_id ?? null,
          client_name: budget?.client_name ?? null,
          client_phone: budget?.client_phone ?? null,
          client_email: budget?.client_email ?? null,
          project_id: budget?.project_id ?? null,
          manager_id: projectFromBudget?.manager_id ?? me.id,
          member_ids: [],
          address: budget?.address ?? null,
          city: budget?.city ?? null,
          area_m2: budget?.area_m2 ?? null,
          start_date: today(),
          due_date: totals?.days ? addBusinessDays(today(), totals.days - 1) : null,
          contract_value: totals ? totals.total : null,
          notes: null,
          status: 'planejamento',
        },
  );
  const [markProject, setMarkProject] = useState(true);
  const [busy, setBusy] = useState(false);
  const set = (c: Partial<typeof form>) => setForm((f) => ({ ...f, ...c }));
  const team = db.profiles.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name));
  const projects = [...db.projects].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const linkedProject = form.project_id ? db.projects.find((p) => p.id === form.project_id) : null;

  const save = async () => {
    if (!form.name.trim()) return toast.error('Dê um nome para a obra (ex.: CASA J.D.).');
    if (form.start_date && form.due_date && form.due_date < form.start_date) return toast.error('A entrega não pode ser antes do início.');
    setBusy(true);
    try {
      // Só os campos do formulário (anexos e o resto da obra podem ter mudado enquanto estava aberto)
      const input: ObraInput & { status: ObraStatus } = {
        name: form.name.trim().toUpperCase(),
        client_id: form.client_id,
        client_name: form.client_name,
        client_phone: form.client_phone,
        client_email: form.client_email,
        project_id: form.project_id,
        manager_id: form.manager_id,
        member_ids: form.member_ids,
        address: form.address,
        city: form.city,
        area_m2: form.area_m2,
        start_date: form.start_date,
        due_date: form.due_date,
        contract_value: form.contract_value,
        notes: form.notes,
        status: form.status,
      };
      if (obra) {
        await updateObra(obra, input);
        toast.success('Obra atualizada.');
        onClose();
      } else {
        const saved = budget ? await convertBudget(budget, input, { markProject }) : await createObra(input);
        toast.success(budget ? `Obra criada com ${budget.data.sections.length} etapas do orçamento.` : 'Obra criada.');
        onClose();
        navigate(`/obras/${saved.id}`);
      }
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const client: ClientValue = { client_id: form.client_id, client_name: form.client_name, client_phone: form.client_phone, client_email: form.client_email };

  return (
    <Modal
      size="lg"
      title={obra ? 'Editar obra' : budget ? 'Transformar orçamento em obra' : 'Nova obra'}
      subtitle={
        budget && totals
          ? `${budget.code} · ${budget.data.sections.length} partes viram etapas do cronograma · ${formatMoney(totals.total)}`
          : obra
            ? obra.code
            : 'Sem orçamento: as etapas podem ser criadas no cronograma.'
      }
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {obra ? 'Salvar' : budget ? 'Criar obra' : 'Criar obra'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-6">
          <Field label="Nome da obra" required className="sm:col-span-3" hint="Ex.: CASA J.D.">
            <Input value={form.name} onChange={(e) => set({ name: e.target.value.toUpperCase() })} />
          </Field>
          {obra && (
            <Field label="Status" className="sm:col-span-3">
              <Select value={form.status} onChange={(e) => set({ status: e.target.value as ObraStatus })}>
                {OBRA_STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {OBRA_STATUS[s].label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Endereço da obra" className="sm:col-span-3">
            <Input value={form.address ?? ''} onChange={(e) => set({ address: e.target.value || null })} />
          </Field>
          <Field label="Cidade" className="sm:col-span-2">
            <Input value={form.city ?? ''} onChange={(e) => set({ city: e.target.value || null })} />
          </Field>
          <Field label="Área (m²)" className="sm:col-span-1">
            <Input type="number" min={0} inputMode="decimal" value={form.area_m2 ?? ''} onChange={(e) => set({ area_m2: e.target.value ? Number(e.target.value) : null })} />
          </Field>
          <Field label="Início" className="sm:col-span-2">
            <Input type="date" value={form.start_date ?? ''} onChange={(e) => set({ start_date: e.target.value || null })} />
          </Field>
          <Field
            label="Entrega prevista"
            className="sm:col-span-2"
            hint={!obra && totals?.days ? `Pelos prazos das partes: ${totals.days} dias úteis.` : undefined}
          >
            <Input type="date" value={form.due_date ?? ''} onChange={(e) => set({ due_date: e.target.value || null })} />
          </Field>
          <Field label="Valor orçado / contratado" className="sm:col-span-2" hint="Aditivos aprovados somam a este valor.">
            <MoneyInput value={form.contract_value} onChange={(v) => set({ contract_value: v })} />
          </Field>
        </div>

        <ClientChooser value={client} onChange={(c) => set(c)} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Responsável pela obra">
            <UserSelect users={team} value={form.manager_id} onChange={(id) => set({ manager_id: id })} />
          </Field>
          {can('projetos') && (
            <Field label="Projeto de origem" hint="Projeto de arquitetura/interiores desta obra (opcional).">
              <Select value={form.project_id ?? ''} onChange={(e) => set({ project_id: e.target.value || null })}>
                <option value="">Nenhum</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        {!obra && budget && linkedProject && linkedProject.status !== 'obra' && can('projetos') && (
          <Checkbox checked={markProject} onChange={setMarkProject} label={`Marcar o projeto ${linkedProject.name} como “Obra”`} />
        )}

        <Field label="Equipe na obra">
          <MemberPicker users={team.filter((u) => u.id !== form.manager_id)} value={form.member_ids} onChange={(ids) => set({ member_ids: ids })} />
        </Field>
        <Field label="Observações">
          <Textarea value={form.notes ?? ''} onChange={(e) => set({ notes: e.target.value || null })} />
        </Field>
        {!obra && budget && form.start_date && (
          <p className="text-[12.5px] text-muted">
            O cronograma começa em {formatDate(form.start_date)}; partes sem prazo ficam sem datas e podem ser ajustadas depois.
          </p>
        )}
      </div>
    </Modal>
  );
}
