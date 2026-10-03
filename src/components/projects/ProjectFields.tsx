/* eslint-disable react-refresh/only-export-components */
import { useMemo } from 'react';
import { Layers } from 'lucide-react';
import { useData, type ProjectInput } from '../../context/DataContext';
import { templatesEndDate } from '../../lib/domain';
import type { Profile } from '../../lib/types';
import { byPosition, cn, formatDate } from '../../lib/utils';
import { Avatar, Field, Input, Select, Textarea, UserSelect } from '../ui';

export type ProjectDraft = Omit<ProjectInput, 'client_id' | 'lead_id'>;
export type ProjectErrors = Partial<Record<keyof ProjectDraft, string>>;

export function validateProject(p: ProjectDraft): ProjectErrors {
  const e: ProjectErrors = {};
  if (!p.name.trim()) e.name = 'Informe o nome do projeto';
  if (!p.project_type_id) e.project_type_id = 'Selecione o tipo de projeto';
  if (!p.start_date) e.start_date = 'Informe a data de início';
  if (!p.manager_id) e.manager_id = 'Selecione o responsável';
  if (p.due_date && p.start_date && p.due_date < p.start_date) e.due_date = 'O prazo deve ser depois do início';
  return e;
}

export function MemberPicker({
  users,
  value,
  onChange,
}: {
  users: Profile[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {users
        .filter((u) => u.active)
        .map((u) => {
          const on = value.includes(u.id);
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => onChange(on ? value.filter((x) => x !== u.id) : [...value, u.id])}
              className={cn(
                'flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition-colors',
                on ? 'border-brand-300 bg-brand-50 text-brand-900' : 'border-line bg-surface text-stone-600 hover:border-stone-300',
              )}
              aria-pressed={on}
            >
              <Avatar user={u} size="sm" />
              {u.name.split(' ')[0]}
            </button>
          );
        })}
    </div>
  );
}

export function ProjectFields({
  value,
  onChange,
  errors,
  showTemplateInfo = true,
}: {
  value: ProjectDraft;
  onChange: (v: ProjectDraft) => void;
  errors: ProjectErrors;
  showTemplateInfo?: boolean;
}) {
  const { db } = useData();
  const set = <K extends keyof ProjectDraft>(key: K, v: ProjectDraft[K]) => onChange({ ...value, [key]: v });
  const types = db.project_types.filter((t) => t.active || t.id === value.project_type_id).sort(byPosition);
  const templates = useMemo(
    () => db.task_templates.filter((t) => t.project_type_id === value.project_type_id),
    [db.task_templates, value.project_type_id],
  );
  const phases = [...new Set([...templates].sort(byPosition).map((t) => t.phase))];
  const estimatedEnd = value.start_date ? templatesEndDate(templates, value.start_date) : null;

  const changeType = (id: string) => {
    const tpl = db.task_templates.filter((t) => t.project_type_id === id);
    const end = value.start_date ? templatesEndDate(tpl, value.start_date) : null;
    onChange({ ...value, project_type_id: id, due_date: end ?? value.due_date });
  };
  const changeStart = (d: string) => {
    const end = d ? templatesEndDate(templates, d) : null;
    onChange({ ...value, start_date: d, due_date: end ?? value.due_date });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-6">
        <Field label="Tipo de projeto" required error={errors.project_type_id} className="sm:col-span-3">
          <Select value={value.project_type_id} onChange={(e) => changeType(e.target.value)} invalid={!!errors.project_type_id}>
            <option value="">Selecione…</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nome do projeto" required error={errors.name} className="sm:col-span-3" hint="Ex.: CASA J.D.">
          <Input value={value.name} onChange={(e) => set('name', e.target.value.toUpperCase())} invalid={!!errors.name} />
        </Field>
        <Field label="Início" required error={errors.start_date} className="sm:col-span-2">
          <Input type="date" value={value.start_date} onChange={(e) => changeStart(e.target.value)} invalid={!!errors.start_date} />
        </Field>
        <Field
          label="Prazo de entrega"
          error={errors.due_date}
          className="sm:col-span-2"
          hint={estimatedEnd ? `Previsto pelo cronograma: ${formatDate(estimatedEnd)}` : undefined}
        >
          <Input type="date" value={value.due_date ?? ''} onChange={(e) => set('due_date', e.target.value || null)} invalid={!!errors.due_date} />
        </Field>
        <Field label="Área (m²)" className="sm:col-span-2">
          <Input type="number" min={0} value={value.area_m2 ?? ''} onChange={(e) => set('area_m2', e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <Field label="Endereço da obra" className="sm:col-span-4">
          <Input value={value.site_address ?? ''} onChange={(e) => set('site_address', e.target.value || null)} />
        </Field>
        <Field label="Cidade da obra" className="sm:col-span-2">
          <Input value={value.site_city ?? ''} onChange={(e) => set('site_city', e.target.value || null)} />
        </Field>
        <Field label="Responsável pelo projeto" required error={errors.manager_id} className="sm:col-span-3">
          <UserSelect
            users={db.profiles}
            value={value.manager_id}
            onChange={(id) =>
              onChange({
                ...value,
                manager_id: id,
                member_ids: id && !value.member_ids.includes(id) ? [...value.member_ids, id] : value.member_ids,
                default_assignee_id: value.default_assignee_id ?? id,
              })
            }
            placeholder="Selecione…"
            invalid={!!errors.manager_id}
          />
        </Field>
        <Field label="Responsável padrão pelas tarefas" className="sm:col-span-3" hint="Pode ser alterado tarefa a tarefa depois.">
          <UserSelect users={db.profiles} value={value.default_assignee_id} onChange={(id) => set('default_assignee_id', id)} placeholder="Deixar sem responsável" />
        </Field>
        <Field label="Equipe do projeto" className="sm:col-span-6">
          <MemberPicker users={db.profiles} value={value.member_ids} onChange={(ids) => set('member_ids', ids)} />
        </Field>
        <Field label="Descrição / escopo" className="sm:col-span-6">
          <Textarea value={value.description ?? ''} onChange={(e) => set('description', e.target.value || null)} rows={2} />
        </Field>
      </div>
      {showTemplateInfo && value.project_type_id && (
        <div className="rounded-lg border border-line bg-stone-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-800">
            <Layers className="h-4 w-4 text-brand-600" />
            {templates.length} tarefas serão criadas automaticamente
          </div>
          {phases.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {phases.map((p, i) => (
                <span key={p} className="rounded-xs bg-surface px-2 py-1 text-xs text-stone-600 ring-1 ring-stone-200">
                  <span className="mr-1 text-stone-400">{i + 1}.</span>
                  {p}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs text-stone-500">Este tipo ainda não tem tarefas-modelo. Cadastre-as em Configurações.</p>
          )}
        </div>
      )}
    </div>
  );
}
