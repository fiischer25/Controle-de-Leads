import { useMemo, useState } from 'react';
import { FileText, Paperclip, Trash2, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { splitEqual, type EntryDraft, type RepeatMode } from '../../lib/finance';
import type { FinanceEntry, FinanceKind } from '../../lib/types';
import { formatMoney, today } from '../../lib/utils';
import { Button, Checkbox, ConfirmDialog, Field, IconButton, Input, Modal, Segmented, Select, Spinner, Textarea } from '../ui';
import { MoneyInput } from './MoneyInput';
import { ATTACHMENT_ACCEPT, formatBytes, MAX_ATTACHMENT_BYTES, useFinance } from './useFinance';

const KIND_LABEL: Record<FinanceKind, string> = { receita: 'Receita', despesa: 'Despesa', transferencia: 'Transferência' };

/** Cadastro e edição de lançamento: conta a receber, conta a pagar ou transferência. */
export function EntryFormModal({
  entry,
  defaults,
  onClose,
}: {
  entry?: FinanceEntry;
  defaults?: Partial<EntryDraft>;
  onClose: () => void;
}) {
  const { db, maps } = useData();
  const fin = useFinance();
  const toast = useToast();
  const activeAccounts = fin.accounts.filter((a) => a.active || a.id === entry?.account_id || a.id === entry?.to_account_id);
  const [v, setV] = useState<Omit<EntryDraft, 'created_by'>>(() => ({
    kind: entry?.kind ?? defaults?.kind ?? 'despesa',
    description: entry?.description ?? defaults?.description ?? '',
    amount: entry?.amount ?? defaults?.amount ?? 0,
    due_date: entry?.due_date ?? defaults?.due_date ?? today(),
    paid_at: entry ? entry.paid_at : (defaults?.paid_at ?? null),
    account_id: entry ? entry.account_id : (defaults?.account_id ?? activeAccounts[0]?.id ?? null),
    to_account_id: entry?.to_account_id ?? defaults?.to_account_id ?? null,
    category_id: entry?.category_id ?? defaults?.category_id ?? null,
    client_id: entry?.client_id ?? defaults?.client_id ?? null,
    project_id: entry?.project_id ?? defaults?.project_id ?? null,
    document: entry?.document ?? defaults?.document ?? null,
    notes: entry?.notes ?? defaults?.notes ?? null,
  }));
  const [mode, setMode] = useState<RepeatMode>('unica');
  const [count, setCount] = useState(12);
  const [applyNext, setApplyNext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState(false);
  const [deleteNext, setDeleteNext] = useState(false);
  // Comprovantes: na edição sobem na hora; no cadastro, depois de salvar
  const [pending, setPending] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const live = entry ? (fin.entries.find((x) => x.id === entry.id) ?? entry) : null;
  const attachments = live?.attachments ?? [];

  const addFiles = async (files: File[]) => {
    const big = files.find((f) => f.size > MAX_ATTACHMENT_BYTES);
    if (big) return toast.error(`"${big.name}" tem mais de 10 MB.`);
    if (!live) return setPending((p) => [...p, ...files]);
    setUploading(true);
    try {
      await fin.attachFiles(live, files);
      toast.success(files.length === 1 ? 'Arquivo anexado.' : `${files.length} arquivos anexados.`);
    } catch (e) {
      toast.error(e);
    } finally {
      setUploading(false);
    }
  };

  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV((prev) => ({ ...prev, [k]: value }));
  const isTransfer = v.kind === 'transferencia';
  const cats = fin.categories.filter((c) => c.kind === v.kind && (c.active || c.id === v.category_id));
  const projects = useMemo(() => [...db.projects].sort((a, b) => a.name.localeCompare(b.name)), [db.projects]);
  const clients = useMemo(() => [...db.clients].sort((a, b) => a.name.localeCompare(b.name)), [db.clients]);
  const nextCount = entry ? fin.nextInSeries(entry).length : 0;

  const setKind = (kind: FinanceKind) =>
    setV((prev) => ({
      ...prev,
      kind,
      category_id: fin.categoryMap[prev.category_id ?? '']?.kind === kind ? prev.category_id : null,
      paid_at: kind === 'transferencia' ? (prev.paid_at ?? prev.due_date) : prev.paid_at,
    }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!v.description.trim()) e.description = 'Descreva o lançamento.';
    if (!v.amount || v.amount <= 0) e.amount = 'Informe o valor.';
    if (!v.due_date) e.due_date = 'Informe a data.';
    if (isTransfer) {
      if (!v.account_id) e.account_id = 'Escolha a conta de origem.';
      if (!v.to_account_id) e.to_account_id = 'Escolha a conta de destino.';
      if (v.account_id && v.account_id === v.to_account_id) e.to_account_id = 'Escolha uma conta diferente da origem.';
    }
    if (!entry && mode !== 'unica' && (count < 2 || count > 120)) e.count = 'Entre 2 e 120.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setBusy(true);
    const payload = {
      ...v,
      description: v.description.trim(),
      document: v.document?.trim() || null,
      notes: v.notes?.trim() || null,
      category_id: isTransfer ? null : v.category_id,
      to_account_id: isTransfer ? v.to_account_id : null,
      // Transferência acontece na data informada
      paid_at: isTransfer ? v.due_date : v.paid_at,
    };
    try {
      if (entry) {
        await fin.updateEntry(entry, payload, applyNext);
        toast.success('Lançamento atualizado.');
      } else {
        const rows = await fin.createEntries(payload, isTransfer ? 'unica' : mode, count);
        toast.success(rows.length > 1 ? `${rows.length} lançamentos criados.` : `${KIND_LABEL[v.kind]} lançada.`);
        if (pending.length) {
          try {
            await fin.attachFiles(rows[0], pending);
          } catch (e) {
            toast.error(e);
          }
        }
      }
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!entry) return;
    try {
      await fin.deleteEntry(entry, deleteNext);
      toast.success('Lançamento excluído.');
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };

  const preview =
    !entry && !isTransfer && mode !== 'unica' && v.amount > 0 && count >= 2
      ? mode === 'parcelas'
        ? `${count}× de ${formatMoney(splitEqual(v.amount, count)[count - 1])}`
        : `${count} meses de ${formatMoney(v.amount)} (total ${formatMoney(v.amount * count)})`
      : null;

  return (
    <Modal
      title={entry ? `Editar ${KIND_LABEL[entry.kind].toLowerCase()}` : 'Novo lançamento'}
      subtitle={entry?.installments ? `Parcela ${entry.installment} de ${entry.installments}` : undefined}
      onClose={onClose}
      size="lg"
      footer={
        <>
          {entry && (
            <Button variant="ghost" className="mr-auto text-danger-fg" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleting(true)}>
              Excluir
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {entry ? 'Salvar' : 'Lançar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Segmented<FinanceKind>
            value={v.kind}
            onChange={setKind}
            options={[
              { id: 'receita', label: 'Receita' },
              { id: 'despesa', label: 'Despesa' },
              { id: 'transferencia', label: 'Transferência' },
            ]}
          />
        </div>
        <Field label="Descrição" required error={errors.description} className="sm:col-span-2">
          <Input
            value={v.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder={v.kind === 'receita' ? 'Ex.: Honorários CASA J.D. · 1ª parcela' : v.kind === 'despesa' ? 'Ex.: Aluguel da sala' : 'Ex.: Reforço do caixa'}
            autoFocus={!entry}
          />
        </Field>
        <Field label={!entry && mode === 'parcelas' ? 'Valor total' : 'Valor'} required error={errors.amount}>
          <MoneyInput value={v.amount || null} onChange={(n) => set('amount', n ?? 0)} invalid={!!errors.amount} aria-label="Valor" />
        </Field>
        <Field label={isTransfer ? 'Data' : !entry && mode !== 'unica' ? 'Primeiro vencimento' : 'Vencimento'} required error={errors.due_date}>
          <Input type="date" value={v.due_date} onChange={(e) => set('due_date', e.target.value)} invalid={!!errors.due_date} />
        </Field>

        <Field label={isTransfer ? 'De (conta de origem)' : v.kind === 'receita' ? 'Conta que recebe' : 'Conta que paga'} error={errors.account_id}>
          <Select value={v.account_id ?? ''} onChange={(e) => set('account_id', e.target.value || null)} invalid={!!errors.account_id} aria-label="Conta">
            {!isTransfer && <option value="">Sem conta definida</option>}
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        {isTransfer ? (
          <Field label="Para (conta de destino)" required error={errors.to_account_id}>
            <Select value={v.to_account_id ?? ''} onChange={(e) => set('to_account_id', e.target.value || null)} invalid={!!errors.to_account_id} aria-label="Conta de destino">
              <option value="">Escolha a conta</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Categoria">
            <Select value={v.category_id ?? ''} onChange={(e) => set('category_id', e.target.value || null)} aria-label="Categoria">
              <option value="">Sem categoria</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {!isTransfer && (
          <>
            <Field label="Projeto" hint="Liga o lançamento à rentabilidade do projeto.">
              <Select
                value={v.project_id ?? ''}
                onChange={(e) => {
                  const project = maps.projects[e.target.value];
                  setV((prev) => ({ ...prev, project_id: project?.id ?? null, client_id: project ? project.client_id : prev.client_id }));
                }}
                aria-label="Projeto"
              >
                <option value="">Nenhum (despesa ou receita do escritório)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            {clients.length > 0 && (
              <Field label="Cliente">
                <Select value={v.client_id ?? ''} onChange={(e) => set('client_id', e.target.value || null)} disabled={!!v.project_id} aria-label="Cliente">
                  <option value="">Nenhum</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </>
        )}

        {!isTransfer && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 sm:col-span-2">
            <Checkbox
              checked={!!v.paid_at}
              onChange={(on) => set('paid_at', on ? (v.due_date <= today() ? v.due_date : today()) : null)}
              label={v.kind === 'receita' ? 'Já foi recebido' : 'Já foi pago'}
            />
            {v.paid_at && (
              <label className="flex items-center gap-2 text-[13px] text-muted">
                em
                <Input type="date" value={v.paid_at} onChange={(e) => set('paid_at', e.target.value || null)} className="h-8 w-auto" aria-label="Data do pagamento" />
              </label>
            )}
          </div>
        )}

        {!entry && !isTransfer && (
          <div className="space-y-3 rounded-[12px] bg-canvas px-4 py-3 sm:col-span-2">
            <div className="flex flex-wrap items-center gap-3">
              <Segmented<RepeatMode>
                value={mode}
                onChange={setMode}
                options={[
                  { id: 'unica', label: 'Não repete' },
                  { id: 'parcelas', label: 'Parcelado' },
                  { id: 'mensal', label: 'Todo mês' },
                ]}
              />
              {mode !== 'unica' && (
                <label className="flex items-center gap-2 text-[13px] text-muted">
                  {mode === 'parcelas' ? 'em' : 'por'}
                  <Input
                    type="number"
                    min={2}
                    max={120}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="h-8 w-20"
                    invalid={!!errors.count}
                    aria-label={mode === 'parcelas' ? 'Número de parcelas' : 'Número de meses'}
                  />
                  {mode === 'parcelas' ? 'parcelas mensais' : 'meses'}
                </label>
              )}
            </div>
            {preview && <p className="text-[12.5px] text-muted">{preview}. Só o primeiro fica marcado como pago, se for o caso.</p>}
          </div>
        )}

        <Field label="Documento / NF">
          <Input value={v.document ?? ''} onChange={(e) => set('document', e.target.value)} placeholder="Nº da nota, boleto, recibo…" />
        </Field>
        <Field label="Observações" className="sm:col-span-2">
          <Textarea value={v.notes ?? ''} onChange={(e) => set('notes', e.target.value)} rows={2} />
        </Field>

        <div className="sm:col-span-2">
          <div className="label">Comprovantes e notas</div>
          {(attachments.length > 0 || pending.length > 0) && (
            <ul className="mb-2 divide-y divide-hairline rounded-[10px] border border-hairline">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                  <FileText className="h-4 w-4 shrink-0 text-faint" />
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-ink hover:underline hover:decoration-stone-300 hover:underline-offset-4"
                    onClick={() => fin.openAttachment(a).catch(toast.error)}
                  >
                    {a.name}
                  </button>
                  <span className="shrink-0 text-[12px] text-faint">{formatBytes(a.size)}</span>
                  <IconButton
                    label={`Remover ${a.name}`}
                    size="xs"
                    onClick={() => live && fin.removeAttachment(live, a).then(() => toast.success('Arquivo removido.')).catch(toast.error)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </IconButton>
                </li>
              ))}
              {pending.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                  <FileText className="h-4 w-4 shrink-0 text-faint" />
                  <span className="min-w-0 flex-1 truncate text-ink">{f.name}</span>
                  <span className="shrink-0 text-[12px] text-faint">{formatBytes(f.size)} · enviado ao salvar</span>
                  <IconButton label={`Remover ${f.name}`} size="xs" onClick={() => setPending((p) => p.filter((_, j) => j !== i))}>
                    <X className="h-3.5 w-3.5" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-accent-fg transition-colors hover:bg-ink/5">
            {uploading ? <Spinner className="h-3.5 w-3.5" /> : <Paperclip className="h-3.5 w-3.5" />}
            Anexar comprovante, boleto ou nota
            <input
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              className="sr-only"
              aria-label="Anexar arquivo"
              disabled={uploading}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                if (files.length) addFiles(files);
              }}
            />
          </label>
          <span className="ml-2 text-[12px] text-faint">PDF, imagem ou XML da NF-e, até 10 MB</span>
        </div>

        {entry?.series_id && nextCount > 1 && (
          <Checkbox
            className="sm:col-span-2"
            checked={applyNext}
            onChange={setApplyNext}
            label={`Aplicar também às próximas parcelas em aberto (${nextCount - 1})`}
          />
        )}
      </div>

      {deleting && entry && (
        <ConfirmDialog
          title="Excluir lançamento?"
          danger
          confirmLabel="Excluir"
          message={
            <div className="space-y-3">
              <p>
                {entry.description} · {formatMoney(entry.amount)}
              </p>
              {entry.series_id && nextCount > 1 && (
                <Checkbox checked={deleteNext} onChange={setDeleteNext} label={`Excluir também as próximas parcelas em aberto (${nextCount - 1})`} />
              )}
            </div>
          }
          onConfirm={remove}
          onClose={() => setDeleting(false)}
        />
      )}
    </Modal>
  );
}
