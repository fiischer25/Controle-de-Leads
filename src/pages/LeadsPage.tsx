import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Check, Download, Plus, Trophy, XCircle } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { funnelOrder, stageColor } from '../lib/status';
import { useMediaQuery } from '../lib/useMediaQuery';
import type { Lead, LeadStage } from '../lib/types';
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
import { ActionLink, Avatar, Button, EmptyState, FilterPick, IconButton, SearchField, Tabs } from '../components/ui';
import { LeadDrawer, LostReasonModal } from '../components/leads/LeadDrawer';
import { LeadFormModal } from '../components/leads/LeadFormModal';
import { ConvertLeadModal } from '../components/leads/ConvertLeadModal';
import { WonDealModal } from '../components/leads/WonDealModal';

type View = 'kanban' | 'list';

function readView(): View {
  try {
    return localStorage.getItem('airos:leadsView') === 'list' ? 'list' : 'kanban';
  } catch {
    return 'kanban';
  }
}

export default function LeadsPage() {
  const { db, maps, moveLead, settings, closeDeal } = useData();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>(readView);
  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState('');
  const [source, setSource] = useState('');
  const [type, setType] = useState('');
  const [period, setPeriod] = useState('');
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ stage: string; before: string | null } | null>(null);
  const [pendingLost, setPendingLost] = useState<{ id: string; stage: string; before: string | null } | null>(null);
  const [pendingWon, setPendingWon] = useState<{ id: string; stage: string; before: string | null } | null>(null);
  const [converting, setConverting] = useState<Lead | null>(null);
  const [mobileStage, setMobileStage] = useState<string | null>(null);
  const desktop = useMediaQuery('(min-width: 768px)');

  const openLeadId = params.get('lead');
  const stages = useMemo(() => funnelOrder(db.lead_stages), [db.lead_stages]);
  const t = today();

  const filtered = useMemo(() => {
    return db.leads.filter((l) => {
      if (owner && l.owner_id !== owner) return false;
      if (source && l.source_id !== source) return false;
      if (type && l.project_type_id !== type) return false;
      if (period && diffDays(toDateKey(new Date(l.created_at)), t) > Number(period)) return false;
      return matches(query, l.name, l.city, l.phone, l.email, l.notes);
    });
  }, [db.leads, owner, source, type, period, query, t]);

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
    return {
      open: open.length,
      pipeline: sum(open.map((l) => l.proposal_value ?? 0)),
      conversion: decided ? Math.round((won.length / decided) * 100) : null,
      toConvert: won.filter((l) => !l.client_id).length,
      overdue: open.filter((l) => l.next_contact_date && l.next_contact_date < t).length,
      dueToday: open.filter((l) => l.next_contact_date === t).length,
    };
  }, [filtered, maps.stages, t]);

  const openLead = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('lead', id);
    else next.delete('lead');
    setParams(next, { replace: true });
  };

  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem('airos:leadsView', v);
    } catch {
      /* navegação privada */
    }
  };

  const performMove = async (id: string, stageId: string, before: string | null) => {
    const lead = maps.leads[id];
    const target = maps.stages[stageId];
    if (lead && target?.kind === 'lost' && lead.stage_id !== stageId) {
      setPendingLost({ id, stage: stageId, before });
      return;
    }
    // Ganho: abre o fechamento (valor e forma de pagamento → Financeiro)
    if (lead && target?.kind === 'won' && lead.stage_id !== stageId) {
      setPendingWon({ id, stage: stageId, before });
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
    downloadFile(`oportunidades-${t}.csv`, toCsv(rows), 'text/csv');
  };

  const activeFilters = [owner, source, type, period].filter(Boolean).length;
  const clearFilters = () => {
    setOwner('');
    setSource('');
    setType('');
    setPeriod('');
    setQuery('');
  };
  const firstOpen = stages.find((s) => s.kind === 'open')?.id ?? '';
  const wonStage = stages.find((s) => s.kind === 'won');
  const lostStage = stages.find((s) => s.kind === 'lost');
  const currentMobile = mobileStage && byStage[mobileStage] ? mobileStage : firstOpen || stages[0]?.id;
  const pendingReturns = stats.overdue + stats.dueToday;

  return (
    <div className="flex flex-col pt-2 md:pt-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-[30px] font-medium leading-9 tracking-[-0.03em] text-ink md:text-hero">Oportunidades</h1>
          <p className="mt-2 text-[14.5px] leading-[21px] text-muted md:text-body-lg">
            {stats.open} em negociação · {formatCurrency(stats.pipeline)} em propostas
            {stats.conversion !== null && <> · {stats.conversion}% de conversão</>}
            {pendingReturns > 0 && (
              <>
                {' · '}
                <span className={stats.overdue ? 'text-danger-fg' : 'text-warning-fg'}>
                  {pendingReturns} {pendingReturns === 1 ? 'retorno pendente' : 'retornos pendentes'}
                </span>
              </>
            )}
            {stats.toConvert > 0 && (
              <>
                {' · '}
                <span className="text-accent-fg">{stats.toConvert} aguardando cadastro</span>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" icon={<Download className="h-4 w-4" strokeWidth={1.6} />} onClick={exportCsv} className="max-sm:hidden">
            Exportar
          </Button>
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" strokeWidth={1.6} />}
            onClick={() => setCreatingIn(firstOpen)}
            className="max-sm:hidden"
          >
            Oportunidade
          </Button>
        </div>
      </div>

      {/* Busca, filtros e visualização */}
      <div className="mt-8 flex flex-col gap-3 md:mt-12 lg:flex-row lg:items-center">
        <SearchField value={query} onChange={setQuery} placeholder="Buscar nome, cidade, telefone…" label="Buscar oportunidades" className="lg:w-72" />
        <div className="scrollbar-none -mx-5 flex items-center gap-1 overflow-x-auto px-5 md:mx-0 md:px-0 lg:flex-1">
          <FilterPick
            label="Responsável"
            value={owner}
            onChange={setOwner}
            options={db.profiles
              .filter((p) => p.active || p.id === owner)
              .map((p) => ({ value: p.id, label: p.name, icon: <Avatar user={p} size="xs" /> }))}
          />
          <FilterPick
            label="Origem"
            value={source}
            onChange={setSource}
            options={[...db.lead_sources].sort(byPosition).map((s) => ({ value: s.id, label: s.name }))}
          />
          <FilterPick
            label="Tipo"
            value={type}
            onChange={setType}
            options={[...db.project_types].sort(byPosition).map((x) => ({ value: x.id, label: x.name }))}
          />
          <FilterPick
            label="Entrada"
            value={period}
            onChange={setPeriod}
            options={[
              { value: '7', label: 'Últimos 7 dias' },
              { value: '30', label: 'Últimos 30 dias' },
              { value: '90', label: 'Últimos 90 dias' },
              { value: '365', label: 'Últimos 12 meses' },
            ]}
          />
          {(activeFilters > 0 || query) && (
            <button type="button" onClick={clearFilters} className="ml-1 shrink-0 whitespace-nowrap text-[13px] text-faint hover:text-ink">
              Limpar
            </button>
          )}
        </div>
        <Tabs<View>
          tabs={[
            { id: 'kanban', label: 'Quadro' },
            { id: 'list', label: 'Lista' },
          ]}
          value={view}
          onChange={changeView}
          size="sm"
          underline={1}
          bordered={false}
          className="max-md:hidden"
        />
      </div>

      {/* Conteúdo */}
      <div className="mt-6 md:mt-8">
        {!desktop ? null : view === 'kanban' ? (
          /* Desktop: quadro arrastável */
          <div className="scrollbar-thin -mx-5 overflow-x-auto px-5 pb-6 md:-mx-8 md:px-8 xl:-mx-12 xl:px-12">
            <div className="flex gap-4">
              {stages.map((stage) => {
                const items = byStage[stage.id] ?? [];
                const total = sum(items.map((l) => l.proposal_value ?? 0));
                const isTarget = !!dragId && dropTarget?.stage === stage.id;
                const dragged = dragId ? maps.leads[dragId] : null;
                const placeholder = <DropZone stage={stage} />;
                return (
                  <section
                    key={stage.id}
                    aria-label={stage.name}
                    className={cn(
                      'group/col flex w-[284px] shrink-0 flex-col rounded-[16px] p-3',
                      stage.kind === 'won' ? 'bg-success-bg/70' : stage.kind === 'lost' ? 'bg-ink/[0.035]' : 'bg-ink/[0.025]',
                    )}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!(e.target as HTMLElement).closest('[data-lead-card]') && (dropTarget?.stage !== stage.id || dropTarget.before !== null)) {
                        setDropTarget({ stage: stage.id, before: null });
                      }
                    }}
                    onDrop={(e) => onDrop(e, stage.id)}
                  >
                    <header
                      className={cn(
                        'flex items-start justify-between gap-2 border-b pb-3',
                        stage.kind === 'won' ? 'border-success-solid/40' : stage.kind === 'lost' ? 'border-stone-300' : 'border-hairline',
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {stage.kind === 'won' ? (
                            <Trophy className="h-3.5 w-3.5 shrink-0 text-success-fg" strokeWidth={1.8} aria-hidden />
                          ) : stage.kind === 'lost' ? (
                            <XCircle className="h-3.5 w-3.5 shrink-0 text-stone-500" strokeWidth={1.8} aria-hidden />
                          ) : (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: stageColor(stage, stages) }} aria-hidden />
                          )}
                          <h2 className={cn('truncate text-[13.5px] font-medium', stage.kind === 'won' ? 'text-success-fg' : 'text-ink')}>{stage.name}</h2>
                          <span className="text-[13px] tabular text-faint">{items.length}</span>
                        </div>
                        <div className="mt-1 pl-3.5 text-[12.5px] tabular text-faint">{total > 0 ? formatCurrency(total) : '—'}</div>
                      </div>
                      {stage.kind === 'open' && (
                      <IconButton
                        label={`Nova oportunidade em ${stage.name}`}
                        size="xs"
                        onClick={() => setCreatingIn(stage.id)}
                        className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover/col:opacity-100"
                      >
                        <Plus className="h-4 w-4" strokeWidth={1.6} />
                      </IconButton>
                      )}
                    </header>
                    <div
                      className="scrollbar-thin -mx-1 flex-1 space-y-2.5 overflow-y-auto px-1 pb-2 pt-3"
                      style={{ minHeight: 200, maxHeight: 'max(360px, calc(100vh - 330px))' }}
                    >
                      {items.map((lead) => (
                        <div key={lead.id}>
                          {isTarget && dropTarget?.before === lead.id && dragId !== lead.id && <div className="mb-2.5">{placeholder}</div>}
                          <LeadCard
                            lead={lead}
                            dragging={dragId === lead.id}
                            staleDays={settings.lead_stale_days}
                            onOpen={() => openLead(lead.id)}
                            onConvert={() => setConverting(lead)}
                            onWin={wonStage ? () => performMove(lead.id, wonStage.id, null) : undefined}
                            onLose={lostStage ? () => performMove(lead.id, lostStage.id, null) : undefined}
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', lead.id);
                              e.dataTransfer.effectAllowed = 'move';
                              // O navegador fotografa o card ao iniciar o arraste: inclina só a "foto".
                              const el = e.currentTarget as HTMLElement;
                              el.classList.add('drag-ghost');
                              requestAnimationFrame(() => el.classList.remove('drag-ghost'));
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
                              const before = after ? (items[idx + 1]?.id ?? null) : lead.id;
                              if (dropTarget?.stage !== stage.id || dropTarget.before !== before) setDropTarget({ stage: stage.id, before });
                            }}
                          />
                        </div>
                      ))}
                      {isTarget && dropTarget?.before === null && dragged && (dragged.stage_id !== stage.id || items.length > 1) && placeholder}
                      {items.length === 0 && !dragId && stage.kind === 'open' && (
                        <button
                          type="button"
                          onClick={() => setCreatingIn(stage.id)}
                          className="flex h-16 w-full items-center justify-center rounded-lg border border-dashed border-line-strong text-[13px] text-faint transition-colors hover:border-stone-400 hover:text-muted"
                        >
                          Nenhuma oportunidade
                        </button>
                      )}
                      {items.length === 0 && !dragId && stage.kind !== 'open' && (
                        <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-line-strong px-4 text-center text-[12.5px] leading-[18px] text-faint">
                          {stage.kind === 'won'
                            ? 'Arraste para cá (ou clique em “Ganhou”) quando fechar negócio: o lead vira cliente.'
                            : 'Arraste para cá (ou clique em “Não ganhou”) quando não fechar: o motivo é registrado.'}
                        </div>
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

        {/* Celular: uma etapa por vez (com a busca e os filtros acima) */}
        {!desktop && (
          <div>
            <Tabs
              tabs={stages.map((s) => ({ id: s.id, label: s.name, count: (byStage[s.id] ?? []).length }))}
              value={currentMobile ?? ''}
              onChange={setMobileStage}
              underline={1}
              className="-mx-5 border-hairline px-5 [&>button]:py-2.5"
            />
            <div className="mt-4 space-y-2.5">
              {(byStage[currentMobile ?? ''] ?? []).map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  staleDays={settings.lead_stale_days}
                  onOpen={() => openLead(lead.id)}
                  onConvert={() => setConverting(lead)}
                />
              ))}
              {(byStage[currentMobile ?? ''] ?? []).length === 0 && (
                <p className="py-10 text-center text-[13px] text-faint">Nenhuma oportunidade nesta etapa.</p>
              )}
              {currentMobile && (
                <button
                  type="button"
                  onClick={() => setCreatingIn(currentMobile)}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong text-[14px] text-muted"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.6} />
                  Nova oportunidade
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {creatingIn !== null && <LeadFormModal defaultStageId={creatingIn} onClose={() => setCreatingIn(null)} />}
      {openLeadId && <LeadDrawer leadId={openLeadId} onClose={() => openLead(null)} />}
      {converting && <ConvertLeadModal lead={converting} onClose={() => setConverting(null)} />}
      {pendingWon && maps.leads[pendingWon.id] && (
        <WonDealModal
          lead={maps.leads[pendingWon.id]}
          mode="won"
          onClose={() => setPendingWon(null)}
          onSubmit={async (plan, launch) => {
            const lead = maps.leads[pendingWon.id];
            const created = plan ? await closeDeal(lead.id, plan, launch, true) : 0;
            await moveLead(pendingWon.id, pendingWon.stage, pendingWon.before);
            if (created > 0) toast.success(`${lead.name} fechou! ${created} ${created === 1 ? 'parcela lançada' : 'parcelas lançadas'} em contas a receber.`);
            // Acabou de ganhar: segue direto para o cadastro do cliente e do projeto
            if (!lead.client_id) setConverting(maps.leads[pendingWon.id] ?? lead);
          }}
        />
      )}
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

/** Zona de soltar: tracejado bronze com "Soltar em {etapa}". */
function DropZone({ stage }: { stage: LeadStage }) {
  return (
    <div className="flex h-14 items-center justify-center rounded-lg border-[1.5px] border-dashed border-brand-300 bg-brand-50 text-[13px] text-brand-700">
      Soltar em {stage.name}
    </div>
  );
}

function LeadCard({
  lead,
  dragging,
  staleDays,
  onOpen,
  onConvert,
  onWin,
  onLose,
  onDragStart,
  onDragEnd,
  onDragOverCard,
}: {
  lead: Lead;
  dragging?: boolean;
  staleDays: number;
  onOpen: () => void;
  onConvert: () => void;
  onWin?: () => void;
  onLose?: () => void;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: () => void;
  onDragOverCard?: (e: DragEvent) => void;
}) {
  const { maps } = useData();
  const stage = maps.stages[lead.stage_id];
  const owner = lead.owner_id ? maps.profiles[lead.owner_id] : null;
  const type = lead.project_type_id ? maps.types[lead.project_type_id] : null;
  const t = today();
  const daysInStage = diffDays(toDateKey(new Date(lead.stage_changed_at)), t);
  const open = stage?.kind === 'open';
  const ret = open && lead.next_contact_date && lead.next_contact_date <= t ? lead.next_contact_date : null;
  const stale = open && daysInStage > staleDays;
  const details = [lead.city, lead.area_m2 ? `${formatNumber(lead.area_m2)} m²` : null, type?.name].filter(Boolean).join(' · ');

  let status: ReactNode = (
    <span className="text-faint" title="Dias nesta etapa">
      {daysInStage}d
    </span>
  );
  if (ret) {
    status = (
      <span className={ret < t ? 'text-danger-fg' : 'text-warning-fg'}>{ret < t ? `retorno desde ${formatDateShort(ret)}` : 'retorno hoje'}</span>
    );
  } else if (stale) {
    status = <span className="text-muted">parado há {daysInStage} dias</span>;
  }

  return (
    <article
      data-lead-card
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOverCard}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onOpen();
      }}
      tabIndex={0}
      aria-label={lead.name}
      className={cn(
        'group cursor-pointer rounded-[12px] border border-line bg-surface p-3.5 shadow-xs transition-[border-color,box-shadow,opacity] duration-150 hover:border-stone-300 hover:shadow-card',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-[14px] font-medium leading-5 text-ink">{lead.name}</h3>
        {owner && <Avatar user={owner} size="xs" className="mt-px" />}
      </div>
      {details && <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-[18px] text-faint">{details}</p>}

      <div className="mt-3 flex items-baseline justify-between gap-2 text-[12.5px]">
        <span className={cn('shrink-0 tabular', lead.proposal_value ? 'font-medium text-ink' : 'text-faint')}>
          {lead.proposal_value ? formatCurrency(lead.proposal_value) : 'Sem proposta'}
        </span>
        {open && <span className="truncate text-right">{status}</span>}
        {stage?.kind === 'won' &&
          (lead.client_id ? (
            <span className="inline-flex items-center gap-1 text-success-fg">
              <Check className="h-3 w-3" strokeWidth={2.4} /> Cliente
            </span>
          ) : (
            <ActionLink onClick={onConvert} className="text-[12.5px]">
              Virar cliente
            </ActionLink>
          ))}
      </div>
      {stage?.kind === 'lost' && lead.lost_reason && <p className="mt-1.5 truncate text-[12px] text-faint">{lead.lost_reason}</p>}
      {open && onWin && onLose && (
        // Atalhos de desfecho: aparecem ao passar o mouse (ou com o foco no card)
        <div className="mt-2.5 hidden gap-1.5 border-t border-hairline pt-2.5 group-focus-within:flex group-hover:flex">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onWin();
            }}
            className="flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[12.5px] font-medium text-success-fg hover:bg-success-bg"
          >
            <Trophy className="h-3.5 w-3.5" strokeWidth={1.8} /> Ganhou
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLose();
            }}
            className="flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[12.5px] text-stone-600 hover:bg-subtle"
          >
            <XCircle className="h-3.5 w-3.5" strokeWidth={1.8} /> Não ganhou
          </button>
        </div>
      )}
    </article>
  );
}

type SortKey = 'created' | 'name' | 'value' | 'return';

function LeadList({ leads, onOpen }: { leads: Lead[]; onOpen: (id: string) => void }) {
  const { db, maps } = useData();
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'created', desc: true });
  const t = today();
  const sorted = useMemo(() => {
    const out = [...leads];
    const dir = sort.desc ? -1 : 1;
    out.sort((a, b) => {
      switch (sort.key) {
        case 'name':
          return dir * a.name.localeCompare(b.name);
        case 'value':
          return dir * ((a.proposal_value ?? 0) - (b.proposal_value ?? 0));
        case 'return':
          return dir * (a.next_contact_date ?? '9999').localeCompare(b.next_contact_date ?? '9999');
        default:
          return dir * a.created_at.localeCompare(b.created_at);
      }
    });
    return out;
  }, [leads, sort]);

  if (leads.length === 0) {
    return (
      <EmptyState
        title="Nenhuma oportunidade encontrada"
        description="Ajuste a busca ou os filtros, ou cadastre uma nova oportunidade."
        className="py-16"
      />
    );
  }

  const header = (key: SortKey, label: string, className?: string) => {
    const active = sort.key === key;
    return (
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' && key !== 'return' }))}
        className={cn('inline-flex items-center gap-1 hover:text-ink', active && 'text-ink', className)}
      >
        {label}
        {active && (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    );
  };

  const cols = 'grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.9fr)_110px_120px_28px]';
  return (
    <div>
      <div className={cn('hidden gap-6 border-b border-hairline pb-2.5 text-[12.5px] text-faint md:grid', cols)}>
        {header('name', 'Oportunidade')}
        <span>Etapa</span>
        <span>Origem</span>
        <span className="text-right">{header('value', 'Proposta', 'justify-end')}</span>
        {header('return', 'Retorno')}
        <span className="sr-only">Responsável</span>
      </div>
      <ul>
        {sorted.map((l) => {
          const stage = maps.stages[l.stage_id];
          const open = stage?.kind === 'open';
          const ret = l.next_contact_date;
          const retClass = !open || !ret ? 'text-faint' : ret < t ? 'text-danger-fg' : ret === t ? 'text-warning-fg' : 'text-muted';
          const type = l.project_type_id ? maps.types[l.project_type_id]?.name : null;
          return (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => onOpen(l.id)}
                className={cn(
                  'grid w-full items-center gap-x-6 gap-y-1 border-b border-hairline py-3.5 text-left transition-colors hover:bg-ink/[0.025]',
                  cols,
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium text-ink">{l.name}</span>
                  <span className="block truncate text-[12.5px] text-faint">
                    {[l.city, l.area_m2 ? `${formatNumber(l.area_m2)} m²` : null, type].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="hidden min-w-0 items-center gap-2 text-[13px] text-stone-700 md:flex">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: stageColor(stage, db.lead_stages) }} aria-hidden />
                  <span className="truncate">{stage?.name}</span>
                </span>
                <span className="hidden truncate text-[13px] text-muted md:block">{l.source_id ? maps.sources[l.source_id]?.name : '—'}</span>
                <span className={cn('text-right text-[13px] tabular', l.proposal_value ? 'text-ink' : 'text-faint')}>
                  {l.proposal_value ? formatCurrency(l.proposal_value) : '—'}
                </span>
                <span className={cn('hidden text-[13px] md:block', retClass)}>{ret ? (open && ret === t ? 'hoje' : formatDateShort(ret)) : '—'}</span>
                <span className="hidden justify-end md:flex">
                  <Avatar user={l.owner_id ? maps.profiles[l.owner_id] : null} size="xs" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[12.5px] text-faint">
        {leads.length} {leads.length === 1 ? 'oportunidade' : 'oportunidades'}
      </p>
    </div>
  );
}
