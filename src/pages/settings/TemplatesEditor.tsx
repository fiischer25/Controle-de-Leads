import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Flag, Link2, ListChecks, Plus, Trash2, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { SWATCHES, TASK_PRIORITY, TASK_PRIORITY_ORDER } from '../../lib/constants';
import { businessDaysBetween, scheduleTemplates } from '../../lib/domain';
import type { ProjectType, TaskPriority, TaskTemplate } from '../../lib/types';
import { byPosition, cn, formatDateShort, formatNumber, today, uid } from '../../lib/utils';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { Avatar, Button, Card, Checkbox, ConfirmDialog, Field, IconButton, Input, Modal, Select, Textarea } from '../../components/ui';

/** Cor da etapa pela ordem (como as bolinhas da referência). */
const phaseColor = (i: number) => SWATCHES[i % SWATCHES.length];

/**
 * Tarefas-modelo de um tipo de projeto, em tabela por etapas: nº, duração, início e fim
 * (simulados a partir de uma data), horas estimadas, responsável, prioridade e checklist.
 * Cada tarefa abre um formulário com checklist e observações.
 */
export function TemplatesEditor({ type }: { type: ProjectType }) {
  const { db, maps, insertRows, patch, removeRows } = useData();
  const toast = useToast();
  const wide = useMediaQuery('(min-width: 1024px)');
  const templates = useMemo(() => db.task_templates.filter((t) => t.project_type_id === type.id).sort(byPosition), [db.task_templates, type.id]);
  const phases = useMemo(() => [...new Set(templates.map((t) => t.phase))], [templates]);
  const [simStart, setSimStart] = useState(today());
  const schedule = useMemo(() => new Map(scheduleTemplates(templates, simStart).map((s) => [s.template.id, s])), [templates, simStart]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<{ template?: TaskTemplate; phase?: string } | null>(null);
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const [adding, setAdding] = useState<{ phase: string; title: string; days: string } | null>(null);
  const [newPhase, setNewPhase] = useState<{ name: string; title: string } | null>(null);
  const [deletingPhase, setDeletingPhase] = useState<string | null>(null);

  const all = [...schedule.values()];
  const end = all.reduce((m, s) => (s.due > m ? s.due : m), all[0]?.due ?? simStart);
  const totalDays = all.length ? businessDaysBetween(all[0].start, end) : 0;
  const run = (p: Promise<unknown>) => p.catch(toast.error);

  /** Nova posição no fim de uma etapa (ou no fim da lista, para etapa nova). */
  const positionAtEndOf = (phase: string) => {
    const inPhase = templates.filter((t) => t.phase === phase);
    if (!inPhase.length) return templates.length ? templates[templates.length - 1].position + 1 : 0;
    const last = inPhase[inPhase.length - 1];
    const next = templates[templates.indexOf(last) + 1];
    return next ? (last.position + next.position) / 2 : last.position + 1;
  };

  const quickAdd = async () => {
    if (!adding?.title.trim()) return;
    const tpl: TaskTemplate = {
      id: uid(), project_type_id: type.id, phase: adding.phase, title: adding.title.trim(), description: null,
      duration_days: Math.max(1, Number(adding.days) || 1), position: positionAtEndOf(adding.phase),
    };
    try {
      await insertRows('task_templates', [tpl]);
      setAdding({ ...adding, title: '' });
    } catch (e) {
      toast.error(e);
    }
  };

  const addPhase = async () => {
    if (!newPhase?.name.trim() || !newPhase.title.trim()) return;
    const tpl: TaskTemplate = {
      id: uid(), project_type_id: type.id, phase: newPhase.name.trim(), title: newPhase.title.trim(), description: null,
      duration_days: 1, position: templates.length ? templates[templates.length - 1].position + 1 : 0,
    };
    try {
      await insertRows('task_templates', [tpl]);
      setNewPhase(null);
    } catch (e) {
      toast.error(e);
    }
  };

  const renamePhase = async () => {
    if (!renaming) return;
    const to = renaming.to.trim();
    setRenaming(null);
    if (!to || to === renaming.from) return;
    for (const t of templates.filter((x) => x.phase === renaming.from)) await run(patch('task_templates', t.id, { phase: to }));
  };

  /** Move a etapa inteira, renumerando as posições na nova ordem. */
  const movePhase = async (phase: string, dir: -1 | 1) => {
    const order = [...phases];
    const i = order.indexOf(phase);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    let pos = 0;
    for (const p of order) {
      for (const t of templates.filter((x) => x.phase === p)) {
        if (t.position !== pos) await run(patch('task_templates', t.id, { position: pos }));
        pos++;
      }
    }
  };

  /** Move a tarefa dentro da etapa. */
  const moveTask = async (t: TaskTemplate, dir: -1 | 1) => {
    const inPhase = templates.filter((x) => x.phase === t.phase);
    const other = inPhase[inPhase.indexOf(t) + dir];
    if (!other) return;
    await run(patch('task_templates', t.id, { position: other.position }));
    await run(patch('task_templates', other.id, { position: t.position }));
  };

  const cols = 'grid grid-cols-[44px_minmax(240px,1fr)_64px_80px_64px_64px_72px_150px_92px_92px] items-center gap-x-2';

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-4 px-5 pb-4 pt-5">
        <div>
          <h3 className="font-display text-[15px] font-semibold text-ink">Tarefas-modelo · {type.name}</h3>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {templates.length} tarefas em {phases.length} etapas · {totalDays} dias úteis. Criadas em cada novo projeto deste tipo, com checklist,
            observações e responsável.
          </p>
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-muted">
          Simular datas a partir de
          <Input type="date" value={simStart} onChange={(e) => e.target.value && setSimStart(e.target.value)} className="h-8 w-auto" aria-label="Data de início da simulação" />
        </label>
      </div>

      {wide && (
        <div className={cn(cols, 'border-y border-line/70 bg-stone-50 px-4 py-2 text-[11.5px] font-medium text-stone-500')}>
          <span>Nº</span>
          <span>Etapas / tarefas</span>
          <span className="text-center">Checklist</span>
          <span>Duração</span>
          <span>Início</span>
          <span>Fim</span>
          <span className="text-right">Horas est.</span>
          <span>Responsável</span>
          <span>Prioridade</span>
          <span className="text-right">Ação</span>
        </div>
      )}

      <div className={cn(!wide && 'border-t border-line/70')}>
        {phases.map((phase, pi) => {
          const items = templates.filter((t) => t.phase === phase);
          const sched = items.map((t) => schedule.get(t.id)!).filter(Boolean);
          const pStart = sched.reduce((m, s) => (s.start < m ? s.start : m), sched[0]?.start ?? '');
          const pEnd = sched.reduce((m, s) => (s.due > m ? s.due : m), sched[0]?.due ?? '');
          const hours = items.reduce((a, t) => a + (t.estimated_hours ?? 0), 0);
          const open = !collapsed[phase];
          return (
            <div key={phase} className="border-b border-line/70 last:border-b-0">
              {/* Linha da etapa */}
              <div className={cn(wide ? cols : 'flex items-center gap-2', 'bg-stone-50/70 px-4 py-2.5')}>
                <span className="text-[13px] tabular text-stone-500">{pi + 1}</span>
                <span className={cn('flex min-w-0 items-center gap-2', wide && 'col-span-2')}>
                  <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [phase]: open }))} aria-label={open ? `Recolher ${phase}` : `Expandir ${phase}`} className="text-stone-500 hover:text-ink">
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: phaseColor(pi) }} aria-hidden />
                  {renaming?.from === phase ? (
                    <Input
                      value={renaming.to}
                      onChange={(e) => setRenaming({ from: phase, to: e.target.value })}
                      onBlur={renamePhase}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renamePhase();
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                      className="h-8"
                      autoFocus
                      aria-label="Nome da etapa"
                    />
                  ) : (
                    <button type="button" onClick={() => setRenaming({ from: phase, to: phase })} className="truncate text-left text-[13.5px] font-semibold text-ink hover:underline hover:decoration-stone-300 hover:underline-offset-4" title="Renomear etapa">
                      {phase}
                    </button>
                  )}
                  <IconButton label={`Adicionar tarefa em ${phase}`} size="xs" onClick={() => setAdding({ phase, title: '', days: '2' })}>
                    <Plus className="h-3.5 w-3.5" />
                  </IconButton>
                  <span className="shrink-0 text-[12px] text-stone-500">
                    {items.length} {items.length === 1 ? 'tarefa' : 'tarefas'}
                  </span>
                </span>
                {wide && (
                  <>
                    <span className="text-[12.5px] tabular text-stone-600">{pStart ? `${businessDaysBetween(pStart, pEnd)} dias` : ''}</span>
                    <span className="text-[12.5px] tabular text-stone-600">{pStart && formatDateShort(pStart)}</span>
                    <span className="text-[12.5px] tabular text-stone-600">{pEnd && formatDateShort(pEnd)}</span>
                    <span className="text-right text-[12.5px] tabular text-stone-600">{hours ? `${formatNumber(hours, 1)}h` : ''}</span>
                    <span />
                    <span />
                  </>
                )}
                <span className={cn('flex justify-end', !wide && 'ml-auto')}>
                  <IconButton label={`Subir etapa ${phase}`} size="xs" onClick={() => movePhase(phase, -1)} disabled={pi === 0}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton label={`Descer etapa ${phase}`} size="xs" onClick={() => movePhase(phase, 1)} disabled={pi === phases.length - 1}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton label={`Excluir etapa ${phase}`} size="xs" onClick={() => setDeletingPhase(phase)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </span>
              </div>

              {/* Tarefas da etapa */}
              {open &&
                items.map((t, ti) => {
                  const s = schedule.get(t.id);
                  const person = t.assignee_id ? maps.profiles[t.assignee_id] : null;
                  const pr = TASK_PRIORITY[t.priority ?? 'media'];
                  const checklist = t.checklist ?? [];
                  return (
                    <div key={t.id} className={cn(wide ? cols : 'grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2', 'group border-t border-line/50 px-4 py-2 hover:bg-stone-50/60')}>
                      <span className="text-[12.5px] tabular text-stone-500">
                        {pi + 1}.{ti + 1}
                      </span>
                      <button type="button" onClick={() => setEditing({ template: t })} className="min-w-0 pl-6 text-left">
                        <span className="block truncate text-[13.5px] text-ink group-hover:underline group-hover:decoration-stone-300 group-hover:underline-offset-4">{t.title}</span>
                        {!wide && (
                          <span className="block truncate text-[12px] text-stone-500">
                            {t.duration_days} {t.duration_days === 1 ? 'dia' : 'dias'}
                            {s && ` · ${formatDateShort(s.start)} → ${formatDateShort(s.due)}`}
                            {checklist.length > 0 && ` · checklist ${checklist.length}`}
                            {person && ` · ${person.name.split(' ')[0]}`}
                          </span>
                        )}
                        {t.description && wide && <span className="block truncate text-[12px] text-stone-400">{t.description}</span>}
                      </button>
                      {wide && (
                        <>
                          <span className={cn('flex items-center justify-center gap-1 text-[12.5px] tabular', checklist.length ? 'text-stone-600' : 'text-stone-300')} title={checklist.join('\n')}>
                            <ListChecks className="h-3.5 w-3.5" />
                            {checklist.length}
                          </span>
                          <span className="flex items-center gap-1 text-[12.5px] tabular text-stone-700">
                            {t.duration_days} {t.duration_days === 1 ? 'dia' : 'dias'}
                            {t.start_with_previous && <Link2 className="h-3 w-3 text-stone-400" aria-label="Começa junto com a anterior" />}
                          </span>
                          <span className="text-[12.5px] tabular text-stone-600">{s && formatDateShort(s.start)}</span>
                          <span className="text-[12.5px] tabular text-stone-600">{s && formatDateShort(s.due)}</span>
                          <span className="text-right text-[12.5px] tabular text-stone-600">{t.estimated_hours ? `${formatNumber(t.estimated_hours, 1)}h` : '—'}</span>
                          <span className="flex min-w-0 items-center gap-1.5 text-[12.5px]">
                            {person ? (
                              <>
                                <Avatar user={person} size="xs" />
                                <span className="truncate text-stone-700">{person.name.split(' ')[0]}</span>
                              </>
                            ) : (
                              <span className="truncate text-stone-400">Resp. do projeto</span>
                            )}
                          </span>
                          <span className={cn('flex items-center gap-1 text-[12.5px]', pr.className)}>
                            <Flag className="h-3.5 w-3.5" />
                            {pr.label}
                          </span>
                        </>
                      )}
                      <span className="flex justify-end opacity-50 group-hover:opacity-100">
                        <IconButton label={`Subir ${t.title}`} size="xs" onClick={() => moveTask(t, -1)} disabled={ti === 0}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton label={`Descer ${t.title}`} size="xs" onClick={() => moveTask(t, 1)} disabled={ti === items.length - 1}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton label={`Remover ${t.title}`} size="xs" onClick={() => run(removeRows('task_templates', [t.id]))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconButton>
                      </span>
                    </div>
                  );
                })}

              {open && adding?.phase === phase && (
                <form
                  className="flex flex-wrap items-center gap-2 border-t border-line/50 bg-surface px-4 py-2 lg:pl-[60px]"
                  onSubmit={(e) => {
                    e.preventDefault();
                    quickAdd();
                  }}
                >
                  <Input value={adding.title} onChange={(e) => setAdding({ ...adding, title: e.target.value })} placeholder={`Nova tarefa em ${phase}`} className="h-8 min-w-0 flex-1" autoFocus aria-label="Título da nova tarefa" />
                  <Input type="number" min={1} value={adding.days} onChange={(e) => setAdding({ ...adding, days: e.target.value })} className="h-8 w-20" aria-label="Duração em dias" title="Duração em dias úteis" />
                  <span className="text-[12.5px] text-stone-500">dias</span>
                  <Button type="submit" size="sm" variant="primary" disabled={!adding.title.trim()}>
                    Adicionar
                  </Button>
                  <IconButton label="Fechar" size="xs" onClick={() => setAdding(null)}>
                    <X className="h-3.5 w-3.5" />
                  </IconButton>
                </form>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-line bg-stone-50/60 px-4 py-3">
        {newPhase ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addPhase();
            }}
          >
            <Input value={newPhase.name} onChange={(e) => setNewPhase({ ...newPhase, name: e.target.value })} placeholder="Nome da etapa (ex.: PL - Projeto Legal)" className="h-9 w-64" autoFocus aria-label="Nome da nova etapa" />
            <Input value={newPhase.title} onChange={(e) => setNewPhase({ ...newPhase, title: e.target.value })} placeholder="Primeira tarefa da etapa" className="h-9 min-w-0 flex-1" aria-label="Primeira tarefa da etapa" />
            <Button type="submit" variant="primary" size="sm" disabled={!newPhase.name.trim() || !newPhase.title.trim()}>
              Criar etapa
            </Button>
            <Button size="sm" onClick={() => setNewPhase(null)}>
              Cancelar
            </Button>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setNewPhase({ name: '', title: '' })}>
              Nova etapa
            </Button>
            {phases.length > 0 && (
              <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing({ phase: phases[phases.length - 1] })}>
                Nova tarefa completa
              </Button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <TemplateTaskModal
          key={editing.template?.id ?? 'new'}
          type={type}
          template={editing.template}
          phases={phases}
          defaultPhase={editing.phase}
          positionFor={positionAtEndOf}
          onClose={() => setEditing(null)}
        />
      )}
      {deletingPhase && (
        <ConfirmDialog
          title="Excluir etapa?"
          danger
          confirmLabel="Excluir"
          message={
            <>
              Excluir a etapa <b>{deletingPhase}</b> e suas {templates.filter((t) => t.phase === deletingPhase).length} tarefas-modelo? Projetos já criados não mudam.
            </>
          }
          onConfirm={async () => {
            await run(removeRows('task_templates', templates.filter((t) => t.phase === deletingPhase).map((t) => t.id)));
          }}
          onClose={() => setDeletingPhase(null)}
        />
      )}
    </Card>
  );
}

/** Formulário da tarefa-modelo: dados, responsável, prioridade, observações e checklist. */
function TemplateTaskModal({
  type,
  template,
  phases,
  defaultPhase,
  positionFor,
  onClose,
}: {
  type: ProjectType;
  template?: TaskTemplate;
  phases: string[];
  defaultPhase?: string;
  positionFor: (phase: string) => number;
  onClose: () => void;
}) {
  const { db, insertRows, patch, removeRows } = useData();
  const toast = useToast();
  const [v, setV] = useState({
    title: template?.title ?? '',
    phase: template?.phase ?? defaultPhase ?? phases[0] ?? '',
    duration_days: template?.duration_days ?? 2,
    start_with_previous: template?.start_with_previous ?? false,
    assignee_id: template?.assignee_id ?? '',
    priority: (template?.priority ?? 'media') as TaskPriority,
    estimated_hours: template?.estimated_hours ?? null,
    description: template?.description ?? '',
  });
  const [items, setItems] = useState<string[]>(template?.checklist ?? []);
  const [newItem, setNewItem] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const people = db.profiles.filter((p) => p.active || p.id === v.assignee_id).sort((a, b) => a.name.localeCompare(b.name));

  const addItems = (text: string) => {
    // Colar uma lista (uma linha por item) adiciona todos de uma vez
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*[-•*\d.)]+\s*/, '').trim())
      .filter(Boolean);
    if (lines.length) setItems((xs) => [...xs, ...lines]);
    setNewItem('');
  };
  const moveItem = (i: number, dir: -1 | 1) =>
    setItems((xs) => {
      const j = i + dir;
      if (j < 0 || j >= xs.length) return xs;
      const next = [...xs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = async () => {
    const e: Record<string, string> = {};
    if (!v.title.trim()) e.title = 'Dê um nome à tarefa.';
    if (!v.phase.trim()) e.phase = 'Informe a etapa.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const pending = newItem.trim() ? [...items, newItem.trim()] : items;
    const data: Partial<TaskTemplate> = {
      title: v.title.trim(),
      phase: v.phase.trim(),
      duration_days: Math.max(1, Math.round(Number(v.duration_days) || 1)),
      start_with_previous: v.start_with_previous,
      assignee_id: v.assignee_id || null,
      priority: v.priority,
      estimated_hours: v.estimated_hours != null && v.estimated_hours > 0 ? v.estimated_hours : null,
      description: v.description.trim() || null,
      checklist: pending.map((x) => x.trim()).filter(Boolean),
    };
    try {
      if (template) {
        await patch('task_templates', template.id, { ...data, ...(data.phase !== template.phase ? { position: positionFor(data.phase!) } : {}) });
      } else {
        await insertRows('task_templates', [{ id: uid(), project_type_id: type.id, position: positionFor(data.phase!), ...data } as TaskTemplate]);
      }
      toast.success('Tarefa-modelo salva.');
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={template ? 'Tarefa-modelo' : 'Nova tarefa-modelo'}
      subtitle={type.name}
      onClose={onClose}
      size="lg"
      footer={
        <>
          {template && (
            <Button
              variant="ghost"
              className="mr-auto text-danger-fg"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => removeRows('task_templates', [template.id]).then(onClose).catch(toast.error)}
            >
              Excluir
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tarefa" required error={errors.title} className="sm:col-span-2">
          <Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="Ex.: Coleta de documentos" autoFocus={!template} />
        </Field>
        <Field label="Etapa" required error={errors.phase}>
          <Input list="tpl-phase-list" value={v.phase} onChange={(e) => setV({ ...v, phase: e.target.value })} placeholder="Ex.: LD - Levantamento de Dados" />
          <datalist id="tpl-phase-list">
            {phases.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field label="Duração (dias úteis)">
          <Input type="number" min={1} value={v.duration_days} onChange={(e) => setV({ ...v, duration_days: Number(e.target.value) })} />
        </Field>
        <Checkbox
          className="sm:col-span-2"
          checked={v.start_with_previous}
          onChange={(on) => setV({ ...v, start_with_previous: on })}
          label="Começa junto com a tarefa anterior (em paralelo), em vez de depois dela"
        />
        <Field label="Quem fica à frente" hint="Sem pessoa definida, fica com o responsável escolhido ao criar o projeto.">
          <Select value={v.assignee_id} onChange={(e) => setV({ ...v, assignee_id: e.target.value })} aria-label="Responsável">
            <option value="">Responsável do projeto</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Prioridade">
            <Select value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value as TaskPriority })} aria-label="Prioridade">
              {TASK_PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>
                  {TASK_PRIORITY[p].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Horas estimadas">
            <Input
              type="number"
              min={0}
              step="0.5"
              value={v.estimated_hours ?? ''}
              onChange={(e) => setV({ ...v, estimated_hours: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <div className="label">Checklist ({items.length})</div>
          {items.length > 0 && (
            <ul className="mb-2 divide-y divide-hairline rounded-[10px] border border-hairline">
              {items.map((item, i) => (
                <li key={i} className="flex items-center gap-2 px-2 py-1">
                  <span className="h-3.5 w-3.5 shrink-0 rounded-[4px] border border-line-strong" aria-hidden />
                  <input
                    value={item}
                    onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
                    className="min-w-0 flex-1 rounded-xs bg-transparent px-1.5 py-1 text-[13.5px] text-ink outline-none focus:bg-canvas"
                    aria-label={`Item ${i + 1} do checklist`}
                  />
                  <IconButton label={`Subir item ${i + 1}`} size="xs" onClick={() => moveItem(i, -1)} disabled={i === 0}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton label={`Descer item ${i + 1}`} size="xs" onClick={() => moveItem(i, 1)} disabled={i === items.length - 1}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton label={`Remover item ${i + 1}`} size="xs" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
                    <X className="h-3.5 w-3.5" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addItems(newItem);
                }
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                if (text.includes('\n')) {
                  e.preventDefault();
                  addItems(text);
                }
              }}
              placeholder="Novo item (Enter para adicionar; cole uma lista para adicionar vários)"
              aria-label="Novo item do checklist"
            />
            <Button variant="ghost" onClick={() => addItems(newItem)} disabled={!newItem.trim()}>
              Adicionar
            </Button>
          </div>
        </div>

        <Field label="Observações" className="sm:col-span-2" hint="Orientações para quem for executar; aparecem dentro da tarefa em cada projeto.">
          <Textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} rows={3} />
        </Field>
      </div>
    </Modal>
  );
}
