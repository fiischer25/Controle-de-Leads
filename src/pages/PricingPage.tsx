import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Calculator, Plus, Trash2, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { MoneyInput } from '../components/finance/MoneyInput';
import { fixedCostsFromFinance, newPricingData, pricingResult, roundPrice, type PricingResult } from '../lib/pricing';
import type { Pricing, PricingData, PricingExtra, PricingFixedCost, PricingIndirect, PricingStage } from '../lib/types';
import { byPosition, cn, formatCurrency, formatDate, formatMoney, formatNumber, nowIso, today, uid } from '../lib/utils';
import { ActionLink, BackLink, Button, ConfirmDialog, EmptyState, Field, IconButton, Input, PageHeader, SectionHeader, Select, Textarea } from '../components/ui';

const REF_KEY = 'airos:precificacao-ref-m2';

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
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => {
            const r = pricingResult(p);
            const lead = p.lead_id ? maps.leads[p.lead_id] : null;
            return (
              <li key={p.id}>
                <Link
                  to={`/precificacao/${p.id}`}
                  className="block h-full rounded-[16px] border border-line bg-surface p-5 shadow-card transition-colors hover:border-stone-300"
                  data-pricing-card
                >
                  <div className="truncate font-display text-[16px] font-semibold text-ink">{p.name || 'Sem nome'}</div>
                  <div className="mt-0.5 truncate text-[12.5px] text-faint">
                    {[p.client_name || lead?.name, p.project_type_id ? maps.types[p.project_type_id]?.name : null, p.area_m2 ? `${formatNumber(p.area_m2)} m²` : null]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      <div className="text-[12px] text-muted">Proposta</div>
                      <div className="font-display text-[22px] font-semibold tabular text-ink">{r.price != null ? formatCurrency(r.price) : '—'}</div>
                    </div>
                    <div className="text-right text-[12.5px] tabular text-muted">
                      {r.perM2 != null && <div>{formatMoney(r.perM2)}/m²</div>}
                      <div>
                        {r.days} {r.days === 1 ? 'dia' : 'dias'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-hairline-surface pt-2.5 text-[12px] text-faint">Atualizada em {formatDate(p.updated_at.slice(0, 10))}</div>
                </Link>
              </li>
            );
          })}
        </ul>
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
  const saved = id === 'nova' ? null : (db.pricings.find((p) => p.id === id) ?? null);
  const categoryName = (cid: string | null) => (cid ? db.finance_categories.find((c) => c.id === cid)?.name ?? 'Sem categoria' : 'Sem categoria');
  const financeFixed = useMemo(() => fixedCostsFromFinance(db.finance_entries, categoryName, today()), [db.finance_entries, db.finance_categories]); // eslint-disable-line react-hooks/exhaustive-deps

  const [draft, setDraft] = useState<Pricing>(() => {
    if (saved) return saved;
    // Nova: aproveita os custos e a margem da última precificação; sem ela, a média do Financeiro
    const last = [...db.pricings].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    const data = newPricingData({ fixed: financeFixed, refM2: last?.data.ref_m2 ?? readRef() });
    if (last) {
      data.fixed = last.data.fixed.map((f) => ({ ...f, id: uid() }));
      data.work_days = last.data.work_days;
      data.indirect = last.data.indirect.map((i) => ({ ...i, id: uid() }));
      data.margin = last.data.margin;
    }
    const now = nowIso();
    return { id: uid(), name: '', client_name: null, lead_id: null, project_type_id: null, area_m2: null, data, total: 0, created_by: me.id, created_at: now, updated_at: now };
  });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const r = pricingResult(draft);

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

  const typePhases = (typeId: string) => {
    const seen: string[] = [];
    for (const t of db.task_templates.filter((x) => x.project_type_id === typeId).sort(byPosition)) if (t.phase && !seen.includes(t.phase)) seen.push(t.phase);
    return seen;
  };
  const applyTypeStages = (typeId: string) => setData({ stages: typePhases(typeId).map((label) => ({ id: uid(), label, days: 0 })) });

  const openLeads = db.leads.filter((l) => db.lead_stages.find((s) => s.id === l.stage_id)?.kind === 'open' || l.id === draft.lead_id);

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
      setDirty(false);
      toast.success('Precificação salva.');
      if (!saved) navigate(`/precificacao/${draft.id}`, { replace: true });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const toLead = async () => {
    if (!draft.lead_id || r.price == null) return;
    try {
      await updateLead(draft.lead_id, { proposal_value: r.price });
      toast.success(`Valor da proposta de ${maps.leads[draft.lead_id]?.name ?? 'oportunidade'}: ${formatMoney(r.price)}.`);
    } catch (e) {
      toast.error(e);
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
              make={() => ({ id: uid(), label: '', days: 0 })}
              addLabel="Etapa"
              head={['Etapa', 'Dias']}
              cols="grid-cols-[minmax(0,1fr)_96px_28px]"
              render={(s: PricingStage, upd) => (
                <>
                  <Input value={s.label} aria-label="Nome da etapa" placeholder="Nome da etapa" onChange={(e) => upd({ label: e.target.value })} />
                  <NumberInput value={s.days} label={`Dias de ${s.label || 'etapa'}`} onChange={(days) => upd({ days })} />
                </>
              )}
            />
          </Section>

          {/* Custos fixos */}
          <Section
            id="prec-fixos"
            title="Custos fixos do escritório (por mês)"
            aside={
              financeFixed.length > 0 ? (
                <ActionLink
                  onClick={() => setData({ fixed: financeFixed.map(([label, value]) => ({ id: uid(), label, value })) })}
                  muted
                >
                  Puxar do Financeiro (média de 3 meses)
                </ActionLink>
              ) : undefined
            }
          >
            <Rows
              items={draft.data.fixed}
              onChange={(fixed) => setData({ fixed })}
              make={() => ({ id: uid(), label: '', value: 0 })}
              addLabel="Custo fixo"
              head={['Custo', 'Valor por mês']}
              cols="grid-cols-[minmax(0,1fr)_120px_28px] sm:grid-cols-[minmax(0,1fr)_150px_28px]"
              render={(f: PricingFixedCost, upd) => (
                <>
                  <Input value={f.label} aria-label="Nome do custo fixo" placeholder="Ex.: aluguel" onChange={(e) => upd({ label: e.target.value })} />
                  <MoneyInput value={f.value} aria-label={`Valor por mês de ${f.label || 'custo'}`} onChange={(v) => upd({ value: v ?? 0 })} />
                </>
              )}
            />
            <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3 rounded-[12px] bg-canvas px-4 py-3">
              <Field label="Dias úteis por mês" className="w-32">
                <NumberInput value={draft.data.work_days} label="Dias úteis por mês" onChange={(work_days) => setData({ work_days })} />
              </Field>
              <div className="pb-2 text-[13px] text-muted">
                {formatMoney(r.fixedMonthly)} por mês ÷ {draft.data.work_days || 0} dias ={' '}
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

        <Summary
          pricing={draft}
          r={r}
          onFinal={(final_price) => setData({ final_price })}
          onLead={can('comercial') && draft.lead_id ? toLead : undefined}
          leadName={draft.lead_id ? maps.leads[draft.lead_id]?.name : undefined}
        />
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

// ---------------------------------------------------------------- Resumo
function Summary({
  pricing,
  r,
  onFinal,
  onLead,
  leadName,
}: {
  pricing: Pricing;
  r: PricingResult;
  onFinal: (v: number | null) => void;
  onLead?: () => void;
  leadName?: string;
}) {
  const price = r.price ?? 0;
  const parts = [
    { label: 'Dias de trabalho', value: r.daysCost, color: 'bg-stone-700' },
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
        {onLead && r.price != null && (
          <Button className="mt-4 w-full" onClick={onLead}>
            Usar como proposta de {leadName ?? 'oportunidade'}
          </Button>
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
          <span key={h} className={i > 0 && h !== 'Como' ? 'text-right' : undefined}>
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
