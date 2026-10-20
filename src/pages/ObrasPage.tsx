import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Camera, HardHat, Pencil, Plus, ThumbsUp, Trash2, Truck } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { ObraFormModal } from '../components/obras/ObraFormModal';
import { SupplierModal } from '../components/obras/SupplierModal';
import { DualBar, ToneBadge } from '../components/obras/parts';
import { useObraSummaries } from '../components/obras/useObraSummaries';
import { isObraActive, OBRA_STATUS, OBRA_STATUS_ORDER } from '../lib/obras';
import type { ObraSupplier } from '../lib/types';
import { cn, deadlineState, dueLabel, formatCurrency, formatDate, formatMoney, matches, today } from '../lib/utils';
import {
  ActionLink,
  Button,
  ConfirmDialog,
  EmptyState,
  FilterPick,
  IconButton,
  MetricRow,
  PageHeader,
  SearchField,
  Tabs,
  Toolbar,
} from '../components/ui';

type Tab = 'obras' | 'fornecedores';

/** Obras: lista das obras (avanço físico e financeiro, prazos, aprovações) e fornecedores. */
export default function ObrasPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('aba') === 'fornecedores' ? 'fornecedores' : 'obras';
  const [creating, setCreating] = useState(false);
  const { db } = useData();
  return (
    <div>
      <PageHeader
        eyebrow="Obras"
        title="Obras"
        description="Acompanhamento das obras: cronograma físico-financeiro, visitas com fotos, pagamentos, pendências e aprovações do cliente."
        actions={
          tab === 'obras' && (
            <Button variant="primary" icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => setCreating(true)}>
              Nova obra
            </Button>
          )
        }
      />
      <Tabs<Tab>
        className="mb-8"
        value={tab}
        onChange={(t) => setParams(t === 'obras' ? {} : { aba: t }, { replace: true })}
        tabs={[
          { id: 'obras', label: 'Obras', count: db.obras.length },
          { id: 'fornecedores', label: 'Fornecedores', count: db.obra_suppliers.filter((s) => s.active).length },
        ]}
      />
      {tab === 'obras' ? <ObraList onCreate={() => setCreating(true)} /> : <Suppliers />}
      {creating && <ObraFormModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function ObraList({ onCreate }: { onCreate: () => void }) {
  const { settings, maps } = useData();
  const all = useObraSummaries();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ativas');
  const list = all
    .filter((s) => (status === 'ativas' ? isObraActive(s.obra) : !status || s.obra.status === status))
    .filter((s) => matches(q, s.obra.name, s.obra.code, s.obra.client_name, s.obra.city))
    .sort((a, b) => (a.obra.due_date ?? '9999').localeCompare(b.obra.due_date ?? '9999'));
  const active = all.filter((s) => isObraActive(s.obra));
  const late = active.filter((s) => s.lateStages > 0 || (s.obra.due_date && s.obra.due_date < today()));
  const approvals = active.reduce((a, s) => a + s.pendingApprovals, 0);

  if (all.length === 0) {
    return (
      <div className="rounded-[16px] border border-line bg-surface shadow-card">
        <EmptyState
          icon={<HardHat strokeWidth={1.6} />}
          title="Nenhuma obra ainda"
          description="Aprove um orçamento e transforme em obra, ou crie uma obra direto."
          action={
            <span className="flex flex-wrap justify-center gap-3">
              <ActionLink to="/orcamentos">Ir para os orçamentos</ActionLink>
              <ActionLink onClick={onCreate}>Criar obra</ActionLink>
            </span>
          }
          className="py-14"
        />
      </div>
    );
  }

  return (
    <div>
      <MetricRow
        className="mb-10"
        items={[
          { label: 'Obras ativas', value: active.length, sub: `${all.filter((s) => s.obra.status === 'concluida').length} concluídas` },
          { label: 'Com atraso', value: late.length, tone: late.length ? 'text-danger-fg' : undefined, sub: 'etapas ou entrega' },
          { label: 'Aguardando cliente', value: approvals, tone: approvals ? 'text-warning-fg' : undefined, sub: 'pedidos de aprovação' },
          { label: 'Em obras ativas', value: formatMoney(active.reduce((a, s) => a + s.money.contracted, 0)), sub: `${formatMoney(active.reduce((a, s) => a + s.money.paid, 0))} pagos` },
        ]}
      />
      <Toolbar
        className="mb-4"
        search={<SearchField value={q} onChange={setQ} placeholder="Buscar obra, cliente ou cidade" />}
        filters={
          <FilterPick
            label="Situação"
            value={status}
            onChange={setStatus}
            allLabel="Todas"
            options={[{ value: 'ativas', label: 'Ativas' }, ...OBRA_STATUS_ORDER.map((s) => ({ value: s, label: OBRA_STATUS[s].label }))]}
          />
        }
      />
      {list.length === 0 && <p className="py-10 text-center text-sm text-muted">Nenhuma obra com esses filtros.</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((s) => {
          const o = s.obra;
          const st = OBRA_STATUS[o.status];
          const done = !isObraActive(o);
          const due = deadlineState(o.due_date, done, settings.due_soon_days);
          const manager = o.manager_id ? maps.profiles[o.manager_id] : null;
          const pctPaid = s.money.contracted > 0 ? Math.round((s.money.paid / s.money.contracted) * 100) : 0;
          return (
            <Link key={o.id} to={`/obras/${o.id}`} className="group flex flex-col rounded-[16px] border border-line bg-surface p-5 shadow-card transition-colors hover:border-stone-300" data-obra-card>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[12px] text-faint">{[o.code, o.city].filter(Boolean).join(' · ')}</div>
                  <div className="mt-0.5 truncate font-display text-[17px] font-semibold text-ink">{o.name}</div>
                  <div className="truncate text-[13px] text-muted">{[o.client_name, manager?.name].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                <ToneBadge tone={st.tone} label={st.label} />
              </div>
              <div className="mt-5">
                <div className="flex items-baseline justify-between text-[12.5px]">
                  <span className="text-muted">Avanço físico</span>
                  <span className="tabular">
                    <b className="font-semibold text-ink">{s.progress}%</b>
                    {s.expected != null && !done && <span className="text-faint"> · previsto {s.expected}%</span>}
                  </span>
                </div>
                <DualBar className="mt-1.5" actual={s.progress} expected={done ? null : s.expected} />
              </div>
              <div className="mt-3">
                <div className="flex items-baseline justify-between text-[12.5px]">
                  <span className="text-muted">Pago</span>
                  <span className="tabular text-ink">
                    {formatMoney(s.money.paid)} <span className="text-faint">de {formatCurrency(s.money.contracted)}</span>
                  </span>
                </div>
                <DualBar className="mt-1.5" actual={pctPaid} color="rgb(var(--stone-500))" />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline pt-3 text-[12px] text-muted">
                <span className={cn(due === 'overdue' ? 'text-danger-fg' : due === 'soon' || due === 'today' ? 'text-warning-fg' : '')}>
                  {o.due_date ? (done ? `Entrega ${formatDate(o.due_date)}` : dueLabel(o.due_date)) : 'Sem entrega'}
                </span>
                {s.lateStages > 0 && (
                  <span className="inline-flex items-center gap-1 text-danger-fg">
                    <AlertTriangle className="h-3.5 w-3.5" /> {s.lateStages} {s.lateStages === 1 ? 'etapa atrasada' : 'etapas atrasadas'}
                  </span>
                )}
                {s.pendingApprovals > 0 && (
                  <span className="inline-flex items-center gap-1 text-warning-fg">
                    <ThumbsUp className="h-3.5 w-3.5" /> {s.pendingApprovals} aguardando
                  </span>
                )}
                {s.photos > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Camera className="h-3.5 w-3.5" /> {s.photos}
                  </span>
                )}
                {s.lastVisit && <span className="ml-auto">Última visita {formatDate(s.lastVisit.date)}</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Fornecedores
function Suppliers() {
  const { db, removeRows } = useData();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<ObraSupplier | 'new' | null>(null);
  const [removing, setRemoving] = useState<ObraSupplier | null>(null);
  const list = [...db.obra_suppliers]
    .filter((s) => matches(q, s.name, s.trade, s.contact, s.phone))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const paidBy = (id: string) => db.obra_payments.filter((p) => p.supplier_id === id && p.paid_at).reduce((a, p) => a + p.amount, 0);
  const obrasOf = (id: string) => new Set(db.obra_payments.filter((p) => p.supplier_id === id).map((p) => p.obra_id)).size;
  return (
    <div>
      <Toolbar
        className="mb-4"
        search={<SearchField value={q} onChange={setQ} placeholder="Buscar fornecedor ou especialidade" />}
        aside={
          <Button variant="primary" icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => setEditing('new')}>
            Fornecedor
          </Button>
        }
      />
      {list.length === 0 ? (
        <div className="rounded-[16px] border border-line bg-surface shadow-card">
          <EmptyState icon={<Truck strokeWidth={1.6} />} title="Nenhum fornecedor" description="Cadastre empreiteiros, eletricistas, lojas de material… para lançar os pagamentos das obras." className="py-12" />
        </div>
      ) : (
        <ul className="divide-y divide-hairline-surface overflow-hidden rounded-[16px] border border-line bg-surface shadow-card">
          {list.map((s) => (
            <li key={s.id} className={cn('flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3.5', !s.active && 'opacity-60')} data-supplier>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-ink">
                  {s.name}
                  {!s.active && <span className="ml-2 text-[12px] font-normal text-faint">inativo</span>}
                </div>
                <div className="truncate text-[12.5px] text-muted">{[s.trade, s.contact, s.phone, s.pix ? `Pix ${s.pix}` : null].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              <div className="text-right text-[12.5px] tabular text-muted">
                {formatMoney(paidBy(s.id))} pagos
                <div className="text-[12px] text-faint">{obrasOf(s.id)} {obrasOf(s.id) === 1 ? 'obra' : 'obras'}</div>
              </div>
              <span className="flex">
                <IconButton label={`Editar ${s.name}`} onClick={() => setEditing(s)}>
                  <Pencil className="h-4 w-4" strokeWidth={1.6} />
                </IconButton>
                <IconButton label={`Excluir ${s.name}`} onClick={() => setRemoving(s)} className="hover:text-danger-fg">
                  <Trash2 className="h-4 w-4" strokeWidth={1.6} />
                </IconButton>
              </span>
            </li>
          ))}
        </ul>
      )}
      {editing && <SupplierModal supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {removing && (
        <ConfirmDialog
          title="Excluir fornecedor?"
          message={`${removing.name}. Os pagamentos já lançados continuam com o nome dele. Para só esconder da lista, edite e desative.`}
          confirmLabel="Excluir"
          danger
          onConfirm={async () => {
            try {
              await removeRows('obra_suppliers', [removing.id]);
              toast.success('Fornecedor excluído.');
            } catch (e) {
              toast.error(e);
            }
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
