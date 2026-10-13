import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Calculator, Plus, Trash2, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { MoneyInput } from '../components/finance/MoneyInput';
import {
  DEFAULT_HOURS_PER_DAY,
  fixedCostsFromFinance,
  isLaborCost,
  newPricingData,
  pricingResult,
  recurringFixedCosts,
  roundPrice,
  teamAverageRate,
  type PricingResult,
} from '../lib/pricing';
import type { Pricing, PricingData, PricingExtra, PricingFixedCost, PricingIndirect, PricingStage } from '../lib/types';
import { phaseKey, stageHistory, type StageHistory } from '../lib/plannedActual';
import { byPosition, cn, formatCurrency, formatDate, formatMoney, formatNumber, nowIso, suggestProjectName, today, uid } from '../lib/utils';
import { ActionLink, BackLink, Button, ConfirmDialog, EmptyState, Field, IconButton, Input, PageHeader, SectionHeader, Select, Textarea } from '../components/ui';

const REF_KEY = 'airos:precificacao-ref-m2';
const LIST_COLS = 'md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_80px_70px_110px_130px_90px]';

/** Gestão → Precificação: lista das precificações ou o editor de uma (nova ou salva). */
export default function PricingPage() {
  const { id } = useParams();
  return id ? <PricingEditor key={id} id={id} /> : <PricingList />;
}

// ---------------------------------------------------------------- Lista
function PricingList() {
  const { db, maps } = useData();
  const navigate = useNavigate();
  const list = [...db.pricings].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return (
    <div>
      <PageHeader
        title="Precificação"
        description="Preço do projeto pelos dias de trabalho, com os custos fixos, indiretos e adicionais, comparado com o m²."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => navigate('/precificacao/nova')}>
            Nova precificação
          </Button>
        }
      />
      {list.length === 0 ? (
        <div className="rounded-[16px] border border-line bg-surface shadow-card">
          <EmptyState
            icon={<Calculator strokeWidth={1.6} />}
            title="Nenhuma precificação ainda"
            description="Coloque a área da casa, os dias de cada etapa e os custos: o sistema calcula o preço e compara com o m²."
            action={<ActionLink to="/precificacao/nova">Fazer a primeira precificação</ActionLink>}
            className="py-14"
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-card">
          <div className={cn('hidden gap-x-4 border-b border-line px-5 py-2.5 text-[12px] font-medium text-faint md:grid', LIST_COLS)}>
            <span>Precificação</span>
            <span>Oportunidade</span>
            <span className="text-right">Área</span>
            <span className="text-right">Dias</span>
            <span className="text-right">R$/m²</span>
            <span className="text-right">Proposta</span>
            <span className="text-right">Atualizada</span>
          </div>
          <ul className="divide-y divide-hairline-surface">
            {list.map((p) => {
              const r = pricingResult(p);
              const lead = p.lead_id ? maps.leads[p.lead_id] : null;
              const synced = lead && r.price != null && lead.proposal_value === r.price;
              return (
                <li key={p.id}>
                  <Link
                    to={`/precificacao/${p.id}`}
                    className={cn('grid gap-x-4 gap-y-1 px-5 py-3.5 transition-colors hover:bg-canvas md:items-center', LIST_COLS)}
                    data-pricing-row
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold text-ink">{p.name || 'Sem nome'}</div>
                      <div className="truncate text-[12.5px] text-faint">
                        {[p.client_name || lead?.name, p.project_type_id ? maps.types[p.project_type_id]?.name : null].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                    <div className="min-w-0 truncate text-[13px] text-muted">
                      {lead ? (
                        <>
                          <span className="md:hidden">Oportunidade: </span>
                          {lead.name}
                          {synced && <span className="ml-1.5 text-[11.5px] text-success-fg">· valor na proposta</span>}
                        </>
                      ) : (
                        <span className="hidden text-faint md:inline">—</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-[12.5px] tabular text-muted md:contents">
                      <span className="md:text-right">{p.area_m2 ? `${formatNumber(p.area_m2)} m²` : '—'}</span>
                      <span className="md:text-right">
                        {r.days} {r.days === 1 ? 'dia' : 'dias'}
                      </span>
                      <span className="md:text-right">{r.perM2 != null ? `${formatMoney(r.perM2)}/m²` : '—'}</span>
                    </div>
                    <div className="font-display text-[16px] font-semibold tabular text-ink md:text-right">{r.price != null ? formatCurrency(r.price) : '—'}</div>
                    <div className="text-[12px] text-faint md:text-right">{formatDate(p.updated_at.slice(0, 10))}</div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Editor
function readRef(): number | null {
  try {
    const v = Number(localStorage.getItem(REF_KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

function PricingEditor({ id }: { id: string }) {
  const { db, maps, me, can, insertRows, patch, removeRows, updateLead } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const saved = id === 'nova' ? null : (db.pricings.find((p) => p.id === id) ?? null);

  // Equipe: custo/hora de cada pessoa (Financeiro → Rentabilidade) e a média, para etapas sem pessoa
  const team = useMemo(() => db.profiles.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name)), [db.profiles]);
  const rateOf = (userId: string) => {
    const v = db.finance_member_costs.find((c) => c.user_id === userId)?.hourly_cost;
    return v != null && v > 0 ? v : null;
  };
  const teamRate = teamAverageRate(db.finance_member_costs.filter((c) => team.some((p) => p.id === c.user_id)));

  // Custos fixos do Financeiro: as despesas que repetem todo mês; sem elas, a média de 3 meses.
  // Salários e pró-labore vêm marcados: saem do custo do dia quando a equipe está nas etapas.
  const finance = useMemo(() => {
    const name = (cid: string | null) => (cid ? (db.finance_categories.find((c) => c.id === cid)?.name ?? 'Sem categoria') : 'Sem categoria');
    const recurring = recurringFixedCosts(db.finance_entries, name, today());
    if (recurring.length) return { rows: recurring, source: 'mensal' as const };
    const avg = fixedCostsFromFinance(db.finance_entries, name, today(), 3);
    return { rows: avg, source: avg.length ? ('media' as const) : null };
  }, [db.finance_entries, db.finance_categories]);

  const typePhases = (typeId: string) => {
    const seen: string[] = [];
    for (const t of db.task_templates.filter((x) => x.project_type_id === typeId).sort(byPosition)) if (t.phase && !seen.includes(t.phase)) seen.push(t.phase);
    return seen;
  };

  const [draft, setDraft] = useState<Pricing>(() => {
    if (saved) return saved;
    // Nova: custos fixos do Financeiro; indiretos, margem e dias úteis da última precificação
    const last = [...db.pricings].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    // Aberta pela oportunidade (?oportunidade=): já vinculada, com cliente, área e tipo
    const lead = params.get('oportunidade') ? maps.leads[params.get('oportunidade')!] : null;
    const typeId = lead?.project_type_id ?? null;
    const data = newPricingData({
      fixed: finance.rows,
      refM2: last?.data.ref_m2 ?? readRef(),
      teamRate,
      stages: typeId ? typePhases(typeId) : undefined,
    });
    if (last) {
      if (!finance.rows.length) data.fixed = last.data.fixed.map((f) => ({ ...f, id: uid() }));
      data.work_days = last.data.work_days;
      data.hours_per_day = last.data.hours_per_day ?? DEFAULT_HOURS_PER_DAY;
      data.indirect = last.data.indirect.map((i) => ({ ...i, id: uid() }));
      data.margin = last.data.margin;
    }
    const now = nowIso();
    return {
      id: uid(),
      name: lead ? suggestProjectName(lead.name) : '',
      client_name: lead?.name ?? null,
      lead_id: lead?.id ?? null,
      project_type_id: typeId,
      area_m2: lead?.area_m2 ?? null,
      data,
      total: 0,
      created_by: me.id,
      created_at: now,
      updated_at: now,
    };
  });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const r = pricingResult(draft);
  // Histórico: quantos dias cada etapa levou de verdade (por m²) nos projetos do mesmo tipo
  const history = useMemo(
    () =>
      draft.project_type_id
        ? stageHistory({ projects: db.projects, tasks: db.tasks, timeEntries: db.time_entries, typeId: draft.project_type_id, hoursPerDay: r.hoursPerDay })
        : new Map<string, StageHistory>(),
    [db.projects, db.tasks, db.time_entries, draft.project_type_id, r.hoursPerDay],
  );

  if (id !== 'nova' && !saved) {
    return (
      <div>
        <BackLink to="/precificacao">Precificação</BackLink>
        <EmptyState title="Precificação não encontrada" description="Ela pode ter sido excluída." className="py-16" />
      </div>
    );
  }

  const set = (changes: Partial<Pricing>) => {
    setDraft((d) => ({ ...d, ...changes }));
    setDirty(true);
  };
  const setData = (changes: Partial<PricingData>) => {
    setDraft((d) => ({ ...d, data: { ...d.data, ...changes } }));
    setDirty(true);
  };

  const newStage = (label = ''): PricingStage => ({ id: uid(), label, days: 0, assignee_id: null, rate: teamRate });
  const applyTypeStages = (typeId: string) => setData({ stages: typePhases(typeId).map((label) => newStage(label)) });
  const pullFinance = () => setData({ fixed: finance.rows.map(([label, value, labor]) => ({ id: uid(), label, value, labor })) });

  const openLeads = db.leads.filter((l) => db.lead_stages.find((s) => s.id === l.stage_id)?.kind === 'open' || l.id === draft.lead_id);

  const lead = draft.lead_id ? maps.leads[draft.lead_id] : null;
  // O valor da proposta vai para a oportunidade vinculada ao salvar
  const syncLead = can('comercial') && !!lead && r.price != null && r.price > 0;

  const save = async () => {
    if (!draft.name.trim()) return toast.error('Dê um nome para a precificação (ex.: CASA B.F.).');
    setBusy(true);
    try {
      const row: Pricing = { ...draft, name: draft.name.trim(), total: r.price ?? 0, updated_at: nowIso() };
      if (saved) await patch('pricings', draft.id, row);
      else await insertRows('pricings', [row]);
      try {
        if (draft.data.ref_m2) localStorage.setItem(REF_KEY, String(draft.data.ref_m2));
      } catch {
        /* só lembra neste navegador */
      }
      // Custo por dia digitado para quem ainda não tinha custo cadastrado: vai para Financeiro → Rentabilidade
      const fresh = new Map<string, number>();
      for (const st of draft.data.stages) {
        if (st.assignee_id && st.rate && st.rate > 0 && rateOf(st.assignee_id) == null && !fresh.has(st.assignee_id)) fresh.set(st.assignee_id, Math.round(st.rate * 100) / 100);
      }
      for (const [userId, hourly] of fresh) {
        try {
          const current = db.finance_member_costs.find((c) => c.user_id === userId);
          if (current) await patch('finance_member_costs', current.id, { hourly_cost: hourly, updated_at: nowIso() });
          else await insertRows('finance_member_costs', [{ id: uid(), user_id: userId, hourly_cost: hourly, updated_at: nowIso() }]);
        } catch {
          /* a precificação já está salva; o cadastro do custo pode ser feito em Rentabilidade */
        }
      }
      let leadNote = '';
      if (syncLead && lead && lead.proposal_value !== r.price) {
        try {
          await updateLead(lead.id, { proposal_value: r.price });
          leadNote = ` Proposta de ${lead.name}: ${formatMoney(r.price!)}.`;
        } catch (e) {
          toast.error(`A precificação foi salva, mas o valor não foi para a oportunidade: ${e instanceof Error ? e.message : e}`);
        }
      }
      setDirty(false);
      toast.success(`Precificação salva.${leadNote}`);
      navigate('/precificacao');
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const typeSelected = draft.project_type_id && typePhases(draft.project_type_id).length > 0;

  return (
    <div>
      <BackLink to="/precificacao">Precificação</BackLink>
      <PageHeader
        className="md:pt-4"
        title={draft.name.trim() || 'Nova precificação'}
        description={dirty ? 'Alterações não salvas' : saved ? `Salva em ${formatDate(saved.updated_at.slice(0, 10))}` : 'Preencha e salve'}
        actions={
          <>
            {saved && (
              <IconButton label="Excluir precificação" onClick={() => setDeleting(true)} className="hover:text-danger-fg">
                <Trash2 className="h-4 w-4" strokeWidth={1.6} />
              </IconButton>
            )}
            <Button variant="primary" loading={busy} onClick={save}>
              Salvar precificação
            </Button>
          </>
        }
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px] xl:gap-12">
        <div className="space-y-10">
          {/* Projeto */}
          <Section id="prec-projeto" title="Projeto">
            <div className="grid gap-4 sm:grid-cols-6">
              <Field label="Nome" required className="sm:col-span-3" hint="Ex.: CASA B.F.">
                <Input value={draft.name} onChange={(e) => set({ name: e.target.value.toUpperCase() })} />
              </Field>
              <Field label="Cliente" className="sm:col-span-3">
                <Input value={draft.client_name ?? ''} onChange={(e) => set({ client_name: e.target.value || null })} />
              </Field>
              <Field label="Área da casa (m²)" className="sm:col-span-2">
                <Input type="number" min={0} inputMode="decimal" value={draft.area_m2 ?? ''} onChange={(e) => set({ area_m2: e.target.value ? Number(e.target.value) : null })} />
              </Field>
              <Field label="Tipo de projeto" className="sm:col-span-2">
                <Select
                  value={draft.project_type_id ?? ''}
                  onChange={(e) => {
                    const typeId = e.target.value || null;
                    set({ project_type_id: typeId });
                    // Sem dias preenchidos, as etapas passam a ser as do tipo
                    if (typeId && r.days === 0 && typePhases(typeId).length) applyTypeStages(typeId);
                  }}
                >
                  <option value="">Selecione…</option>
                  {[...db.project_types].sort(byPosition).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {can('comercial') && (
                <Field label="Oportunidade" className="sm:col-span-2">
                  <Select
                    value={draft.lead_id ?? ''}
                    onChange={(e) => {
                      const lead = e.target.value ? maps.leads[e.target.value] : null;
                      set({
                        lead_id: lead?.id ?? null,
                        client_name: draft.client_name || lead?.name || null,
                        area_m2: draft.area_m2 ?? lead?.area_m2 ?? null,
                        project_type_id: draft.project_type_id ?? lead?.project_type_id ?? null,
                      });
                    }}
                  >
                    <option value="">Nenhuma</option>
                    {openLeads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>
          </Section>

          {/* Etapas e dias */}
          <Section
            id="prec-etapas"
            title="Etapas e dias de trabalho"
            aside={
              <span className="flex items-center gap-3 text-[12.5px] text-muted">
                {typeSelected && r.days > 0 && (
                  <ActionLink onClick={() => applyTypeStages(draft.project_type_id!)} muted>
                    Usar as etapas do tipo
                  </ActionLink>
                )}
                <span className="tabular">
                  Total: <b className="font-semibold text-ink">{r.days} {r.days === 1 ? 'dia' : 'dias'}</b>
                </span>
              </span>
            }
          >
            <Rows
              items={draft.data.stages}
              onChange={(stages) => setData({ stages })}
              make={() => newStage()}
              addLabel="Etapa"
              head={['Etapa', 'Quem faz', 'Dias', 'Custo por dia', 'Total']}
              cols="grid-cols-[52px_minmax(0,1fr)_auto_28px] sm:grid-cols-[minmax(0,1fr)_170px_60px_116px_96px_28px]"
              render={(s: PricingStage, upd) => {
                const i = draft.data.stages.findIndex((x) => x.id === s.id);
                const noRate = !(s.rate && s.rate > 0);
                // Total da etapa: quem faz (dias × custo por dia) + o escritório (dias × custo do dia)
                const total = Math.round(((r.stageLabor[i] ?? 0) + (s.days || 0) * r.dayCost) * 100) / 100;
                return (
                  <>
                    <Input
                      value={s.label}
                      className="col-span-4 sm:col-span-1"
                      aria-label="Nome da etapa"
                      placeholder="Nome da etapa"
                      onChange={(e) => upd({ label: e.target.value })}
                    />
                    <Select
                      value={s.assignee_id ?? ''}
                      aria-label={`Quem faz ${s.label || 'a etapa'}`}
                      className="col-span-4 sm:col-span-1"
                      onChange={(e) => {
                        const userId = e.target.value || null;
                        upd({ assignee_id: userId, rate: userId ? rateOf(userId) : teamRate });
                      }}
                    >
                      <option value="">{teamRate != null ? 'Equipe (média)' : 'Equipe'}</option>
                      {team.map((p) => {
                        const rate = rateOf(p.id);
                        return (
                          <option key={p.id} value={p.id}>
                            {p.name} · {rate != null ? `${formatMoney(rate * r.hoursPerDay)}/dia` : 'sem custo cadastrado'}
                          </option>
                        );
                      })}
                      {s.assignee_id && !team.some((p) => p.id === s.assignee_id) && (
                        <option value={s.assignee_id}>{maps.profiles[s.assignee_id]?.name ?? 'Pessoa removida'}</option>
                      )}
                    </Select>
                    <NumberInput value={s.days} label={`Dias de ${s.label || 'etapa'}`} onChange={(days) => upd({ days })} />
                    {/* Custo por dia de quem faz: vem do cadastro (custo/hora × horas por dia) ou é digitado aqui */}
                    <div className={cn('rounded-sm', noRate && (s.days || 0) > 0 && 'ring-1 ring-warning-solid')} data-stage-day-cost>
                      <MoneyInput
                        value={s.rate && s.rate > 0 ? Math.round(s.rate * r.hoursPerDay * 100) / 100 : null}
                        aria-label={`Custo por dia de ${s.label || 'etapa'}`}
                        onChange={(v) => upd({ rate: v && v > 0 ? v / r.hoursPerDay : null })}
                      />
                    </div>
                    <span
                      className="text-right text-[13px] font-medium tabular text-ink"
                      data-stage-cost
                      title={`${s.days || 0} dias × ${formatMoney(s.rate ? s.rate * r.hoursPerDay : 0)} (quem faz) + ${s.days || 0} dias × ${formatMoney(r.dayCost)} (escritório)`}
                    >
                      {formatMoney(total)}
                    </span>
                  </>
                );
              }}
            />
            <StageHistoryHint
              stages={draft.data.stages}
              history={history}
              area={draft.area_m2}
              typeName={draft.project_type_id ? maps.types[draft.project_type_id]?.name : undefined}
              onUse={(days) => setData({ stages: draft.data.stages.map((x) => (days[x.id] != null ? { ...x, days: days[x.id] } : x)) })}
            />
            <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3 rounded-[12px] bg-canvas px-4 py-3">
              <Field label="Horas por dia" className="w-32">
                <NumberInput
                  value={draft.data.hours_per_day ?? DEFAULT_HOURS_PER_DAY}
                  label="Horas por dia"
                  decimals
                  onChange={(hours_per_day) => setData({ hours_per_day })}
                />
              </Field>
              <div className="pb-2 text-[13px] text-muted">
                Custo da equipe nas etapas:{' '}
                <b className="font-semibold text-ink" data-labor>
                  {formatMoney(r.labor)}
                </b>
                <span className="block text-[12px] text-faint">dias × custo por dia de quem faz (custo/hora × {formatNumber(r.hoursPerDay, 1)} h)</span>
              </div>
            </div>
            {draft.data.stages.some((x) => (x.days || 0) > 0 && !(x.rate && x.rate > 0)) && (
              <p className="mt-3 flex items-start gap-1.5 text-[12.5px] text-warning-fg" data-stage-cost-missing>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
                <span>
                  Digite o <b className="font-semibold">custo por dia</b> de quem faz as etapas marcadas. Ao salvar, o custo de cada pessoa sem cadastro
                  vai para{' '}
                  <ActionLink to="/financeiro?aba=rentabilidade" className="text-[length:inherit]">
                    Financeiro → Rentabilidade
                  </ActionLink>{' '}
                  e já aparece nas próximas precificações.
                </span>
              </p>
            )}
          </Section>

          {/* Custos fixos */}
          <Section
            id="prec-fixos"
            title="Custos fixos do escritório (por mês)"
            aside={
              finance.source ? (
                <ActionLink onClick={pullFinance} muted>
                  Atualizar com o Financeiro
                </ActionLink>
              ) : undefined
            }
          >
            <p className="-mt-1 mb-4 text-[12.5px] text-faint" data-fixed-source>
              {finance.source === 'mensal'
                ? 'Vêm do Financeiro: as despesas que repetem todo mês, com o valor deste mês.'
                : finance.source === 'media'
                  ? 'Vêm do Financeiro: média das despesas dos últimos 3 meses, por categoria.'
                  : 'Lance as despesas fixas no Financeiro (repetindo todo mês) e elas aparecem aqui sozinhas.'}
            </p>
            <Rows
              items={draft.data.fixed}
              onChange={(fixed) => setData({ fixed })}
              make={() => ({ id: uid(), label: '', value: 0, labor: false })}
              addLabel="Custo fixo"
              head={['Custo', '', 'Valor por mês']}
              cols="grid-cols-[auto_minmax(0,1fr)_28px] sm:grid-cols-[minmax(0,1fr)_auto_150px_28px]"
              render={(f: PricingFixedCost, upd) => {
                const labor = isLaborCost(f);
                const out = labor && r.usesTeam;
                return (
                  <>
                    <Input
                      value={f.label}
                      className={cn('col-span-3 sm:col-span-1', out && 'text-muted line-through decoration-stone-300')}
                      aria-label="Nome do custo fixo"
                      placeholder="Ex.: aluguel"
                      onChange={(e) => upd({ label: e.target.value })}
                    />
                    <button
                      type="button"
                      aria-pressed={labor}
                      aria-label={`${f.label || 'Custo'} é salário ou pró-labore`}
                      title={
                        labor
                          ? r.usesTeam
                            ? 'Salário / pró-labore: fora do custo do dia, porque já está no custo de quem faz cada etapa. Clique se não for salário.'
                            : 'Salário / pró-labore: entra no custo do dia enquanto as etapas não usam o custo da equipe.'
                          : 'Marque se for salário ou pró-labore (sai do custo do dia quando a equipe está nas etapas).'
                      }
                      onClick={() => upd({ labor: !labor })}
                      className={cn(
                        'h-7 whitespace-nowrap rounded-full border px-2.5 text-[12px] transition-colors',
                        labor ? 'border-transparent bg-stone-100 text-stone-700' : 'border-dashed border-line text-faint hover:text-ink',
                      )}
                      data-labor={labor ? (out ? 'fora' : 'dentro') : undefined}
                    >
                      {labor ? (out ? 'Salário · já na equipe' : 'Salário') : 'É salário?'}
                    </button>
                    <div className={cn(out && 'opacity-50')}>
                      <MoneyInput value={f.value} aria-label={`Valor por mês de ${f.label || 'custo'}`} onChange={(v) => upd({ value: v ?? 0 })} />
                    </div>
                  </>
                );
              }}
            />
            {r.fixedExcluded > 0 && (
              <p className="mt-3 text-[12.5px] text-muted" data-fixed-excluded>
                Sem duplicidade: <b className="font-semibold text-ink">{formatMoney(r.fixedExcluded)}</b> de salários e pró-labore ficam fora do custo do
                dia, porque já estão no custo de quem faz cada etapa.
              </p>
            )}
            {!r.usesTeam && draft.data.fixed.some((f) => isLaborCost(f) && f.value > 0) && (
              <p className="mt-3 text-[12.5px] text-muted">
                As etapas ainda não usam o custo da equipe: os salários entram no custo do dia.
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3 rounded-[12px] bg-canvas px-4 py-3">
              <Field label="Dias úteis por mês" className="w-32">
                <NumberInput value={draft.data.work_days} label="Dias úteis por mês" onChange={(work_days) => setData({ work_days })} />
              </Field>
              <div className="pb-2 text-[13px] text-muted">
                Escritório{r.fixedExcluded > 0 ? ' (sem salários)' : ''}: {formatMoney(r.fixedMonthly)} por mês ÷ {draft.data.work_days || 0} dias ={' '}
                <b className="font-semibold text-ink" data-day-cost>
                  {formatMoney(r.dayCost)} por dia
                </b>
              </div>
            </div>
          </Section>

          {/* Indiretos */}
          <Section id="prec-indiretos" title="Custos indiretos" aside={<span className="text-[12.5px] text-faint">% sobre o preço ou valor no projeto</span>}>
            <Rows
              items={draft.data.indirect}
              onChange={(indirect) => setData({ indirect })}
              make={(): PricingIndirect => ({ id: uid(), label: '', kind: 'percent', value: 0 })}
              addLabel="Custo indireto"
              head={['Custo', 'Como', 'Valor']}
              cols="grid-cols-[minmax(0,1fr)_minmax(0,1fr)_28px] sm:grid-cols-[minmax(0,1fr)_150px_140px_28px]"
              render={(i: PricingIndirect, upd) => (
                <>
                  <Input value={i.label} className="col-span-3 sm:col-span-1" aria-label="Nome do custo indireto" placeholder="Ex.: impostos" onChange={(e) => upd({ label: e.target.value })} />
                  <Select value={i.kind} aria-label={`Tipo de ${i.label || 'custo'}`} onChange={(e) => upd({ kind: e.target.value as PricingIndirect['kind'], value: 0 })}>
                    <option value="percent">% do preço</option>
                    <option value="valor">R$ no projeto</option>
                  </Select>
                  {i.kind === 'percent' ? (
                    <NumberInput value={i.value} label={`Percentual de ${i.label || 'custo'}`} suffix="%" decimals onChange={(value) => upd({ value })} />
                  ) : (
                    <MoneyInput value={i.value} aria-label={`Valor de ${i.label || 'custo'}`} onChange={(v) => upd({ value: v ?? 0 })} />
                  )}
                </>
              )}
            />
          </Section>

          {/* Adicionais */}
          <Section
            id="prec-adicionais"
            title="Adicionais"
            aside={
              <span className="text-[12.5px] tabular text-muted">
                Total: <b className="font-semibold text-ink">{formatMoney(r.extras)}</b>
              </span>
            }
          >
            <Rows
              items={draft.data.extras}
              onChange={(extras) => setData({ extras })}
              make={() => ({ id: uid(), label: '', qty: 1, unit: 0 })}
              addLabel="Adicional"
              head={['Item', 'Qtd.', 'Valor unitário', 'Subtotal']}
              cols="grid-cols-[64px_minmax(0,1fr)_auto_28px] sm:grid-cols-[minmax(0,1fr)_72px_140px_100px_28px]"
              render={(x: PricingExtra, upd) => (
                <>
                  <Input value={x.label} className="col-span-4 sm:col-span-1" aria-label="Nome do adicional" placeholder="Ex.: visitas técnicas" onChange={(e) => upd({ label: e.target.value })} />
                  <NumberInput value={x.qty} label={`Quantidade de ${x.label || 'adicional'}`} onChange={(qty) => upd({ qty })} />
                  <MoneyInput value={x.unit} aria-label={`Valor unitário de ${x.label || 'adicional'}`} onChange={(v) => upd({ unit: v ?? 0 })} />
                  <span className="text-right text-[13px] tabular text-ink">{formatMoney(x.qty * x.unit)}</span>
                </>
              )}
            />
          </Section>

          {/* Lucro e referência */}
          <Section id="prec-lucro" title="Lucro e comparação com o m²">
            <div className="grid gap-4 sm:grid-cols-6">
              <Field label="Lucro desejado (% do preço)" className="sm:col-span-2">
                <NumberInput value={draft.data.margin} label="Lucro desejado (% do preço)" suffix="%" decimals onChange={(margin) => setData({ margin })} />
              </Field>
              <Field label="Referência por m²" className="sm:col-span-2" hint="O que você cobraria pelo m², para comparar.">
                <MoneyInput value={draft.data.ref_m2} aria-label="Referência por m²" onChange={(ref_m2) => setData({ ref_m2 })} />
              </Field>
              <Field label="Observações" className="sm:col-span-6">
                <Textarea rows={3} value={draft.data.notes} onChange={(e) => setData({ notes: e.target.value })} />
              </Field>
            </div>
          </Section>
        </div>

        <Summary pricing={draft} r={r} onFinal={(final_price) => setData({ final_price })} leadName={syncLead ? lead?.name : undefined} />
      </div>

      {deleting && saved && (
        <ConfirmDialog
          title="Excluir precificação?"
          message={`"${saved.name}" será apagada.`}
          confirmLabel="Excluir"
          danger
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            await removeRows('pricings', [saved.id]);
            toast.success('Precificação excluída.');
            navigate('/precificacao');
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Histórico das etapas
/** Dias que cada etapa levou de verdade nos projetos do mesmo tipo (por m²), para usar como previsão. */
function StageHistoryHint({
  stages,
  history,
  area,
  typeName,
  onUse,
}: {
  stages: PricingStage[];
  history: Map<string, StageHistory>;
  area: number | null;
  typeName?: string;
  onUse: (days: Record<string, number>) => void;
}) {
  if (!history.size) return null;
  const matched = stages
    .map((s) => ({ s, h: history.get(phaseKey(s.label)) }))
    .filter((x): x is { s: PricingStage; h: StageHistory } => !!x.h);
  if (!matched.length) return null;
  const projects = Math.max(...matched.map((x) => x.h.projects));
  // Meio dia de precisão
  const daysFor = (h: StageHistory) => Math.max(0.5, Math.round(h.daysPerM2 * (area ?? 0) * 2) / 2);
  return (
    <div className="mt-4 rounded-[12px] border border-line px-4 py-3 text-[12.5px]" data-stage-history>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-medium text-ink">
          Histórico de {projects} {projects === 1 ? 'projeto' : 'projetos'}
          {typeName ? ` de ${typeName}` : ''}
        </span>
        {area ? (
          <ActionLink onClick={() => onUse(Object.fromEntries(matched.map(({ s, h }) => [s.id, daysFor(h)])))} className="text-[length:inherit]">
            Usar os dias do histórico
          </ActionLink>
        ) : (
          <span className="text-faint">informe a área para calcular os dias</span>
        )}
      </div>
      <p className="mt-1 text-muted">
        {matched
          .map(({ s, h }) => `${s.label}: ${area ? `${formatNumber(daysFor(h), 1)} dias` : `${formatNumber(h.daysPerM2 * 100, 1)} dias a cada 100 m²`}`)
          .join(' · ')}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- Resumo
function Summary({
  pricing,
  r,
  onFinal,
  leadName,
}: {
  pricing: Pricing;
  r: PricingResult;
  onFinal: (v: number | null) => void;
  /** Oportunidade que recebe o valor ao salvar. */
  leadName?: string;
}) {
  const price = r.price ?? 0;
  const parts = [
    { label: 'Equipe', value: r.labor, color: 'bg-stone-800' },
    { label: 'Escritório (custos fixos)', value: r.daysCost, color: 'bg-stone-600' },
    { label: 'Adicionais', value: r.extras, color: 'bg-stone-400' },
    { label: 'Indiretos', value: r.indirectValue + r.indirectPctValue, color: 'bg-warning-solid' },
    { label: 'Lucro', value: Math.max(0, r.profit ?? 0), color: 'bg-success-solid' },
  ];
  const finalSet = pricing.data.final_price != null && pricing.data.final_price > 0;
  return (
    <aside className="space-y-4 lg:sticky lg:top-6" aria-label="Resumo da precificação">
      <div className="rounded-[16px] border border-line bg-surface p-5 shadow-card">
        <div className="text-[12.5px] font-medium text-muted">Preço sugerido pelos dias</div>
        <div className="mt-1 font-display text-[30px] font-semibold leading-9 tabular text-ink" data-suggested>
          {r.suggested != null ? formatMoney(r.suggested) : '—'}
        </div>
        {r.suggested == null && <p className="mt-1 text-[12.5px] text-danger-fg">Indiretos em % + lucro precisam ficar abaixo de 100%.</p>}
        {r.suggested === 0 && (
          <p className="mt-1 text-[12.5px] text-warning-fg" data-price-zero>
            {r.days > 0
              ? 'Falta custo: digite o custo por dia de quem faz cada etapa ou os custos fixos do escritório.'
              : 'Coloque os dias de cada etapa e o custo por dia de quem faz.'}
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-hairline-surface pt-3 text-[12.5px]">
          <Stat label="Por m²" value={r.perM2 != null ? formatMoney(r.perM2) : pricing.area_m2 ? '—' : 'informe a área'} strong />
          <Stat label="Por dia" value={r.perDay != null ? formatMoney(r.perDay) : '—'} />
          <Stat label="Custo do projeto" value={formatMoney(r.cost)} />
          <Stat label={`Lucro${r.profitPct != null ? ` (${formatNumber(r.profitPct, 1)}%)` : ''}`} value={r.profit != null ? formatMoney(r.profit) : '—'} tone={r.profit != null && r.profit < 0 ? 'danger' : 'success'} />
        </div>

        {price > 0 && (
          <div className="mt-4">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-stone-100" aria-hidden>
              {parts.map((p) => (
                <span key={p.label} className={p.color} style={{ width: `${Math.max(0, (p.value / price) * 100)}%` }} />
              ))}
            </div>
            <ul className="mt-2.5 space-y-1 text-[12.5px]">
              {parts.map((p) => (
                <li key={p.label} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-muted">
                    <span className={cn('h-2 w-2 rounded-full', p.color)} aria-hidden />
                    {p.label}
                  </span>
                  <span className="tabular text-ink">
                    {formatMoney(p.value)} <span className="text-faint">· {Math.round((p.value / price) * 100)}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="rounded-[16px] border border-line bg-surface p-5 shadow-card" data-m2-compare>
        <div className="text-[13.5px] font-semibold text-ink">Comparação com o m²</div>
        {r.refPrice != null && r.price != null ? (
          <>
            <div className="mt-3 space-y-1.5 text-[13px]">
              <div className="flex justify-between gap-3">
                <span className="text-muted">Pelos dias</span>
                <span className="tabular text-ink">{formatMoney(r.price)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">
                  Pelo m² ({formatMoney(pricing.data.ref_m2!)} × {formatNumber(pricing.area_m2!)} m²)
                </span>
                <span className="tabular text-ink">{formatMoney(r.refPrice)}</span>
              </div>
            </div>
            <p
              className={cn(
                'mt-3 rounded-[10px] px-3 py-2 text-[12.5px]',
                Math.abs(r.diffPct ?? 0) < 5 ? 'bg-success-bg text-success-fg' : (r.diff ?? 0) > 0 ? 'bg-warning-bg text-warning-fg' : 'bg-info-bg text-info-fg',
              )}
            >
              {Math.abs(r.diffPct ?? 0) < 5
                ? 'Os dois cálculos estão bem próximos.'
                : (r.diff ?? 0) > 0
                  ? `Pelos dias fica ${formatNumber(r.diffPct!, 1)}% acima do m² (${formatMoney(r.diff!)} a mais).`
                  : `Pelos dias fica ${formatNumber(Math.abs(r.diffPct!), 1)}% abaixo do m² (${formatMoney(Math.abs(r.diff!))} a menos).`}
            </p>
          </>
        ) : (
          <p className="mt-2 text-[12.5px] text-faint">Informe a área da casa e a referência por m² para comparar.</p>
        )}
      </div>

      <div className="rounded-[16px] border border-line bg-surface p-5 shadow-card">
        <Field label="Valor da proposta" hint={finalSet ? 'O lucro e o m² acima já consideram este valor.' : 'Vazio: usa o preço sugerido.'}>
          <MoneyInput value={pricing.data.final_price} aria-label="Valor da proposta" onChange={(v) => onFinal(v && v > 0 ? v : null)} />
        </Field>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {r.suggested != null && (
            <ActionLink onClick={() => onFinal(roundPrice(r.suggested!))} muted>
              Arredondar ({formatMoney(roundPrice(r.suggested))})
            </ActionLink>
          )}
          {finalSet && (
            <ActionLink onClick={() => onFinal(null)} muted>
              Usar o sugerido
            </ActionLink>
          )}
        </div>
        {leadName && r.price != null && (
          <p className="mt-4 rounded-[10px] bg-canvas px-3 py-2 text-[12.5px] text-muted" data-lead-sync>
            Ao salvar, <b className="font-semibold text-ink">{formatMoney(r.price)}</b> vai como valor da proposta de{' '}
            <b className="font-semibold text-ink">{leadName}</b>.
          </p>
        )}
      </div>
    </aside>
  );
}

function Stat({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'danger' | 'success' }) {
  return (
    <div className="min-w-0">
      <div className="text-faint">{label}</div>
      <div className={cn('tabular', strong ? 'text-[15px] font-semibold text-ink' : 'text-[13.5px] text-ink', tone === 'danger' && 'text-danger-fg')}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Peças do formulário
function Section({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-[16px] border border-line bg-surface p-5 shadow-card md:p-6">
      <SectionHeader id={id} title={title} aside={aside} />
      {children}
    </section>
  );
}

/** Lista editável de linhas (etapas, custos, adicionais), com adicionar e remover. */
function Rows<T extends { id: string; label: string }>({
  items,
  onChange,
  make,
  addLabel,
  head,
  cols,
  render,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  make: () => T;
  addLabel: string;
  head: string[];
  cols: string;
  render: (item: T, update: (changes: Partial<T>) => void) => ReactNode;
}) {
  return (
    <div>
      <div className={cn('mb-1.5 hidden gap-2 text-[12px] text-faint sm:grid', cols)}>
        {head.map((h, i) => (
          <span key={h} className={i > 0 && h !== 'Como' && h !== 'Quem faz' ? 'text-right' : undefined}>
            {h}
          </span>
        ))}
        <span />
      </div>
      <ul className="space-y-3 sm:space-y-2">
        {items.map((item) => (
          <li key={item.id} className={cn('grid items-center gap-2', cols)}>
            {render(item, (changes) => onChange(items.map((x) => (x.id === item.id ? { ...x, ...changes } : x))))}
            <IconButton label={`Remover ${item.label || addLabel.toLowerCase()}`} size="xs" onClick={() => onChange(items.filter((x) => x.id !== item.id))}>
              <X className="h-3.5 w-3.5" />
            </IconButton>
          </li>
        ))}
      </ul>
      <Button size="sm" variant="ghost" className="mt-2" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => onChange([...items, make()])}>
        {addLabel}
      </Button>
    </div>
  );
}

function NumberInput({ value, onChange, label, suffix, decimals }: { value: number; onChange: (v: number) => void; label: string; suffix?: string; decimals?: boolean }) {
  return (
    <div className="relative">
      <Input
        type="number"
        min={0}
        step={decimals ? 0.5 : 1}
        inputMode="decimal"
        aria-label={label}
        value={Number.isFinite(value) && value !== 0 ? value : value === 0 ? 0 : ''}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
        className={cn('text-right tabular', suffix && 'pr-7')}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-faint">{suffix}</span>}
    </div>
  );
}
