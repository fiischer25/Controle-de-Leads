import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  GripVertical,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { WhatsAppSettings } from './settings/WhatsAppSettings';
import { useData } from '../context/DataContext';
import { stageColor } from '../lib/status';
import { useToast } from '../context/ToastContext';
import { STAGE_KIND, SWATCHES } from '../lib/constants';
import type { LeadSource, LeadStage, ProjectType, StageKind, TableName, TaskTemplate } from '../lib/types';
import { TABLES } from '../lib/types';
import { byPosition, cn, downloadFile, nowIso, toCalendarEmbedUrl, today, uid } from '../lib/utils';
import { Badge, Button, Card, CardHeader, Checkbox, ConfirmDialog, EmptyState, Field, IconButton, Input, PageHeader, Select, Tabs, Textarea } from '../components/ui';

type Tab = 'escritorio' | 'tipos' | 'funil' | 'origens' | 'agenda' | 'whatsapp' | 'dados';

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('aba') as Tab) || 'escritorio';
  return (
    <div>
      <PageHeader title="Configurações" description="Personalize o sistema para a rotina do escritório." />
      <Tabs<Tab>
        className="mb-8"
        value={tab}
        onChange={(t) => setParams({ aba: t }, { replace: true })}
        tabs={[
          { id: 'escritorio', label: 'Escritório e logo' },
          { id: 'tipos', label: 'Tipos de projeto e tarefas' },
          { id: 'funil', label: 'Etapas do funil' },
          { id: 'origens', label: 'Origens de leads' },
          { id: 'agenda', label: 'Google Agenda' },
          { id: 'whatsapp', label: 'WhatsApp e assistente' },
          { id: 'dados', label: 'Backup' },
        ]}
      />
      {tab === 'tipos' && <ProjectTypesSettings />}
      {tab === 'funil' && <StagesSettings />}
      {tab === 'origens' && <SourcesSettings />}
      {tab === 'agenda' && <CalendarSettings />}
      {tab === 'escritorio' && <OfficeSettings />}
      {tab === 'whatsapp' && <WhatsAppSettings />}
      {tab === 'dados' && <DataSettings />}
    </div>
  );
}

/** Troca a posição de dois itens vizinhos. */
function useReorder<T extends TableName>(table: T) {
  const { patch } = useData();
  const toast = useToast();
  return async (items: Array<{ id: string; position: number }>, index: number, dir: -1 | 1) => {
    const other = items[index + dir];
    const cur = items[index];
    if (!other) return;
    try {
      await patch(table, cur.id, { position: other.position } as never);
      await patch(table, other.id, { position: cur.position } as never);
    } catch (e) {
      toast.error(e);
    }
  };
}

// ----------------------------------------------------------------------------- Tipos
function ProjectTypesSettings() {
  const { db, insertRows, patch, removeRows, log } = useData();
  const toast = useToast();
  const types = useMemo(() => [...db.project_types].sort(byPosition), [db.project_types]);
  const [selectedId, setSelectedId] = useState<string | null>(types[0]?.id ?? null);
  const [confirmDelete, setConfirmDelete] = useState<ProjectType | null>(null);
  const reorder = useReorder('project_types');
  const selected = types.find((t) => t.id === selectedId) ?? types[0];

  const addType = async () => {
    const t: ProjectType = { id: uid(), name: 'Novo tipo de projeto', description: null, color: SWATCHES[types.length % SWATCHES.length], active: true, position: types.length ? Math.max(...types.map((x) => x.position)) + 1 : 0 };
    await insertRows('project_types', [t]).catch(toast.error);
    setSelectedId(t.id);
  };

  const duplicate = async (src: ProjectType) => {
    const copy: ProjectType = { ...src, id: uid(), name: `${src.name} (cópia)`, position: Math.max(...types.map((x) => x.position)) + 1 };
    const tpl = db.task_templates.filter((x) => x.project_type_id === src.id).map((x) => ({ ...x, id: uid(), project_type_id: copy.id }));
    try {
      await insertRows('project_types', [copy]);
      await insertRows('task_templates', tpl);
      setSelectedId(copy.id);
      toast.success('Tipo duplicado.');
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <Card className="h-fit overflow-hidden">
        <CardHeader title="Tipos de projeto" subtitle="Ex.: Arquitetura, Interiores" action={<Button size="xs" variant="dark" icon={<Plus className="h-3.5 w-3.5" />} onClick={addType}>Novo</Button>} />
        <ul className="divide-y divide-line/70 border-t border-line/70">
          {types.map((t, i) => {
            const count = db.task_templates.filter((x) => x.project_type_id === t.id).length;
            return (
              <li key={t.id} className={cn('group flex items-center gap-2 px-3 py-2.5', selected?.id === t.id ? 'bg-brand-50/60' : 'hover:bg-stone-50')}>
                <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setSelectedId(t.id)}>
                  <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="min-w-0">
                    <span className={cn('block truncate text-sm font-medium', !t.active && 'text-stone-400 line-through')}>{t.name}</span>
                    <span className="text-xs text-stone-500">{count} tarefas-modelo</span>
                  </span>
                </button>
                <div className="flex opacity-0 group-hover:opacity-100">
                  <IconButton label="Subir" className="h-6 w-6" onClick={() => reorder(types, i, -1)} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></IconButton>
                  <IconButton label="Descer" className="h-6 w-6" onClick={() => reorder(types, i, 1)} disabled={i === types.length - 1}><ArrowDown className="h-3.5 w-3.5" /></IconButton>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {selected ? (
        <div className="space-y-5">
          <Card className="p-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <Field label="Nome do tipo">
                <Input key={`n${selected.id}`} defaultValue={selected.name} onBlur={(e) => e.target.value.trim() && e.target.value !== selected.name && patch('project_types', selected.id, { name: e.target.value.trim() }).catch(toast.error)} />
              </Field>
              <Field label="Cor">
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {SWATCHES.slice(0, 8).map((c) => (
                    <button key={c} onClick={() => patch('project_types', selected.id, { color: c }).catch(toast.error)} className={cn('h-7 w-7 rounded-full ring-offset-2', selected.color === c && 'ring-2 ring-stone-900')} style={{ backgroundColor: c }} aria-label={`Cor ${c}`} />
                  ))}
                </div>
              </Field>
              <Field label="Descrição" className="sm:col-span-2">
                <Textarea key={`d${selected.id}`} rows={2} defaultValue={selected.description ?? ''} onBlur={(e) => (e.target.value || null) !== selected.description && patch('project_types', selected.id, { description: e.target.value || null }).catch(toast.error)} />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-4">
              <Checkbox checked={selected.active} onChange={(v) => patch('project_types', selected.id, { active: v }).catch(toast.error)} label="Disponível para novos projetos e leads" />
              <div className="flex gap-2">
                <Button size="sm" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => duplicate(selected)}>Duplicar</Button>
                <Button size="sm" variant="ghost" className="text-danger-fg hover:bg-danger-bg" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirmDelete(selected)}>Excluir</Button>
              </div>
            </div>
          </Card>
          <TemplatesEditor type={selected} />
        </div>
      ) : (
        <Card><EmptyState title="Nenhum tipo de projeto" action={<Button variant="primary" onClick={addType}>Criar tipo</Button>} /></Card>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Excluir tipo de projeto"
          danger
          confirmLabel="Excluir"
          message={
            db.projects.some((p) => p.project_type_id === confirmDelete.id)
              ? <>Existem projetos usando <b>{confirmDelete.name}</b>. Desative o tipo em vez de excluí-lo.</>
              : <>Excluir <b>{confirmDelete.name}</b> e suas tarefas-modelo? Projetos já criados não são afetados.</>
          }
          onClose={() => setConfirmDelete(null)}
          onConfirm={async () => {
            if (db.projects.some((p) => p.project_type_id === confirmDelete.id)) return;
            try {
              await removeRows('task_templates', db.task_templates.filter((x) => x.project_type_id === confirmDelete.id).map((x) => x.id));
              await removeRows('project_types', [confirmDelete.id]);
              await log('settings', null, 'deleted', `excluiu o tipo de projeto ${confirmDelete.name}`);
              setSelectedId(null);
            } catch (e) {
              toast.error(e);
            }
          }}
        />
      )}
    </div>
  );
}

function TemplatesEditor({ type }: { type: ProjectType }) {
  const { db, insertRows, patch, removeRows } = useData();
  const toast = useToast();
  const templates = useMemo(() => db.task_templates.filter((t) => t.project_type_id === type.id).sort(byPosition), [db.task_templates, type.id]);
  const phases = [...new Set(templates.map((t) => t.phase))];
  const [draft, setDraft] = useState({ phase: phases[phases.length - 1] ?? 'Levantamento', title: '', days: '2' });
  const reorder = useReorder('task_templates');
  const totalDays = templates.reduce((a, t) => a + Math.max(1, t.duration_days), 0);

  const add = async () => {
    if (!draft.title.trim() || !draft.phase.trim()) return;
    const phase = draft.phase.trim();
    const inPhase = templates.filter((t) => t.phase === phase);
    let position: number;
    if (inPhase.length) {
      const last = inPhase[inPhase.length - 1];
      const next = templates[templates.indexOf(last) + 1];
      position = next ? (last.position + next.position) / 2 : last.position + 1;
    } else {
      position = templates.length ? templates[templates.length - 1].position + 1 : 0;
    }
    const tpl: TaskTemplate = { id: uid(), project_type_id: type.id, phase, title: draft.title.trim(), description: null, duration_days: Math.max(1, Number(draft.days) || 1), position };
    try {
      await insertRows('task_templates', [tpl]);
      setDraft({ ...draft, title: '' });
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={`Tarefas-modelo · ${type.name}`}
        subtitle={`${templates.length} tarefas em ${phases.length} etapas · ${totalDays} dias úteis estimados`}
      />
      <p className="-mt-1 px-5 pb-3 text-xs text-stone-500">
        Estas tarefas são criadas automaticamente em cada novo projeto deste tipo, encadeadas em sequência a partir da data de início.
      </p>
      <div className="border-t border-line/70">
        {phases.map((phase) => (
          <div key={phase}>
            <div className="flex items-center gap-2 bg-stone-50 px-5 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-600">{phase}</span>
              <Badge>{templates.filter((t) => t.phase === phase).length}</Badge>
            </div>
            <ul className="divide-y divide-line/70">
              {templates.filter((t) => t.phase === phase).map((t) => {
                const i = templates.indexOf(t);
                return (
                  <li key={t.id} className="group grid grid-cols-[16px_1fr_150px_90px_auto] items-center gap-2 px-5 py-1.5">
                    <GripVertical className="h-4 w-4 text-stone-300" />
                    <input
                      defaultValue={t.title}
                      key={`t${t.id}${t.title}`}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== t.title && patch('task_templates', t.id, { title: e.target.value.trim() }).catch(toast.error)}
                      className="rounded-xs bg-transparent px-2 py-1 text-sm outline-none hover:bg-stone-50 focus:bg-surface focus:ring-2 focus:ring-brand-500/20"
                      aria-label="Título"
                    />
                    <input
                      list="phase-list"
                      defaultValue={t.phase}
                      key={`p${t.id}${t.phase}`}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== t.phase && patch('task_templates', t.id, { phase: e.target.value.trim() }).catch(toast.error)}
                      className="rounded-xs bg-transparent px-2 py-1 text-xs text-stone-600 outline-none hover:bg-stone-50 focus:bg-surface focus:ring-2 focus:ring-brand-500/20"
                      aria-label="Etapa"
                    />
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        defaultValue={t.duration_days}
                        key={`d${t.id}${t.duration_days}`}
                        onBlur={(e) => Number(e.target.value) !== t.duration_days && patch('task_templates', t.id, { duration_days: Math.max(1, Number(e.target.value) || 1) }).catch(toast.error)}
                        className="w-12 rounded-xs bg-transparent px-2 py-1 text-right text-sm outline-none hover:bg-stone-50 focus:bg-surface focus:ring-2 focus:ring-brand-500/20"
                        aria-label="Duração em dias"
                      />
                      <span className="text-xs text-stone-400">dias</span>
                    </div>
                    <div className="flex opacity-40 group-hover:opacity-100">
                      <IconButton label="Subir" className="h-6 w-6" onClick={() => reorder(templates, i, -1)} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></IconButton>
                      <IconButton label="Descer" className="h-6 w-6" onClick={() => reorder(templates, i, 1)} disabled={i === templates.length - 1}><ArrowDown className="h-3.5 w-3.5" /></IconButton>
                      <IconButton label="Remover" className="h-6 w-6 hover:text-danger-fg" onClick={() => removeRows('task_templates', [t.id]).catch(toast.error)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <datalist id="phase-list">{phases.map((p) => <option key={p} value={p} />)}</datalist>
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); add(); }}
        className="grid gap-2 border-t border-line bg-stone-50/60 p-4 sm:grid-cols-[180px_1fr_90px_auto]"
      >
        <Input list="phase-list" value={draft.phase} onChange={(e) => setDraft({ ...draft, phase: e.target.value })} placeholder="Etapa" aria-label="Etapa" />
        <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Nova tarefa (ex.: Projeto luminotécnico)" aria-label="Tarefa" />
        <Input type="number" min={1} value={draft.days} onChange={(e) => setDraft({ ...draft, days: e.target.value })} aria-label="Dias" title="Duração em dias úteis" />
        <Button type="submit" variant="dark" icon={<Plus className="h-4 w-4" />} disabled={!draft.title.trim()}>Adicionar</Button>
      </form>
    </Card>
  );
}

// ----------------------------------------------------------------------------- Funil
function StagesSettings() {
  const { db, insertRows, patch, removeRows } = useData();
  const toast = useToast();
  const stages = useMemo(() => [...db.lead_stages].sort(byPosition), [db.lead_stages]);
  const reorder = useReorder('lead_stages');
  const [name, setName] = useState('');

  const add = async () => {
    if (!name.trim()) return;
    const lastOpen = [...stages].reverse().find((s) => s.kind === 'open');
    const nextAfter = lastOpen ? stages[stages.indexOf(lastOpen) + 1] : stages[0];
    const position = lastOpen && nextAfter ? (lastOpen.position + nextAfter.position) / 2 : stages.length;
    const stage: LeadStage = { id: uid(), name: name.trim(), kind: 'open', color: SWATCHES[stages.length % SWATCHES.length], position };
    await insertRows('lead_stages', [stage]).catch(toast.error);
    setName('');
  };

  return (
    <Card className="max-w-3xl overflow-hidden">
      <CardHeader title="Etapas do funil de oportunidades" subtitle="Colunas do kanban. Tenha pelo menos uma etapa “Fechado (ganho)” e uma “Perdido”." />
      <ul className="divide-y divide-line/70 border-t border-line/70">
        {stages.map((s, i) => {
          const count = db.leads.filter((l) => l.stage_id === s.id).length;
          return (
            <li key={s.id} className="grid grid-cols-[auto_1fr_170px_auto] items-center gap-3 px-5 py-2.5">
              <span className="ml-1 h-2 w-2 rounded-full" style={{ backgroundColor: stageColor(s, stages) }} title="A cor segue a ordem do funil" aria-hidden />
              <div>
                <input key={s.name} defaultValue={s.name} onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && patch('lead_stages', s.id, { name: e.target.value.trim() }).catch(toast.error)} className="w-full rounded-xs bg-transparent px-2 py-1 text-sm font-medium outline-none hover:bg-stone-50 focus:ring-2 focus:ring-brand-500/20" aria-label="Nome" />
                <div className="px-2 text-xs text-stone-500">{count} oportunidade{count !== 1 ? 's' : ''}</div>
              </div>
              <Select value={s.kind} onChange={(e) => patch('lead_stages', s.id, { kind: e.target.value as StageKind }).catch(toast.error)} className="h-8 py-1 text-xs">
                {Object.entries(STAGE_KIND).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </Select>
              <div className="flex">
                <IconButton label="Subir" onClick={() => reorder(stages, i, -1)} disabled={i === 0}><ArrowUp className="h-4 w-4" /></IconButton>
                <IconButton label="Descer" onClick={() => reorder(stages, i, 1)} disabled={i === stages.length - 1}><ArrowDown className="h-4 w-4" /></IconButton>
                <IconButton
                  label={count ? 'Mova as oportunidades antes de excluir' : 'Excluir'}
                  disabled={count > 0}
                  className="hover:text-danger-fg"
                  onClick={() => removeRows('lead_stages', [s.id]).catch(toast.error)}
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            </li>
          );
        })}
      </ul>
      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="flex gap-2 border-t border-line bg-stone-50/60 p-4">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova etapa (ex.: Visita técnica)" />
        <Button type="submit" variant="dark" icon={<Plus className="h-4 w-4" />} disabled={!name.trim()}>Adicionar</Button>
      </form>
    </Card>
  );
}

// ----------------------------------------------------------------------------- Origens
function SourcesSettings() {
  const { db, insertRows, patch, removeRows } = useData();
  const toast = useToast();
  const sources = useMemo(() => [...db.lead_sources].sort(byPosition), [db.lead_sources]);
  const reorder = useReorder('lead_sources');
  const [name, setName] = useState('');
  const add = async () => {
    if (!name.trim()) return;
    const s: LeadSource = { id: uid(), name: name.trim(), active: true, position: sources.length ? sources[sources.length - 1].position + 1 : 0 };
    await insertRows('lead_sources', [s]).catch(toast.error);
    setName('');
  };
  return (
    <Card className="max-w-3xl overflow-hidden">
      <CardHeader title="Origens dos leads" subtitle="Como o cliente chegou até o escritório (tráfego pago, indicação, Instagram…)" />
      <ul className="divide-y divide-line/70 border-t border-line/70">
        {sources.map((s, i) => {
          const count = db.leads.filter((l) => l.source_id === s.id).length;
          return (
            <li key={s.id} className="flex items-center gap-3 px-5 py-2">
              <input key={s.name} defaultValue={s.name} onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && patch('lead_sources', s.id, { name: e.target.value.trim() }).catch(toast.error)} className={cn('flex-1 rounded-xs bg-transparent px-2 py-1 text-sm outline-none hover:bg-stone-50 focus:ring-2 focus:ring-brand-500/20', !s.active && 'text-stone-400')} aria-label="Nome" />
              <span className="w-20 text-right text-xs text-stone-500">{count} lead{count !== 1 ? 's' : ''}</span>
              <Checkbox checked={s.active} onChange={(v) => patch('lead_sources', s.id, { active: v }).catch(toast.error)} label="Ativa" />
              <IconButton label="Subir" onClick={() => reorder(sources, i, -1)} disabled={i === 0}><ArrowUp className="h-4 w-4" /></IconButton>
              <IconButton label="Descer" onClick={() => reorder(sources, i, 1)} disabled={i === sources.length - 1}><ArrowDown className="h-4 w-4" /></IconButton>
              <IconButton label={count ? 'Em uso — desative em vez de excluir' : 'Excluir'} disabled={count > 0} className="hover:text-danger-fg" onClick={() => removeRows('lead_sources', [s.id]).catch(toast.error)}><Trash2 className="h-4 w-4" /></IconButton>
            </li>
          );
        })}
      </ul>
      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="flex gap-2 border-t border-line bg-stone-50/60 p-4">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova origem (ex.: Feira de decoração)" />
        <Button type="submit" variant="dark" icon={<Plus className="h-4 w-4" />} disabled={!name.trim()}>Adicionar</Button>
      </form>
    </Card>
  );
}

// ----------------------------------------------------------------------------- Agenda
function CalendarSettings() {
  const { settings, patch, insertRows, db } = useData();
  const toast = useToast();
  const [value, setValue] = useState(settings.calendar_embed_url ?? '');
  const preview = toCalendarEmbedUrl(value);

  const save = async () => {
    try {
      if (db.app_settings.length) await patch('app_settings', 'office', { calendar_embed_url: value.trim() || null });
      else await insertRows('app_settings', [{ ...settings, calendar_embed_url: value.trim() || null, updated_at: nowIso() }]);
      toast.success('Agenda salva. Ela aparece no painel inicial e na aba Agenda.');
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
      <Card className="p-5">
        <h3 className="font-display text-base font-semibold">Espelhar o Google Agenda do escritório</h3>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-stone-600">
          <li>Abra o <a className="font-medium text-brand-700 hover:underline" href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noreferrer">Google Agenda → Configurações</a>.</li>
          <li>Em <b>Configurações das minhas agendas</b>, clique na agenda do escritório.</li>
          <li>Em <b>Integrar agenda</b>, copie o <b>Código de incorporação</b> (ou o ID da agenda).</li>
          <li>Cole abaixo e salve.</li>
        </ol>
        <p className="mt-3 rounded-sm bg-warning-bg px-3 py-2 text-xs text-warning-fg">
          O Google só exibe os eventos para quem tem acesso à agenda: compartilhe a agenda com os e-mails Google da equipe
          (ou deixe-a pública, se preferir). Cada membro também pode configurar a própria agenda em <b>Meu perfil</b>.
        </p>
        <Field label="Código de incorporação, link ou ID da agenda" className="mt-4">
          <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={4} placeholder='<iframe src="https://calendar.google.com/calendar/embed?src=..." ...></iframe>' />
        </Field>
        {value && !preview && <p className="mt-1 text-xs text-danger-fg">Não reconheci este formato. Cole o código de incorporação do Google Agenda.</p>}
        <div className="mt-3 flex justify-end">
          <Button variant="primary" onClick={save} disabled={!!value && !preview}>Salvar agenda</Button>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader title="Pré-visualização" />
        {preview ? (
          <iframe title="Pré-visualização" src={preview} className="h-[480px] w-full border-t border-line/70" frameBorder={0} />
        ) : (
          <EmptyState title="Nenhuma agenda configurada" description="Cole o código de incorporação ao lado para ver a pré-visualização." />
        )}
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------- Escritório
/** Reduz a imagem para no máx. 720×240 px (mantendo proporção) e devolve um data URL leve. */
async function prepareLogo(file: File): Promise<string> {
  const MAX_BYTES = 2 * 1024 * 1024;
  if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.type)) throw new Error('Envie uma imagem PNG, JPG, WEBP ou SVG.');
  if (file.size > MAX_BYTES) throw new Error('A imagem deve ter no máximo 2 MB.');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
  if (file.type === 'image/svg+xml') {
    if (dataUrl.length > 300_000) throw new Error('O SVG é muito grande. Use um arquivo de até 200 KB.');
    return dataUrl;
  }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Imagem inválida.'));
    el.src = dataUrl;
  });
  const scale = Math.min(1, 720 / img.width, 240 / img.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

function OfficeSettings() {
  const { settings, patch, insertRows, db } = useData();
  const toast = useToast();
  const [v, setV] = useState(settings);
  const [dragging, setDragging] = useState(false);

  const persist = async (changes: Partial<typeof settings>, message: string) => {
    try {
      if (db.app_settings.length) await patch('app_settings', 'office', changes);
      else await insertRows('app_settings', [{ ...settings, ...changes, updated_at: nowIso() }]);
      toast.success(message);
    } catch (e) {
      toast.error(e);
    }
  };

  const save = () =>
    persist(
      {
        office_name: v.office_name.trim() || 'AIROS Arquitetura',
        due_soon_days: Math.max(1, Number(v.due_soon_days) || 7),
        lead_stale_days: Math.max(1, Number(v.lead_stale_days) || 7),
        project_code_prefix: (v.project_code_prefix || 'AIR').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'AIR',
      },
      'Configurações salvas.',
    );

  const onLogo = async (file: File | undefined) => {
    if (!file) return;
    try {
      const logo = await prepareLogo(file);
      setV((prev) => ({ ...prev, logo_url: logo }));
      await persist({ logo_url: logo }, 'Logo atualizado.');
    } catch (e) {
      toast.error(e);
    }
  };

  const removeLogo = async () => {
    setV((prev) => ({ ...prev, logo_url: null }));
    await persist({ logo_url: null }, 'Logo removido. O nome do escritório volta a aparecer.');
  };

  return (
    <div className="grid max-w-5xl gap-5 lg:grid-cols-[1.1fr_1fr]">
      <Card className="p-6">
        <h3 className="font-display text-[15px] font-semibold tracking-tight">Logo do escritório</h3>
        <p className="mt-1 text-sm text-stone-500">Aparece no menu, na tela de login e na aba do navegador, no lugar do nome.</p>
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); onLogo(e.dataTransfer.files?.[0]); }}
          className={cn(
            'mt-5 flex min-h-[168px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-8 text-center transition-colors',
            dragging ? 'border-ink/40 bg-canvas' : 'border-line hover:border-stone-300 hover:bg-canvas/50',
          )}
        >
          {v.logo_url ? (
            <img src={v.logo_url} alt="Logo atual" className="max-h-20 max-w-[260px] object-contain" />
          ) : (
            <Upload className="h-6 w-6 text-stone-300" strokeWidth={1.5} />
          )}
          <span className="text-sm text-stone-500">
            {v.logo_url ? 'Clique ou arraste outra imagem para trocar' : 'Clique ou arraste o logo aqui'}
          </span>
          <span className="text-xs text-stone-400">PNG com fundo transparente ou SVG · até 2 MB</span>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
        </label>
        {v.logo_url && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
              <span className="text-[11px] uppercase tracking-[0.08em] text-stone-400">Prévia no menu</span>
              <img src={v.logo_url} alt="" className="h-9 max-w-[168px] object-contain" />
            </div>
            <Button variant="ghost" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={removeLogo}>
              Remover
            </Button>
          </div>
        )}
      </Card>
      <Card className="p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do escritório" className="sm:col-span-2" hint="Usado quando não há logo e nas mensagens do sistema.">
            <Input value={v.office_name} onChange={(e) => setV({ ...v, office_name: e.target.value })} />
          </Field>
          <Field label="Alerta “a vencer” (dias)" hint="Antecedência do alerta de prazo.">
            <Input type="number" min={1} value={v.due_soon_days} onChange={(e) => setV({ ...v, due_soon_days: Number(e.target.value) })} />
          </Field>
          <Field label="Lead parado (dias)" hint="Sem avanço na mesma etapa.">
            <Input type="number" min={1} value={v.lead_stale_days} onChange={(e) => setV({ ...v, lead_stale_days: Number(e.target.value) })} />
          </Field>
          <Field label="Prefixo do código dos projetos" className="sm:col-span-2" hint={`Ex.: ${(v.project_code_prefix || 'AIR').toUpperCase()}-${new Date().getFullYear()}-001`}>
            <Input value={v.project_code_prefix} onChange={(e) => setV({ ...v, project_code_prefix: e.target.value })} maxLength={6} />
          </Field>
        </div>
        <div className="mt-6 flex justify-end"><Button variant="primary" onClick={save}>Salvar</Button></div>
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------- Backup
function DataSettings() {
  const { db, refresh } = useData();
  const { mode } = useAuth();
  const toast = useToast();
  const [confirmImport, setConfirmImport] = useState<Record<string, unknown[]> | null>(null);

  const exportAll = () => {
    const payload = { app: 'airos', version: 1, exported_at: nowIso(), data: db };
    downloadFile(`airos-backup-${today()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  };

  const onFile = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      if (json.app !== 'airos' || !json.data) throw new Error('Arquivo de backup inválido.');
      setConfirmImport(json.data);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="grid max-w-4xl gap-5 md:grid-cols-2">
      <Card className="p-5">
        <h3 className="font-display text-base font-semibold">Exportar backup</h3>
        <p className="mt-1 text-sm text-stone-600">Baixa um arquivo JSON com todos os dados do sistema (leads, clientes, projetos, tarefas, horas e configurações).</p>
        <ul className="mt-3 grid grid-cols-2 gap-1 text-xs text-stone-500">
          <li>{db.leads.length} oportunidades</li>
          <li>{db.clients.length} clientes</li>
          <li>{db.projects.length} projetos</li>
          <li>{db.tasks.length} tarefas</li>
          <li>{db.time_entries.length} lançamentos de horas</li>
          <li>{db.profiles.length} membros</li>
        </ul>
        <Button className="mt-4" variant="dark" icon={<Download className="h-4 w-4" />} onClick={exportAll}>Baixar backup</Button>
      </Card>
      <Card className="p-5">
        <h3 className="font-display text-base font-semibold">Restaurar backup</h3>
        {mode === 'local' ? (
          <>
            <p className="mt-1 text-sm text-stone-600">Substitui os dados deste navegador pelos do arquivo. Usuários e senhas não são alterados.</p>
            <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-sm border border-stone-300 bg-surface px-4 py-2 text-sm font-medium hover:bg-stone-50">
              <Upload className="h-4 w-4" /> Selecionar arquivo
              <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
          </>
        ) : (
          <p className="mt-1 text-sm text-stone-600">
            No modo Supabase, os backups completos são feitos pelo próprio Supabase (Database → Backups). Use a exportação ao lado para ter uma cópia em arquivo.
          </p>
        )}
      </Card>
      {confirmImport && (
        <ConfirmDialog
          title="Restaurar backup"
          danger
          confirmLabel="Substituir dados"
          message="Todos os dados atuais deste navegador (exceto usuários) serão substituídos pelos do backup."
          onClose={() => setConfirmImport(null)}
          onConfirm={async () => {
            for (const table of TABLES) {
              if (table === 'profiles') continue;
              localStorage.setItem(`airos:v1:${table}`, JSON.stringify(confirmImport[table] ?? []));
            }
            await refresh();
            toast.success('Backup restaurado.');
          }}
        />
      )}
    </div>
  );
}
