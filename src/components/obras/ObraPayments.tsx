import { useMemo, useState } from 'react';
import { Check, Paperclip, Pencil, Plus, Receipt, ThumbsUp, Trash2 } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { PAYMENT_CATEGORY, PAYMENT_METHOD, PAYMENT_STATE, paymentState, type PaymentState } from '../../lib/obras';
import { removeTeamFiles } from '../../lib/teamFiles';
import type { ObraPayment, ObraPaymentCategory, ObraPaymentMethod } from '../../lib/types';
import { cn, downloadFile, formatDate, formatMoney, matches, nowIso, toCsv, today, uid } from '../../lib/utils';
import { Button, Checkbox, ConfirmDialog, EmptyState, Field, FilterPick, IconButton, Input, MetricRow, Modal, SearchField, Select, Textarea, Toolbar } from '../ui';
import { MoneyInput } from '../finance/MoneyInput';
import { FilesSection } from '../files/FilesSection';
import { SupplierModal } from './SupplierModal';
import { ApprovalLink } from './approvals';
import { ToneBadge } from './parts';
import { useObraActions } from './useObraActions';
import type { ObraSummary } from './useObraSummaries';

const COLS = 'md:grid-cols-[92px_minmax(0,1.6fr)_minmax(0,1fr)_120px_176px_100px]';

/** Pagamentos da obra: fornecedores, mão de obra e material, com aprovação do cliente e comprovantes. */
export function ObraPayments({ summary }: { summary: ObraSummary }) {
  const { obra, payments, stages, money } = summary;
  const { db } = useData();
  const { deletePayment, savePayment } = useObraActions();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [stage, setStage] = useState('');
  const [editing, setEditing] = useState<ObraPayment | 'new' | null>(null);
  const [removing, setRemoving] = useState<ObraPayment | null>(null);
  const [paying, setPaying] = useState<ObraPayment | null>(null);
  const t = today();
  const stageName = (id: string | null) => (id ? stages.find((s) => s.id === id)?.name ?? '' : '');

  const list = useMemo(
    () =>
      [...payments]
        .filter((p) => (!state || paymentState(p, t) === state) && (!stage || (stage === '-' ? !p.stage_id : p.stage_id === stage)))
        .filter((p) => matches(q, p.description, p.supplier_name, p.document, stages.find((s) => s.id === p.stage_id)?.name))
        .sort((a, b) => (a.paid_at ? 1 : 0) - (b.paid_at ? 1 : 0) || a.due_date.localeCompare(b.due_date)),
    [payments, stages, state, stage, q, t],
  );
  const total = list.reduce((a, p) => a + (p.approval === 'recusado' ? 0 : p.amount), 0);

  const exportCsv = () =>
    downloadFile(
      `pagamentos-${obra.code}.csv`,
      toCsv(
        list.map((p) => ({
          Vencimento: formatDate(p.due_date),
          Descrição: p.description,
          Fornecedor: p.supplier_name ?? '',
          Etapa: stageName(p.stage_id),
          Tipo: PAYMENT_CATEGORY[p.category],
          Valor: p.amount.toFixed(2).replace('.', ','),
          Situação: PAYMENT_STATE[paymentState(p, t)].label,
          'Pago em': p.paid_at ? formatDate(p.paid_at) : '',
          Forma: p.method ? PAYMENT_METHOD[p.method] : '',
          Documento: p.document ?? '',
          Quem_paga: p.payer === 'cliente' ? 'Cliente' : 'Escritório',
        })),
      ),
      'text/csv;charset=utf-8',
    );

  return (
    <div className="space-y-8">
      <MetricRow
        items={[
          { label: 'Pago', value: formatMoney(money.paid), sub: `de ${formatMoney(money.contracted)} contratado` },
          { label: 'A pagar', value: formatMoney(money.open), sub: `${payments.filter((p) => !p.paid_at && p.approval !== 'recusado').length} lançamentos` },
          { label: 'Vencido', value: formatMoney(money.overdue), tone: money.overdue > 0 ? 'text-danger-fg' : undefined, sub: 'em aberto' },
          { label: 'Aguardando cliente', value: formatMoney(money.awaiting), tone: money.awaitingCount ? 'text-warning-fg' : undefined, sub: `${money.awaitingCount} para aprovar` },
        ]}
      />
      <Toolbar
        search={<SearchField value={q} onChange={setQ} placeholder="Buscar pagamento, fornecedor ou nota" />}
        filters={
          <>
            <FilterPick
              label="Situação"
              value={state}
              onChange={setState}
              allLabel="Todas"
              options={(Object.keys(PAYMENT_STATE) as PaymentState[]).map((s) => ({ value: s, label: PAYMENT_STATE[s].label }))}
            />
            {stages.length > 0 && (
              <FilterPick
                label="Etapa"
                value={stage}
                onChange={setStage}
                allLabel="Todas"
                options={[...stages.map((s) => ({ value: s.id, label: s.name })), { value: '-', label: 'Sem etapa' }]}
              />
            )}
          </>
        }
        aside={
          <span className="flex gap-2">
            {list.length > 0 && <Button onClick={exportCsv}>Exportar</Button>}
            <Button variant="primary" icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => setEditing('new')}>
              Pagamento
            </Button>
          </span>
        }
      />

      {payments.length === 0 ? (
        <div className="rounded-[16px] border border-line bg-surface shadow-card">
          <EmptyState
            icon={<Receipt strokeWidth={1.6} />}
            title="Nenhum pagamento lançado"
            description="Lance o que a obra vai pagar (empreiteiro, material, medições) e peça a aprovação do cliente antes de pagar."
            className="py-14"
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-card">
          <div className={cn('hidden gap-x-4 border-b border-line px-5 py-2.5 text-[12px] font-medium text-faint md:grid', COLS)}>
            <span>Vencimento</span>
            <span>Pagamento</span>
            <span>Etapa</span>
            <span className="text-right">Valor</span>
            <span>Situação</span>
            <span />
          </div>
          {list.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted">Nenhum pagamento com esses filtros.</p>}
          <ul className="divide-y divide-hairline-surface">
            {list.map((p) => {
              const ps = paymentState(p, t);
              const approval = p.approval_id ? db.obra_approvals.find((a) => a.id === p.approval_id) : null;
              return (
                <li key={p.id} className={cn('grid gap-x-4 gap-y-1 px-5 py-3 md:items-center', COLS)} data-payment>
                  <div className={cn('text-[13px] tabular', ps === 'vencido' ? 'text-danger-fg' : 'text-muted')}>{formatDate(p.due_date)}</div>
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium text-ink">
                      {p.description}
                      {p.attachments.length > 0 && <Paperclip className="ml-1.5 inline h-3.5 w-3.5 text-faint" />}
                    </div>
                    <div className="truncate text-[12.5px] text-faint">
                      {[p.supplier_name, PAYMENT_CATEGORY[p.category], p.document, p.payer === 'escritorio' ? 'pago pelo escritório' : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="truncate text-[13px] text-muted">{stageName(p.stage_id) || <span className="text-faint">—</span>}</div>
                  <div className="text-[14px] font-semibold tabular text-ink md:text-right">{formatMoney(p.amount)}</div>
                  <div className="flex flex-col items-start gap-0.5">
                    <ToneBadge tone={PAYMENT_STATE[ps].tone} label={PAYMENT_STATE[ps].label} />
                    {p.paid_at && <span className="text-[11.5px] text-faint">em {formatDate(p.paid_at)}{p.method ? ` · ${PAYMENT_METHOD[p.method]}` : ''}</span>}
                    {!p.paid_at && p.approval === 'aprovado' && <span className="text-[11.5px] text-success-fg">aprovado pelo cliente</span>}
                  </div>
                  <div className="flex justify-end">
                    {!p.paid_at && p.approval !== 'recusado' && (
                      <IconButton label={`Marcar ${p.description} como pago`} onClick={() => setPaying(p)}>
                        <Check className="h-4 w-4" strokeWidth={1.8} />
                      </IconButton>
                    )}
                    <IconButton label={`Editar ${p.description}`} onClick={() => setEditing(p)}>
                      <Pencil className="h-4 w-4" strokeWidth={1.6} />
                    </IconButton>
                    <IconButton label={`Excluir ${p.description}`} onClick={() => setRemoving(p)} className="hover:text-danger-fg">
                      <Trash2 className="h-4 w-4" strokeWidth={1.6} />
                    </IconButton>
                  </div>
                  {approval?.status === 'pendente' && (
                    <div className="md:col-span-6">
                      <ApprovalLink approval={approval} compact />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3 text-[13px] text-muted">
            {list.length} {list.length === 1 ? 'pagamento' : 'pagamentos'} · <b className="font-semibold tabular text-ink">{formatMoney(total)}</b>
          </div>
        </div>
      )}

      {editing && <PaymentModal summary={summary} payment={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {paying && (
        <PayModal
          payment={paying}
          onClose={() => setPaying(null)}
          onPay={async (date, method) => {
            await savePayment(obra, { ...paying, paid_at: date, method }, false, false);
            toast.success('Pagamento marcado como pago.');
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title="Excluir pagamento?"
          message={`${removing.description} · ${formatMoney(removing.amount)}`}
          confirmLabel="Excluir"
          danger
          onConfirm={() => deletePayment(removing).catch(toast.error)}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function PayModal({ payment, onClose, onPay }: { payment: ObraPayment; onClose: () => void; onPay: (date: string, method: ObraPaymentMethod | null) => Promise<void> }) {
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState<ObraPaymentMethod | ''>(payment.method ?? 'pix');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      size="sm"
      title="Marcar como pago"
      subtitle={`${payment.description} · ${formatMoney(payment.amount)}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onPay(date, method || null);
                onClose();
              } catch (e) {
                toast.error(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirmar pagamento
          </Button>
        </>
      }
    >
      {payment.approval === 'pendente' && (
        <p className="mb-4 rounded-[10px] bg-warning-bg px-3 py-2 text-[13px] text-warning-fg">O cliente ainda não aprovou este pagamento.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Pago em">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value || today())} />
        </Field>
        <Field label="Forma">
          <Select value={method} onChange={(e) => setMethod(e.target.value as ObraPaymentMethod)}>
            {(Object.keys(PAYMENT_METHOD) as ObraPaymentMethod[]).map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD[m]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

/** Lançar ou editar um pagamento da obra, com nota/comprovante e pedido de aprovação do cliente. */
export function PaymentModal({ summary, payment, onClose }: { summary: ObraSummary; payment: ObraPayment | null; onClose: () => void }) {
  const { db, me } = useData();
  const { savePayment } = useObraActions();
  const toast = useToast();
  const { obra, stages } = summary;
  const [form, setForm] = useState<ObraPayment>(
    () =>
      payment ?? {
        id: uid(),
        obra_id: obra.id,
        stage_id: null,
        supplier_id: null,
        supplier_name: null,
        description: '',
        category: 'material',
        amount: 0,
        due_date: today(),
        paid_at: null,
        method: 'pix',
        payer: 'cliente',
        approval: 'nao_requer',
        approval_id: null,
        document: null,
        attachments: [],
        notes: null,
        created_by: me.id,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
  );
  const [askApproval, setAskApproval] = useState(!payment);
  const [paidNow, setPaidNow] = useState(!!payment?.paid_at);
  const [busy, setBusy] = useState(false);
  const [newSupplier, setNewSupplier] = useState(false);
  const set = (c: Partial<ObraPayment>) => setForm((f) => ({ ...f, ...c }));
  const suppliers = db.obra_suppliers.filter((s) => s.active || s.id === form.supplier_id).sort((a, b) => a.name.localeCompare(b.name));
  const canAsk = !paidNow && (form.approval === 'nao_requer' || form.approval === 'recusado');

  const close = () => {
    if (!payment) removeTeamFiles(form.attachments.map((a) => a.path));
    onClose();
  };

  const save = async () => {
    if (!form.description.trim()) return toast.error('Descreva o pagamento (ex.: Medição 1 — elétrica).');
    if (!(form.amount > 0)) return toast.error('Informe o valor.');
    setBusy(true);
    try {
      const row: ObraPayment = { ...form, paid_at: paidNow ? (form.paid_at ?? today()) : null };
      await savePayment(obra, row, !payment, askApproval && canAsk);
      toast.success(askApproval && canAsk ? 'Pagamento lançado. Envie o link para o cliente aprovar.' : 'Pagamento salvo.');
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      size="lg"
      title={payment ? 'Editar pagamento' : 'Novo pagamento'}
      subtitle={`${obra.code} · ${obra.name}`}
      onClose={close}
      footer={
        <>
          <Button onClick={close}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-6">
          <Field label="Descrição" required className="sm:col-span-4">
            <Input value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Ex.: Medição 1 — elétrica, Porcelanato da sala" autoFocus />
          </Field>
          <Field label="Valor" required className="sm:col-span-2">
            <MoneyInput value={form.amount || null} onChange={(v) => set({ amount: v ?? 0 })} />
          </Field>
          <Field label="Fornecedor" className="sm:col-span-3">
            <Select
              value={form.supplier_id ?? (form.supplier_name ? '__text' : '')}
              onChange={(e) => {
                if (e.target.value === '__new') return setNewSupplier(true);
                const s = suppliers.find((x) => x.id === e.target.value);
                set({ supplier_id: s?.id ?? null, supplier_name: s?.name ?? null });
              }}
            >
              <option value="">Nenhum</option>
              {form.supplier_name && !form.supplier_id && <option value="__text">{form.supplier_name}</option>}
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.trade ? `${s.name} · ${s.trade}` : s.name}
                </option>
              ))}
              <option value="__new">+ Cadastrar fornecedor…</option>
            </Select>
          </Field>
          <Field label="Etapa" className="sm:col-span-3">
            <Select value={form.stage_id ?? ''} onChange={(e) => set({ stage_id: e.target.value || null })}>
              <option value="">Sem etapa</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo" className="sm:col-span-2">
            <Select value={form.category} onChange={(e) => set({ category: e.target.value as ObraPaymentCategory })}>
              {(Object.keys(PAYMENT_CATEGORY) as ObraPaymentCategory[]).map((c) => (
                <option key={c} value={c}>
                  {PAYMENT_CATEGORY[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Vencimento" className="sm:col-span-2">
            <Input type="date" value={form.due_date} onChange={(e) => set({ due_date: e.target.value || today() })} />
          </Field>
          <Field label="Forma" className="sm:col-span-2">
            <Select value={form.method ?? ''} onChange={(e) => set({ method: (e.target.value || null) as ObraPaymentMethod | null })}>
              <option value="">—</option>
              {(Object.keys(PAYMENT_METHOD) as ObraPaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nº da nota / boleto" className="sm:col-span-2">
            <Input value={form.document ?? ''} onChange={(e) => set({ document: e.target.value || null })} />
          </Field>
          <Field label="Quem paga" className="sm:col-span-2">
            <Select value={form.payer} onChange={(e) => set({ payer: e.target.value as ObraPayment['payer'] })}>
              <option value="cliente">Cliente (direto ao fornecedor)</option>
              <option value="escritorio">Escritório</option>
            </Select>
          </Field>
          <Field label="Observações" className="sm:col-span-6">
            <Textarea rows={2} value={form.notes ?? ''} onChange={(e) => set({ notes: e.target.value || null })} />
          </Field>
        </div>

        <FilesSection
          id={`pay-${form.id}`}
          title="Nota fiscal, boleto e comprovante"
          files={form.attachments}
          folder={`obras/${obra.id}/pagamentos`}
          onChange={async (next) => set({ attachments: next })}
          canRemove={() => true}
          empty="Anexe a nota, o boleto ou o comprovante (PDF ou foto)."
          inputLabel="Anexar nota ou comprovante"
        />

        <div className="space-y-3 rounded-[12px] border border-line bg-subtle p-4">
          <Checkbox checked={paidNow} onChange={setPaidNow} label="Já foi pago" />
          {paidNow && (
            <Field label="Pago em" className="max-w-[200px]">
              <Input type="date" value={form.paid_at ?? today()} onChange={(e) => set({ paid_at: e.target.value || today() })} />
            </Field>
          )}
          {canAsk ? (
            <Checkbox
              checked={askApproval}
              onChange={setAskApproval}
              label={
                <span className="inline-flex items-center gap-1.5">
                  <ThumbsUp className="h-3.5 w-3.5" /> Pedir a aprovação do cliente antes de pagar (gera o link)
                </span>
              }
            />
          ) : (
            !paidNow && (
              <p className="text-[13px] text-muted">
                Aprovação do cliente: <b>{form.approval === 'pendente' ? 'aguardando' : form.approval === 'aprovado' ? 'aprovado' : '—'}</b>
              </p>
            )
          )}
        </div>
      </div>
      {newSupplier && (
        <SupplierModal
          supplier={null}
          onClose={() => setNewSupplier(false)}
          onSaved={(s) => set({ supplier_id: s.id, supplier_name: s.name })}
        />
      )}
    </Modal>
  );
}
