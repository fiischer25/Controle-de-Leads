import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Copy, FileText, HardHat, Plus, Printer, Send, Trash2, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { MoneyInput } from '../components/finance/MoneyInput';
import { ApprovalLink, AnswerModal } from '../components/obras/approvals';
import { ObraFormModal } from '../components/obras/ObraFormModal';
import { ClientChooser, DecimalInput, ToneBadge } from '../components/obras/parts';
import { useObraActions } from '../components/obras/useObraActions';
import {
  BUDGET_STATUS,
  budgetTotals,
  itemCost,
  itemSuggestions,
  newBudgetData,
  newBudgetItem,
  newSection,
  nextCode,
  SECTION_PRESETS,
  UNITS,
} from '../lib/obras';
import type { Budget, BudgetData, BudgetItem, BudgetSection, BudgetStatus, ObraApproval } from '../lib/types';
import { cn, formatCurrency, formatDate, formatDateTime, formatMoney, formatNumber, matches, nowIso, uid } from '../lib/utils';
import {
  ActionLink,
  BackLink,
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Field,
  FilterPick,
  IconButton,
  Input,
  MetricRow,
  Modal,
  PageHeader,
  SearchField,
  Select,
  Textarea,
  Toolbar,
} from '../components/ui';

/** Obras → Orçamentos: lista dos orçamentos ou o editor de um (novo ou salvo). */
export default function BudgetsPage() {
  const { id } = useParams();
  return id ? <BudgetEditor key={id} id={id} /> : <BudgetList />;
}

const LIST_COLS = 'md:grid-cols-[minmax(0,1.7fr)_minmax(0,1.1fr)_150px_90px_130px_96px]';

// ---------------------------------------------------------------- Lista
function BudgetList() {
  const { db } = useData();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const all = useMemo(() => [...db.budgets].sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [db.budgets]);
  const list = all.filter((b) => (!status || b.status === status) && matches(q, b.name, b.code, b.client_name, b.city));
  const answered = all.filter((b) => b.status === 'aprovado' || b.status === 'recusado');
  const approved = all.filter((b) => b.status === 'aprovado');
  const waiting = all.filter((b) => b.status === 'enviado');

  return (
    <div>
      <PageHeader
        eyebrow="Obras"
        title="Orçamentos"
        description="Orçamento prévio da obra por partes — pintura, elétrica, hidráulica… — com material, mão de obra e BDI. Aprovado pelo cliente, vira obra com cronograma."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => navigate('/orcamentos/novo')}>
            Novo orçamento
          </Button>
        }
      />
      {all.length > 0 && (
        <MetricRow
          className="mb-10"
          items={[
            { label: 'Orçamentos', value: all.length, sub: `${all.filter((b) => b.status === 'rascunho').length} em rascunho` },
            { label: 'Aguardando cliente', value: waiting.length, tone: waiting.length ? 'text-warning-fg' : undefined, sub: formatMoney(waiting.reduce((a, b) => a + b.total, 0)) },
            { label: 'Aprovados', value: approved.length, sub: formatMoney(approved.reduce((a, b) => a + b.total, 0)) },
            { label: 'Taxa de aprovação', value: answered.length ? `${Math.round((approved.length / answered.length) * 100)}%` : '—', sub: `${answered.length} respondidos` },
          ]}
        />
      )}
      {all.length === 0 ? (
        <div className="rounded-[16px] border border-line bg-surface shadow-card">
          <EmptyState
            icon={<FileText strokeWidth={1.6} />}
            title="Nenhum orçamento ainda"
            description="Monte o orçamento por partes da obra, envie o link para o cliente aprovar e transforme em obra."
            action={<ActionLink to="/orcamentos/novo">Fazer o primeiro orçamento</ActionLink>}
            className="py-14"
          />
        </div>
      ) : (
        <>
          <Toolbar
            className="mb-4"
            search={<SearchField value={q} onChange={setQ} placeholder="Buscar orçamento, cliente ou cidade" />}
            filters={
              <FilterPick
                label="Situação"
                value={status}
                onChange={setStatus}
                allLabel="Todas"
                options={(Object.keys(BUDGET_STATUS) as BudgetStatus[]).map((s) => ({ value: s, label: BUDGET_STATUS[s].label }))}
              />
            }
          />
          <div className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-card">
            <div className={cn('hidden gap-x-4 border-b border-line px-5 py-2.5 text-[12px] font-medium text-faint md:grid', LIST_COLS)}>
              <span>Orçamento</span>
              <span>Cliente</span>
              <span>Situação</span>
              <span className="text-right">R$/m²</span>
              <span className="text-right">Total</span>
              <span className="text-right">Atualizado</span>
            </div>
            {list.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted">Nenhum orçamento com esses filtros.</p>}
            <ul className="divide-y divide-hairline-surface">
              {list.map((b) => {
                const st = BUDGET_STATUS[b.status];
                return (
                  <li key={b.id}>
                    <Link to={`/orcamentos/${b.id}`} className={cn('grid gap-x-4 gap-y-1 px-5 py-3.5 transition-colors hover:bg-canvas md:items-center', LIST_COLS)} data-budget-row>
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-semibold text-ink">{b.name || 'Sem nome'}</div>
                        <div className="truncate text-[12.5px] text-faint">
                          {b.code} · {b.data.sections.length} {b.data.sections.length === 1 ? 'parte' : 'partes'}
                          {b.obra_id && ' · virou obra'}
                        </div>
                      </div>
                      <div className="min-w-0 truncate text-[13px] text-muted">{[b.client_name, b.city].filter(Boolean).join(' · ') || '—'}</div>
                      <div>
                        <ToneBadge tone={st.tone} label={st.label} />
                      </div>
                      <div className="text-[12.5px] tabular text-muted md:text-right">{b.area_m2 && b.total ? `${formatMoney(b.total / b.area_m2)}` : '—'}</div>
                      <div className="font-display text-[16px] font-semibold tabular text-ink md:text-right">{formatCurrency(b.total)}</div>
                      <div className="text-[12px] text-faint md:text-right">{formatDate(b.updated_at.slice(0, 10))}</div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Editor
function BudgetEditor({ id }: { id: string }) {
  const { db, maps, me, can } = useData();
  const { saveBudget, deleteBudget, sendBudget } = useObraActions();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const saved = id === 'novo' ? null : (db.budgets.find((b) => b.id === id) ?? null);

  const [draft, setDraft] = useState<Budget>(() => {
    if (saved) return saved;
    // Novo: BDI, validade, condições e exclusões do último orçamento; aberto por um projeto ou oportunidade, já vinculado
    const last = [...db.budgets].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    const project = params.get('projeto') ? maps.projects[params.get('projeto')!] : null;
    const lead = params.get('oportunidade') ? maps.leads[params.get('oportunidade')!] : null;
    const client = project ? maps.clients[project.client_id] : null;
    const now = nowIso();
    return {
      id: uid(),
      code: nextCode('ORC', db.budgets.map((b) => b.code)),
      name: project?.name ?? '',
      client_id: client?.id ?? null,
      client_name: client?.name ?? lead?.name ?? null,
      client_phone: client?.phone ?? lead?.phone ?? null,
      client_email: client?.email ?? lead?.email ?? null,
      lead_id: lead?.id ?? project?.lead_id ?? null,
      project_id: project?.id ?? null,
      address: project?.site_address ?? null,
      city: project?.site_city ?? lead?.city ?? null,
      area_m2: project?.area_m2 ?? lead?.area_m2 ?? null,
      status: 'rascunho',
      data: newBudgetData(
        last
          ? { bdi: last.data.bdi, validity_days: last.data.validity_days, payment_terms: last.data.payment_terms, exclusions: last.data.exclusions }
          : undefined,
      ),
      total: 0,
      obra_id: null,
      sent_at: null,
      answered_at: null,
      created_by: me.id,
      created_at: now,
      updated_at: now,
    };
  });
  const [dirty, setDirty] = useState(id === 'novo');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sending, setSending] = useState(false);
  const [converting, setConverting] = useState(false);
  const [answering, setAnswering] = useState<ObraApproval | null>(null);
  const [otherSection, setOtherSection] = useState('');

  const suggestions = useMemo(() => itemSuggestions(db.budgets, draft.id), [db.budgets, draft.id]);
  const t = budgetTotals(draft.data, draft.area_m2);
  // Status e obra seguem o banco (o cliente pode aprovar pelo link com a tela aberta)
  const live = saved ?? draft;
  const pending = db.obra_approvals.find((a) => a.budget_id === draft.id && a.kind === 'orcamento' && a.status === 'pendente');
  const lastAnswer = db.obra_approvals
    .filter((a) => a.budget_id === draft.id && a.kind === 'orcamento' && a.answered_at)
    .sort((a, b) => (b.answered_at ?? '').localeCompare(a.answered_at ?? ''))[0];

  if (id !== 'novo' && !saved) {
    return (
      <div>
        <BackLink to="/orcamentos">Orçamentos</BackLink>
        <EmptyState title="Orçamento não encontrado" description="Ele pode ter sido excluído." className="py-16" />
      </div>
    );
  }

  const set = (c: Partial<Budget>) => {
    setDraft((d) => ({ ...d, ...c }));
    setDirty(true);
  };
  const setData = (c: Partial<BudgetData>) => {
    setDraft((d) => ({ ...d, data: { ...d.data, ...c } }));
    setDirty(true);
  };
  const setSection = (sid: string, c: Partial<BudgetSection>) => setData({ sections: draft.data.sections.map((s) => (s.id === sid ? { ...s, ...c } : s)) });
  const setItem = (sid: string, iid: string, c: Partial<BudgetItem>) => {
    const s = draft.data.sections.find((x) => x.id === sid)!;
    setSection(sid, { items: s.items.map((i) => (i.id === iid ? { ...i, ...c } : i)) });
  };
  const moveSection = (idx: number, dir: -1 | 1) => {
    const list = [...draft.data.sections];
    const [s] = list.splice(idx, 1);
    list.splice(idx + dir, 0, s);
    setData({ sections: list });
  };
  const addSection = (name: string, withItems = true) => {
    if (!name.trim()) return;
    setData({ sections: [...draft.data.sections, newSection(name.trim(), withItems)] });
  };

  const persist = async () => {
    if (!draft.name.trim()) {
      toast.error('Dê um nome para o orçamento (ex.: REFORMA APTO 302).');
      return null;
    }
    // Status e obra vêm do banco: o cliente pode ter respondido com a tela aberta
    const row = await saveBudget({ ...draft, status: live.status, obra_id: live.obra_id, sent_at: live.sent_at, answered_at: live.answered_at }, !saved);
    setDraft(row);
    setDirty(false);
    return row;
  };

  const save = async () => {
    setBusy(true);
    try {
      const row = await persist();
      if (!row) return;
      toast.success('Orçamento salvo.');
      if (!saved) navigate(`/orcamentos/${row.id}`, { replace: true });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async () => {
    try {
      const now = nowIso();
      const copy: Budget = {
        ...draft,
        id: uid(),
        code: nextCode('ORC', db.budgets.map((b) => b.code)),
        name: `${draft.name} (CÓPIA)`,
        status: 'rascunho',
        obra_id: null,
        sent_at: null,
        answered_at: null,
        data: { ...draft.data, sections: draft.data.sections.map((s) => ({ ...s, id: uid(), items: s.items.map((i) => ({ ...i, id: uid() })) })) },
        created_by: me.id,
        created_at: now,
        updated_at: now,
      };
      const row = await saveBudget(copy, true);
      toast.success(`Cópia criada: ${row.code}.`);
      navigate(`/orcamentos/${row.id}`);
    } catch (e) {
      toast.error(e);
    }
  };

  const setStatus = async (status: BudgetStatus) => {
    try {
      set({ status });
      if (saved) await saveBudget({ ...draft, status }, false);
      setDirty(false);
    } catch (e) {
      toast.error(e);
    }
  };

  const st = BUDGET_STATUS[live.status];
  const obra = live.obra_id ? db.obras.find((o) => o.id === live.obra_id) : null;
  const usedNames = new Set(draft.data.sections.map((s) => s.name));

  return (
    <div>
      <BackLink to="/orcamentos">Orçamentos</BackLink>
      <PageHeader
        className="md:pt-4"
        eyebrow={[draft.code, draft.city].filter(Boolean).join(' · ')}
        title={draft.name.trim() || 'Novo orçamento'}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ToneBadge tone={st.tone} label={st.label} />
            <span>{dirty ? 'Alterações não salvas' : saved ? `Salvo em ${formatDateTime(saved.updated_at)}` : 'Preencha e salve'}</span>
          </span>
        }
        actions={
          <>
            {saved && (
              <>
                <IconButton label="Excluir orçamento" onClick={() => setDeleting(true)} className="hover:text-danger-fg">
                  <Trash2 className="h-4 w-4" strokeWidth={1.6} />
                </IconButton>
                <IconButton label="Duplicar orçamento" onClick={duplicate}>
                  <Copy className="h-4 w-4" strokeWidth={1.6} />
                </IconButton>
                <Button icon={<Printer className="h-4 w-4" strokeWidth={1.6} />} onClick={() => navigate(`/orcamentos/${draft.id}/proposta`)} disabled={dirty}>
                  Proposta
                </Button>
                <Button icon={<Send className="h-4 w-4" strokeWidth={1.6} />} onClick={() => setSending(true)} disabled={t.total <= 0}>
                  Enviar ao cliente
                </Button>
              </>
            )}
            {obra ? (
              <Button variant="primary" icon={<HardHat className="h-4 w-4" strokeWidth={1.6} />} onClick={() => navigate(`/obras/${obra.id}`)}>
                Abrir obra
              </Button>
            ) : (
              saved &&
              live.status === 'aprovado' &&
              !dirty && (
                <Button variant="primary" icon={<HardHat className="h-4 w-4" strokeWidth={1.6} />} onClick={() => setConverting(true)}>
                  Transformar em obra
                </Button>
              )
            )}
            <Button variant={live.status === 'aprovado' && !obra && !dirty ? 'secondary' : 'primary'} loading={busy} onClick={save} disabled={!dirty && !!saved}>
              Salvar
            </Button>
          </>
        }
      />

      {/* Situação: link do cliente, resposta, obra */}
      {saved && (pending || lastAnswer || live.status === 'aprovado') && (
        <section aria-label="Aprovação do cliente" className="mb-8 rounded-[14px] border border-line bg-surface px-4 py-3.5 shadow-card">
          {pending ? (
            <div className="space-y-2.5">
              <p className="text-[14px] text-ink">
                <b>Aguardando o cliente.</b> Enviado em {formatDateTime(pending.requested_at)}. Quando ele responder pelo link, você recebe uma notificação.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <ApprovalLink approval={pending} />
                </div>
                <Button size="sm" variant="ghost" onClick={() => setAnswering(pending)}>
                  Registrar resposta
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[14px] text-ink">
                {live.status === 'aprovado' ? <b className="text-success-fg">Aprovado pelo cliente</b> : live.status === 'recusado' ? <b className="text-danger-fg">Recusado pelo cliente</b> : <b>{st.label}</b>}
                {lastAnswer && (
                  <>
                    {' '}
                    {lastAnswer.answered_name ? `· ${lastAnswer.answered_name}` : ''} em {formatDateTime(lastAnswer.answered_at)}
                    {lastAnswer.answer_comment && <span className="block text-[13px] text-muted">“{lastAnswer.answer_comment}”</span>}
                  </>
                )}
              </p>
              {obra && (
                <ActionLink to={`/obras/${obra.id}`}>
                  Obra {obra.code}
                </ActionLink>
              )}
            </div>
          )}
        </section>
      )}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px] xl:gap-8">
        <div className="min-w-0 space-y-10">
          <Section title="Obra e cliente" id="orc-obra">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-6">
                <Field label="Nome do orçamento" required className="sm:col-span-3" hint="Ex.: REFORMA APTO 302, CASA J.D.">
                  <Input value={draft.name} onChange={(e) => set({ name: e.target.value.toUpperCase() })} />
                </Field>
                <Field label="Endereço da obra" className="sm:col-span-3">
                  <Input value={draft.address ?? ''} onChange={(e) => set({ address: e.target.value || null })} />
                </Field>
                <Field label="Cidade" className="sm:col-span-2">
                  <Input value={draft.city ?? ''} onChange={(e) => set({ city: e.target.value || null })} />
                </Field>
                <Field label="Área (m²)" className="sm:col-span-2">
                  <Input type="number" min={0} inputMode="decimal" value={draft.area_m2 ?? ''} onChange={(e) => set({ area_m2: e.target.value ? Number(e.target.value) : null })} />
                </Field>
                {can('projetos') && (
                  <Field label="Projeto" className="sm:col-span-2">
                    <Select value={draft.project_id ?? ''} onChange={(e) => set({ project_id: e.target.value || null })}>
                      <option value="">Nenhum</option>
                      {[...db.projects]
                        .sort((a, b) => b.created_at.localeCompare(a.created_at))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code} · {p.name}
                          </option>
                        ))}
                    </Select>
                  </Field>
                )}
              </div>
              <ClientChooser value={draft} onChange={(c) => set(c)} />
            </div>
          </Section>

          <Section
            title="Partes da obra"
            id="orc-partes"
            aside={<span className="text-[12.5px] text-muted">Valores de custo por unidade; o BDI entra no preço do cliente.</span>}
          >
            {draft.data.sections.length === 0 && (
              <p className="mb-4 rounded-[12px] border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-muted">
                Escolha as partes da obra abaixo. Cada parte já vem com itens comuns — ajuste quantidades e preços.
              </p>
            )}
            <div className="space-y-5">
              {draft.data.sections.map((s, idx) => (
                <SectionCard
                  key={s.id}
                  section={s}
                  index={idx}
                  count={draft.data.sections.length}
                  totals={t.sections[idx]}
                  bdi={t.bdi}
                  onChange={(c) => setSection(s.id, c)}
                  onItem={(iid, c) => setItem(s.id, iid, c)}
                  onMove={(dir) => moveSection(idx, dir)}
                  onRemove={() => setData({ sections: draft.data.sections.filter((x) => x.id !== s.id) })}
                  suggestions={suggestions}
                />
              ))}
            </div>
            <div className="mt-6" aria-label="Adicionar parte">
              <div className="label">Adicionar parte</div>
              <div className="flex flex-wrap gap-1.5">
                {SECTION_PRESETS.filter((p) => !usedNames.has(p.name)).map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => addSection(p.name)}
                    className="inline-flex h-8 items-center gap-1 rounded-full border border-line bg-surface px-3 text-[13px] text-stone-700 transition-colors hover:border-stone-400 hover:text-ink"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
                    {p.name}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex max-w-md gap-2">
                <Input
                  value={otherSection}
                  placeholder="Outra parte (ex.: Paisagismo)"
                  aria-label="Nome de outra parte"
                  onChange={(e) => setOtherSection(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      addSection(otherSection, false);
                      setOtherSection('');
                    }
                  }}
                />
                <Button
                  onClick={() => {
                    addSection(otherSection, false);
                    setOtherSection('');
                  }}
                  disabled={!otherSection.trim()}
                >
                  Adicionar
                </Button>
              </div>
            </div>
          </Section>

          <Section title="Condições da proposta" id="orc-condicoes">
            <div className="grid gap-4 sm:grid-cols-6">
              <Field label="BDI (%)" className="sm:col-span-2" hint="Administração, lucro e impostos sobre o custo.">
                <Input type="number" min={0} step="0.5" inputMode="decimal" value={draft.data.bdi || ''} onChange={(e) => setData({ bdi: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="Desconto" className="sm:col-span-2">
                <MoneyInput value={draft.data.discount || null} onChange={(v) => setData({ discount: v ?? 0 })} />
              </Field>
              <Field label="Validade (dias)" className="sm:col-span-2">
                <Input type="number" min={0} value={draft.data.validity_days || ''} onChange={(e) => setData({ validity_days: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="Forma de pagamento" className="sm:col-span-6">
                <Input value={draft.data.payment_terms} onChange={(e) => setData({ payment_terms: e.target.value })} placeholder="Ex.: 30% na assinatura e o restante por medição quinzenal" />
              </Field>
              <Field label="Escopo e observações" className="sm:col-span-3">
                <Textarea rows={4} value={draft.data.notes} onChange={(e) => setData({ notes: e.target.value })} placeholder="O que está incluso, premissas, materiais de referência…" />
              </Field>
              <Field label="Não incluso" className="sm:col-span-3">
                <Textarea rows={4} value={draft.data.exclusions} onChange={(e) => setData({ exclusions: e.target.value })} placeholder="Ex.: móveis soltos, eletrodomésticos, taxas da prefeitura" />
              </Field>
            </div>
          </Section>
        </div>

        {/* Resumo */}
        <aside className="lg:sticky lg:top-6" aria-label="Resumo do orçamento">
          <div className="rounded-[16px] border border-line bg-surface p-5 shadow-card">
            <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-faint">Total do orçamento</div>
            <div className="mt-1 font-display text-[30px] font-semibold leading-9 tracking-[-0.015em] tabular text-ink" data-budget-total>
              {formatCurrency(t.total)}
            </div>
            <div className="mt-0.5 text-[12.5px] text-muted">
              {t.perM2 != null ? `${formatMoney(t.perM2)}/m² · ` : ''}
              {t.items} {t.items === 1 ? 'item' : 'itens'}
              {t.days ? ` · ${t.days} dias úteis` : ''}
            </div>
            <dl className="mt-5 space-y-2 border-t border-hairline pt-4 text-[13px]">
              <Row label="Material" value={formatMoney(t.material)} />
              <Row label="Mão de obra" value={formatMoney(t.labor)} />
              <Row label="Custo" value={formatMoney(t.cost)} strong />
              <Row label={`BDI ${formatNumber(t.bdi, 1)}%`} value={formatMoney(t.bdiValue)} />
              {t.discount > 0 && <Row label="Desconto" value={`− ${formatMoney(t.discount)}`} />}
              <Row label="Total" value={formatMoney(t.total)} strong />
            </dl>
            {t.sections.length > 0 && t.subtotal > 0 && (
              <div className="mt-5 space-y-2 border-t border-hairline pt-4">
                <div className="text-[12px] font-medium text-faint">Peso de cada parte</div>
                {[...t.sections]
                  .sort((a, b) => b.price - a.price)
                  .map((s) => (
                    <div key={s.id}>
                      <div className="flex justify-between gap-3 text-[12.5px]">
                        <span className="truncate text-stone-700">{s.name}</span>
                        <span className="shrink-0 tabular text-muted">{Math.round(s.share * 100)}%</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-stone-100">
                        <div className="h-full rounded-full bg-stone-700" style={{ width: `${s.share * 100}%` }} />
                      </div>
                    </div>
                  ))}
              </div>
            )}
            {saved && live.status !== 'aprovado' && !pending && (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-hairline pt-4">
                <Button size="sm" variant="ghost" onClick={() => setStatus('aprovado')}>
                  Marcar como aprovado
                </Button>
                {live.status !== 'recusado' && (
                  <Button size="sm" variant="ghost" onClick={() => setStatus('recusado')} className="text-muted">
                    Recusado
                  </Button>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      {deleting && saved && (
        <ConfirmDialog
          title="Excluir orçamento?"
          message={`${draft.code} · ${draft.name}${live.obra_id ? '. A obra criada a partir dele continua.' : ''}`}
          confirmLabel="Excluir"
          danger
          onConfirm={async () => {
            await deleteBudget(saved);
            toast.success('Orçamento excluído.');
            navigate('/orcamentos');
          }}
          onClose={() => setDeleting(false)}
        />
      )}
      {sending && saved && (
        <SendBudgetModal
          budget={draft}
          dirty={dirty}
          onClose={() => setSending(false)}
          onSend={async (detailed) => {
            const row = dirty ? await persist() : draft;
            if (!row) return null;
            return sendBudget(row, detailed);
          }}
        />
      )}
      {converting && saved && <ObraFormModal budget={saved} onClose={() => setConverting(false)} />}
      {answering && <AnswerModal approval={answering} onClose={() => setAnswering(null)} />}
    </div>
  );
}

function Section({ title, id, aside, children }: { title: string; id: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-2.5">
        <h2 id={id} className="font-display text-[17px] font-semibold text-ink">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? 'font-medium text-ink' : 'text-muted'}>{label}</dt>
      <dd className={cn('tabular', strong ? 'font-semibold text-ink' : 'text-stone-700')}>{value}</dd>
    </div>
  );
}

const ITEM_COLS = 'md:grid-cols-[minmax(0,1fr)_62px_64px_92px_92px_92px_28px]';

function SectionCard({
  section,
  index,
  count,
  totals,
  bdi,
  onChange,
  onItem,
  onMove,
  onRemove,
  suggestions,
}: {
  section: BudgetSection;
  index: number;
  count: number;
  totals: { material: number; labor: number; cost: number; price: number };
  bdi: number;
  onChange: (c: Partial<BudgetSection>) => void;
  onItem: (iid: string, c: Partial<BudgetItem>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  suggestions: ReturnType<typeof itemSuggestions>;
}) {
  const listId = `sug-${section.id}`;
  const pick = (iid: string, description: string) => {
    const s = suggestions.find((x) => x.description.toLowerCase() === description.trim().toLowerCase());
    const item = section.items.find((i) => i.id === iid);
    // Item do banco de preços: traz unidade e preços (se ainda não digitados)
    if (s && item && !item.material && !item.labor) onItem(iid, { description, unit: s.unit, material: s.material, labor: s.labor });
    else onItem(iid, { description });
  };
  return (
    <div className="rounded-[16px] border border-line bg-surface shadow-card" data-section={section.name}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <span className="text-[12.5px] tabular text-faint">{index + 1}.</span>
        <Input
          value={section.name}
          onChange={(e) => onChange({ name: e.target.value })}
          aria-label={`Nome da parte ${index + 1}`}
          className="h-8 min-w-0 flex-1 basis-[calc(100%-2rem)] border-transparent px-1.5 font-display text-[15px] font-semibold hover:border-line-strong sm:basis-auto sm:max-w-[320px]"
        />
        <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
          Prazo
          <input
            type="number"
            min={0}
            value={section.days ?? ''}
            onChange={(e) => onChange({ days: e.target.value ? Number(e.target.value) : null })}
            aria-label={`Prazo de ${section.name} em dias úteis`}
            className="input h-8 w-16 px-2 text-right tabular"
          />
          dias
        </label>
        <span className="ml-auto font-display text-[15px] font-semibold tabular text-ink" title="Com BDI">
          {formatMoney(totals.price)}
        </span>
        <span className="flex items-center">
          <IconButton label="Subir parte" size="sm" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp className="h-4 w-4" />
          </IconButton>
          <IconButton label="Descer parte" size="sm" disabled={index === count - 1} onClick={() => onMove(1)}>
            <ArrowDown className="h-4 w-4" />
          </IconButton>
          <IconButton label={`Remover a parte ${section.name}`} size="sm" onClick={onRemove} className="hover:text-danger-fg">
            <Trash2 className="h-4 w-4" strokeWidth={1.6} />
          </IconButton>
        </span>
      </div>
      <div className="px-4 pb-3">
        <div className={cn('hidden gap-1.5 py-2 text-[11.5px] font-medium text-faint md:grid', ITEM_COLS)}>
          <span>Item</span>
          <span>Unid.</span>
          <span className="text-right">Qtd.</span>
          <span className="text-right">Material/un</span>
          <span className="text-right">M. obra/un</span>
          <span className="text-right">Custo</span>
          <span />
        </div>
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s.description} value={s.description}>
              {`${s.unit} · ${formatMoney(s.material + s.labor)} (${s.from})`}
            </option>
          ))}
        </datalist>
        <ul className="divide-y divide-hairline-surface md:divide-y-0">
          {section.items.map((i) => (
            <li key={i.id} className={cn('grid grid-cols-2 gap-1.5 py-2.5 md:items-center md:py-1', ITEM_COLS)} data-item>
              <Input
                value={i.description}
                list={listId}
                placeholder="Descrição do item"
                title={i.description}
                aria-label="Descrição do item"
                onChange={(e) => pick(i.id, e.target.value)}
                className="col-span-2 h-8 px-2 md:col-span-1"
              />
              <MobileLabel text="Unidade">
                <select value={i.unit} onChange={(e) => onItem(i.id, { unit: e.target.value })} aria-label={`Unidade de ${i.description || 'item'}`} className="input h-8 px-1.5">
                  {[...new Set([...UNITS, i.unit])].map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </MobileLabel>
              <MobileLabel text="Qtd.">
                <DecimalInput value={i.qty} digits={3} onChange={(v) => onItem(i.id, { qty: v })} aria-label={`Quantidade de ${i.description || 'item'}`} />
              </MobileLabel>
              <MobileLabel text="Material/un">
                <DecimalInput value={i.material} onChange={(v) => onItem(i.id, { material: v })} aria-label={`Material por unidade de ${i.description || 'item'}`} />
              </MobileLabel>
              <MobileLabel text="M. obra/un">
                <DecimalInput value={i.labor} onChange={(v) => onItem(i.id, { labor: v })} aria-label={`Mão de obra por unidade de ${i.description || 'item'}`} />
              </MobileLabel>
              <span className="self-center text-right text-[13px] tabular text-ink" title={bdi ? `Para o cliente: ${formatMoney(itemCost(i) * (1 + bdi / 100))}` : undefined}>
                {formatMoney(itemCost(i))}
              </span>
              <IconButton label={`Remover ${i.description || 'item'}`} size="sm" onClick={() => onChange({ items: section.items.filter((x) => x.id !== i.id) })}>
                <X className="h-4 w-4" />
              </IconButton>
            </li>
          ))}
        </ul>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => onChange({ items: [...section.items, newBudgetItem()] })}>
            Item
          </Button>
          <span className="text-[12px] tabular text-faint">
            Material {formatMoney(totals.material)} · Mão de obra {formatMoney(totals.labor)}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Rótulo visível só no celular (na tela larga, o cabeçalho da tabela já diz). */
function MobileLabel({ text, children }: { text: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="mb-0.5 block text-[11px] text-faint md:hidden" aria-hidden>
        {text}
      </span>
      {children}
    </div>
  );
}

function SendBudgetModal({
  budget,
  dirty,
  onClose,
  onSend,
}: {
  budget: Budget;
  dirty: boolean;
  onClose: () => void;
  onSend: (detailed: boolean) => Promise<ObraApproval | null>;
}) {
  const toast = useToast();
  const [detailed, setDetailed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [approval, setApproval] = useState<ObraApproval | null>(null);
  const send = async () => {
    setBusy(true);
    try {
      const a = await onSend(detailed);
      if (a) setApproval(a);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Enviar orçamento ao cliente"
      subtitle={`${budget.code} · ${budget.name}`}
      onClose={onClose}
      footer={
        approval ? (
          <Button variant="primary" onClick={onClose}>
            Pronto
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancelar</Button>
            <Button variant="primary" loading={busy} onClick={send} icon={<Send className="h-4 w-4" strokeWidth={1.6} />}>
              {dirty ? 'Salvar e gerar link' : 'Gerar link de aprovação'}
            </Button>
          </>
        )
      }
    >
      {approval ? (
        <div className="space-y-4">
          <p className="text-[14px] text-ink">
            Link criado. Mande pelo WhatsApp ou copie: o cliente vê o orçamento e responde <b>Aprovo</b> ou <b>Não aprovo</b>, sem precisar de login.
          </p>
          <ApprovalLink approval={approval} />
          <p className="text-[12.5px] text-muted">Quando ele responder, o orçamento muda de situação sozinho e você recebe uma notificação.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[14px] text-muted">
            O cliente recebe um link com as partes da obra, os valores (já com o BDI), as condições e o total. Um link anterior ainda sem resposta é substituído.
          </p>
          <Checkbox checked={detailed} onChange={setDetailed} label="Mostrar os itens de cada parte (quantidade e valor)" />
        </div>
      )}
    </Modal>
  );
}
