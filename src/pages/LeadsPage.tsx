import { useMemo, useState, type DragEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CalendarClock,
  Columns3,
  Download,
  Filter,
  List,
  MapPin,
  Plus,
  Ruler,
  Search,
  Target,
  TrendingUp,
  UserCheck,
  Wallet,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import type { Lead } from '../lib/types';
import {
  byPosition,
  cn,
  diffDays,
  downloadFile,
  formatCurrency,
  formatDate,
  formatDateShort,
  formatNumber,
  matches,
  sum,
  toCsv,
  toDateKey,
  today,
} from '../lib/utils';
import { Avatar, Badge, Button, ColorDot, EmptyState, Input, PageHeader, Segmented, Select } from '../components/ui';
import { LeadDrawer, LostReasonModal } from '../components/leads/LeadDrawer';
import { LeadFormModal } from '../components/leads/LeadFormModal';
import { ConvertLeadModal } from '../components/leads/ConvertLeadModal';

type View = 'kanban' | 'list';

export default function LeadsPage() {
  const { db, maps, moveLead, settings } = useData();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>(() => (localStorage.getItem('airos:leadsView') as View) || 'kanban');
  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState('');
  const [source, setSource] = useState('');
  const [type, setType] = useState('');
  const [period, setPeriod] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ stage: string; before: string | null } | null>(null);
  const [pendingLost, setPendingLost] = useState<{ id: string; stage: string; before: string | null } | null>(null);
  const [converting, setConverting] = useState<Lead | null>(null);

  const openLeadId = params.get('lead');
  const stages = useMemo(() => [...db.lead_stages].sort(byPosition), [db.lead_stages]);

  const filtered = useMemo(() => {
    const t = today();
    return db.leads.filter((l) => {
      if (owner && l.owner_id !== owner) return false;
      if (source && l.source_id !== source) return false;
      if (type && l.project_type_id !== type) return false;
      if (period && diffDays(toDateKey(new Date(l.created_at)), t) > Number(period)) return false;
      return matches(query, l.name, l.city, l.phone, l.email, l.notes);
    });
  }, [db.leads, owner, source, type, period, query]);

  const byStage = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const s of stages) map[s.id] = [];
    for (const l of filtered) (map[l.stage_id] ||= []).push(l);
    for (const k of Object.keys(map)) map[k].sort(byPosition);
    return map;
  }, [filtered, stages]);

  const stats = useMemo(() => {
    const kind = (l: Lead) => maps.stages[l.stage_id]?.kind;
    const open = filtered.filter((l) => kind(l) === 'open');
    const won = filtered.filter((l) => kind(l) === 'won');
    const lost = filtered.filter((l) => kind(l) === 'lost');
    const decided = won.length + lost.length;
    const t = today();
    return {
      open: open.length,
      pipeline: sum(open.map((l) => l.proposal_value ?? 0)),
      conversion: decided ? Math.round((won.length / decided) * 100) : 0,
      won: won.length,
      toConvert: won.filter((l) => !l.client_id).length,
      followUps: open.filter((l) => l.next_contact_date && l.next_contact_date <= t).length,
    };
  }, [filtered, maps.stages]);

  const openLead = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('lead', id);
    else next.delete('lead');
    setParams(next, { replace: true });
  };

  const performMove = async (id: string, stageId: string, before: string | null) => {
    const lead = maps.leads[id];
    const target = maps.stages[stageId];
    if (lead && target?.kind === 'lost' && lead.stage_id !== stageId) {
      setPendingLost({ id, stage: stageId, before });
      return;
    }
    try {
      await moveLead(id, stageId, before);
      if (lead && target?.kind === 'won' && lead.stage_id !== stageId && !lead.client_id) {
        toast.success(`${lead.name} fechou! Complete os dados para virar cliente.`);
      }
    } catch (e) {
      toast.error(e);
    }
  };

  const onDrop = (e: DragEvent, stageId: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || dragId;
    const before = dropTarget?.stage === stageId ? dropTarget.before : null;
    setDragId(null);
    setDropTarget(null);
    if (id && before !== id) performMove(id, stageId, before);
  };

  const exportCsv = () => {
    const rows = filtered.map((l) => ({
      Nome: l.name,
      Telefone: l.phone,
      Email: l.email ?? '',
      Cidade: l.city,
      UF: l.state ?? '',
      'Tipo de projeto': l.project_type_id ? maps.types[l.project_type_id]?.name : '',
      Categoria: l.category ?? '',
      'Área (m²)': l.area_m2 ?? '',
      Origem: l.source_id ? maps.sources[l.source_id]?.name : '',
      'Indicado por': l.referred_by ?? '',
      'Valor da proposta': l.proposal_value ?? '',
      Etapa: maps.stages[l.stage_id]?.name,
      Responsável: l.owner_id ? maps.profiles[l.owner_id]?.name : '',
      'Próximo contato': formatDate(l.next_contact_date),
      'Motivo da perda': l.lost_reason ?? '',
      Cadastro: formatDate(toDateKey(new Date(l.created_at))),
    }));
    downloadFile(`oportunidades-${today()}.csv`, toCsv(rows), 'text/csv');
  };

  const activeFilters = [owner, source, type, period].filter(Boolean).length;

  return (
    <div className="flex flex-col">
      <PageHeader
        eyebrow="Comercial"
        title="Oportunidades"
        description="Arraste os cards entre as etapas conforme as conversas avançam."
        actions={
          <>
            <Segmented<View>
              value={view}
              onChange={(v) => {
                setView(v);
                localStorage.setItem('airos:leadsView', v);
              }}
              options={[
                { id: 'kanban', label: 'Kanban', icon: <Columns3 className="h-4 w-4" /> },
                { id: 'list', label: 'Lista', icon: <List className="h-4 w-4" /> },
              ]}
            />
            <Button icon={<Download className="h-4 w-4" />} onClick={exportCsv}>Exportar</Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreatingIn(stages.find((s) => s.kind === 'open')?.id ?? '')}>
              Nova oportunidade
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat icon={<Target className="h-4 w-4" />} label="Em negociação" value={stats.open} />
        <Stat icon={<Wallet className="h-4 w-4" />} label="Valor em propostas abertas" value={formatCurrency(stats.pipeline)} />
        <Stat icon={<TrendingUp className="h-4 w-4" />} label="Taxa de conversão" value={`${stats.conversion}%`} hint="fechados ÷ (fechados + perdidos)" />
        <Stat icon={<UserCheck className="h-4 w-4" />} label="Fechados aguardando cadastro" value={stats.toConvert} tone={stats.toConvert ? 'good' : undefined} />
        <Stat icon={<CalendarClock className="h-4 w-4" />} label="Retornos para hoje/atrasados" value={stats.followUps} tone={stats.followUps ? 'warn' : undefined} />
      </div>

      <div className="card mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome, cidade, telefone…" className="pl-9" />
          </div>
          <Button icon={<Filter className="h-4 w-4" />} onClick={() => setShowFilters((s) => !s)} variant={activeFilters ? 'dark' : 'secondary'}>
            Filtros{activeFilters ? ` (${activeFilters})` : ''}
          </Button>
        </div>
        {showFilters && (
          <div className="mt-3 grid gap-2 border-t border-line/70 pt-3 sm:grid-cols-2 lg:grid-cols-5">
            <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Todos os responsáveis</option>
              {db.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Todas as origens</option>
              {[...db.lead_sources].sort(byPosition).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Todos os tipos</option>
              {[...db.project_types].sort(byPosition).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="">Qualquer data de entrada</option>
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
              <option value="365">Últimos 12 meses</option>
            </Select>
            <Button variant="ghost" onClick={() => { setOwner(''); setSource(''); setType(''); setPeriod(''); }}>Limpar filtros</Button>
          </div>
        )}
      </div>

      {view === 'kanban' ? (
        <div className="scrollbar-thin -mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex gap-3">
            {stages.map((stage) => {
              const items = byStage[stage.id] ?? [];
              const total = sum(items.map((l) => l.proposal_value ?? 0));
              const isTarget = dropTarget?.stage === stage.id && dragId;
              return (
                <section
                  key={stage.id}
                  className={cn(
                    'flex w-[290px] shrink-0 flex-col rounded-2xl border bg-stone-100/50 transition-colors',
                    isTarget ? 'border-brand-300 bg-brand-50/60' : 'border-transparent',
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dropTarget?.stage !== stage.id || dropTarget.before !== null) {
                      if (!(e.target as HTMLElement).closest('[data-lead-card]')) setDropTarget({ stage: stage.id, before: null });
                    }
                  }}
                  onDrop={(e) => onDrop(e, stage.id)}
                >
                  <header className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <ColorDot color={stage.color} />
                      <h3 className="truncate text-sm font-semibold text-stone-800">{stage.name}</h3>
                      <span className="rounded-full bg-white px-1.5 text-xs font-medium text-stone-500 tabular">{items.length}</span>
                    </div>
                    <button
                      onClick={() => setCreatingIn(stage.id)}
                      className="rounded-md p-1 text-stone-400 hover:bg-white hover:text-stone-700"
                      aria-label={`Adicionar em ${stage.name}`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </header>
                  {total > 0 && <div className="-mt-1 px-3 pb-2 text-xs text-stone-500 tabular">{formatCurrency(total)}</div>}
                  <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto px-2 pb-3" style={{ minHeight: 160, maxHeight: 'max(320px, calc(100vh - 430px))' }}>
                    {items.map((lead) => (
                      <div key={lead.id}>
                        {dropTarget?.stage === stage.id && dropTarget.before === lead.id && dragId !== lead.id && (
                          <div className="mb-2 h-1 rounded-full bg-brand-400" />
                        )}
                        <LeadCard
                          lead={lead}
                          dragging={dragId === lead.id}
                          staleDays={settings.lead_stale_days}
                          onOpen={() => openLead(lead.id)}
                          onConvert={() => setConverting(lead)}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', lead.id);
                            e.dataTransfer.effectAllowed = 'move';
                            setDragId(lead.id);
                          }}
                          onDragEnd={() => {
                            setDragId(null);
                            setDropTarget(null);
                          }}
                          onDragOverCard={(e) => {
                            e.preventDefault();
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            const after = e.clientY > rect.top + rect.height / 2;
                            const idx = items.findIndex((x) => x.id === lead.id);
                            const before = after ? items[idx + 1]?.id ?? null : lead.id;
                            if (dropTarget?.stage !== stage.id || dropTarget.before !== before) setDropTarget({ stage: stage.id, before });
                          }}
                        />
                      </div>
                    ))}
                    {dropTarget?.stage === stage.id && dropTarget.before === null && dragId && <div className="h-1 rounded-full bg-brand-400" />}
                    {items.length === 0 && !dragId && (
                      <p className="px-2 py-6 text-center text-xs text-stone-400">Nenhuma oportunidade</p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <LeadList leads={filtered} onOpen={openLead} />
      )}

      {creatingIn !== null && <LeadFormModal defaultStageId={creatingIn} onClose={() => setCreatingIn(null)} />}
      {openLeadId && <LeadDrawer leadId={openLeadId} onClose={() => openLead(null)} />}
      {converting && <ConvertLeadModal lead={converting} onClose={() => setConverting(null)} />}
      {pendingLost && (
        <LostReasonModal
          onClose={() => setPendingLost(null)}
          onConfirm={async (reason) => {
            await moveLead(pendingLost.id, pendingLost.stage, pendingLost.before, { lost_reason: reason });
          }}
        />
      )}
    </div>
  );
}

function Stat({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string; tone?: 'good' | 'warn' }) {
  return (
    <div className="card px-4 py-3" title={hint}>
      <div className="flex items-center gap-2 text-xs text-stone-500">
        <span className="text-stone-300">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className={cn('mt-1 font-display text-xl font-medium tracking-tight', tone === 'warn' ? 'text-amber-700' : 'text-ink-900')}>{value}</div>
    </div>
  );
}

function LeadCard({
  lead,
  dragging,
  staleDays,
  onOpen,
  onConvert,
  onDragStart,
  onDragEnd,
  onDragOverCard,
}: {
  lead: Lead;
  dragging: boolean;
  staleDays: number;
  onOpen: () => void;
  onConvert: () => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onDragOverCard: (e: DragEvent) => void;
}) {
  const { maps } = useData();
  const stage = maps.stages[lead.stage_id];
  const owner = lead.owner_id ? maps.profiles[lead.owner_id] : null;
  const type = lead.project_type_id ? maps.types[lead.project_type_id] : null;
  const src = lead.source_id ? maps.sources[lead.source_id] : null;
  const t = today();
  const daysInStage = diffDays(toDateKey(new Date(lead.stage_changed_at)), t);
  const followLate = stage?.kind === 'open' && lead.next_contact_date && lead.next_contact_date <= t;
  const stale = stage?.kind === 'open' && daysInStage >= staleDays;

  return (
    <article
      data-lead-card
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOverCard}
      onClick={onOpen}
      className={cn(
        'group cursor-pointer rounded-xl border border-line bg-white p-3 shadow-card transition-all hover:border-stone-300 hover:shadow-md',
        dragging && 'rotate-1 opacity-40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold leading-snug text-ink-900">{lead.name}</h4>
        <Avatar user={owner} size="sm" />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
        <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{lead.city}</span>
        {lead.area_m2 ? <span className="inline-flex items-center gap-1"><Ruler className="h-3 w-3" />{formatNumber(lead.area_m2)} m²</span> : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {type && (
          <span className="rounded-md px-1.5 py-0.5 text-[11px] font-medium" style={{ backgroundColor: `${type.color}14`, color: type.color }}>
            {type.name}
          </span>
        )}
        {src && <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600">{src.name}</span>}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line/70 pt-2">
        <span className="text-sm font-semibold text-stone-800 tabular">{lead.proposal_value ? formatCurrency(lead.proposal_value) : <span className="font-normal text-stone-400">Sem proposta</span>}</span>
        <span className={cn('text-[11px]', stale ? 'font-medium text-amber-700' : 'text-stone-400')} title="Dias nesta etapa">
          {daysInStage}d
        </span>
      </div>
      {followLate && (
        <div className="mt-2 flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
          <CalendarClock className="h-3 w-3" /> Retorno {lead.next_contact_date === t ? 'hoje' : `desde ${formatDateShort(lead.next_contact_date)}`}
        </div>
      )}
      {stage?.kind === 'won' &&
        (lead.client_id ? (
          <Badge className="mt-2 bg-emerald-50 text-emerald-800 ring-emerald-200"><UserCheck className="h-3 w-3" /> Cliente</Badge>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onConvert();
            }}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            <UserCheck className="h-3.5 w-3.5" /> Virar cliente
          </button>
        ))}
      {stage?.kind === 'lost' && lead.lost_reason && <p className="mt-2 truncate text-[11px] text-rose-600">{lead.lost_reason}</p>}
    </article>
  );
}

function LeadList({ leads, onOpen }: { leads: Lead[]; onOpen: (id: string) => void }) {
  const { maps } = useData();
  const [sortKey, setSortKey] = useState<'created' | 'name' | 'value'>('created');
  const sorted = useMemo(() => {
    const out = [...leads];
    if (sortKey === 'name') out.sort((a, b) => a.name.localeCompare(b.name));
    if (sortKey === 'value') out.sort((a, b) => (b.proposal_value ?? 0) - (a.proposal_value ?? 0));
    if (sortKey === 'created') out.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return out;
  }, [leads, sortKey]);

  if (leads.length === 0) return <div className="card"><EmptyState title="Nenhuma oportunidade encontrada" description="Ajuste os filtros ou cadastre uma nova oportunidade." /></div>;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-end gap-2 border-b border-line/70 px-4 py-2 text-xs text-stone-500">
        Ordenar por
        <Select value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)} className="h-8 w-auto py-1 text-xs">
          <option value="created">Mais recentes</option>
          <option value="name">Nome</option>
          <option value="value">Valor da proposta</option>
        </Select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-[11px] uppercase tracking-[0.08em] text-stone-400">
            <tr>
              <th className="px-4 py-2.5 font-medium">Lead</th>
              <th className="px-4 py-2.5 font-medium">Etapa</th>
              <th className="px-4 py-2.5 font-medium">Tipo</th>
              <th className="px-4 py-2.5 font-medium">Origem</th>
              <th className="px-4 py-2.5 text-right font-medium">m²</th>
              <th className="px-4 py-2.5 text-right font-medium">Proposta</th>
              <th className="px-4 py-2.5 font-medium">Retorno</th>
              <th className="px-4 py-2.5 font-medium">Resp.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {sorted.map((l) => {
              const stage = maps.stages[l.stage_id];
              return (
                <tr key={l.id} className="cursor-pointer hover:bg-stone-50" onClick={() => onOpen(l.id)}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink-900">{l.name}</div>
                    <div className="text-xs text-stone-500">{l.city} · {l.phone}</div>
                  </td>
                  <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 whitespace-nowrap"><ColorDot color={stage?.color ?? '#999'} />{stage?.name}</span></td>
                  <td className="px-4 py-3 text-stone-600">{l.project_type_id ? maps.types[l.project_type_id]?.name : '—'}</td>
                  <td className="px-4 py-3 text-stone-600">{l.source_id ? maps.sources[l.source_id]?.name : '—'}</td>
                  <td className="px-4 py-3 text-right tabular text-stone-600">{l.area_m2 ? formatNumber(l.area_m2) : '—'}</td>
                  <td className="px-4 py-3 text-right tabular font-medium">{formatCurrency(l.proposal_value)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-stone-600">{formatDate(l.next_contact_date)}</td>
                  <td className="px-4 py-3"><Avatar user={l.owner_id ? maps.profiles[l.owner_id] : null} size="sm" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
