import { useState } from 'react';
import { Check, Copy, ExternalLink, MessageCircle, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { APPROVAL_KIND, APPROVAL_STATUS, approvalMessage, approvalUrl, whatsappLink } from '../../lib/obras';
import type { ApprovalKind, Obra, ObraApproval } from '../../lib/types';
import { cn, formatDate, formatDateTime, formatMoney, today } from '../../lib/utils';
import { Button, Field, Input, Modal, Segmented, Select, Textarea } from '../ui';
import { MoneyInput } from '../finance/MoneyInput';
import { ToneBadge } from './parts';
import { useObraActions } from './useObraActions';

/** Link do pedido com copiar, WhatsApp e abrir. */
export function ApprovalLink({ approval, compact }: { approval: ObraApproval; compact?: boolean }) {
  const { settings } = useData();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const url = approvalUrl(approval.token);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.info(url);
    }
  };
  const wa = whatsappLink(approval.client_phone, approvalMessage(approval, settings.office_name, formatMoney));
  return (
    <div className={cn('flex flex-wrap items-center gap-2', !compact && 'rounded-[12px] border border-line bg-subtle p-2.5')}>
      {!compact && (
        <code className="min-w-0 flex-1 truncate px-1 text-[12.5px] text-muted" title={url} data-approval-url>
          {url}
        </code>
      )}
      <Button size="sm" icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" strokeWidth={1.6} />} onClick={copy}>
        {copied ? 'Copiado' : 'Copiar link'}
      </Button>
      <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-line-strong bg-surface px-3 text-sm font-medium text-ink shadow-xs hover:bg-canvas">
        <MessageCircle className="h-4 w-4" strokeWidth={1.6} />
        WhatsApp
      </a>
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-[9px] px-2.5 text-sm text-muted hover:bg-ink/5 hover:text-ink" title="Ver como o cliente vê">
        <ExternalLink className="h-4 w-4" strokeWidth={1.6} />
        Ver
      </a>
    </div>
  );
}

/** A equipe registra a resposta que o cliente deu por outro meio (WhatsApp, reunião, e-mail). */
export function AnswerModal({ approval, onClose }: { approval: ObraApproval; onClose: () => void }) {
  const { answerApproval } = useObraActions();
  const toast = useToast();
  const [status, setStatus] = useState<'aprovado' | 'recusado'>('aprovado');
  const [name, setName] = useState(approval.client_name ?? '');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await answerApproval(approval, status, name, comment || null);
      toast.success(status === 'aprovado' ? 'Aprovação registrada.' : 'Recusa registrada.');
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Registrar resposta do cliente"
      subtitle={approval.title}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Registrar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented<'aprovado' | 'recusado'>
          value={status}
          onChange={setStatus}
          options={[
            { id: 'aprovado', label: 'Aprovou', icon: <ThumbsUp /> },
            { id: 'recusado', label: 'Recusou', icon: <ThumbsDown /> },
          ]}
        />
        <Field label="Quem respondeu">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Como / observação" hint="Ex.: aprovou pelo WhatsApp em 12/10.">
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** Pedido avulso: aditivo, escolha de material, detalhe de projeto, medição… */
export function NewApprovalModal({ obra, onClose, onCreated }: { obra: Obra; onClose: () => void; onCreated?: (a: ObraApproval) => void }) {
  const { requestApproval } = useObraActions();
  const toast = useToast();
  const [kind, setKind] = useState<ApprovalKind>('aditivo');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!title.trim()) return toast.error('Diga o que o cliente precisa aprovar.');
    setBusy(true);
    try {
      const a = await requestApproval({
        kind,
        title,
        description,
        amount,
        obra,
        due_date: due || null,
        snapshot: { facts: [{ label: 'Obra', value: obra.name }, ...(due ? [{ label: 'Responder até', value: formatDate(due) }] : [])], total: amount, notes: description.trim() || null },
      });
      toast.success('Pedido criado. Envie o link ao cliente.');
      onCreated?.(a);
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Pedir aprovação do cliente"
      subtitle="O cliente recebe um link, vê os detalhes e aprova ou recusa — sem login."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Criar pedido
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo">
          <Select value={kind} onChange={(e) => setKind(e.target.value as ApprovalKind)}>
            {(Object.keys(APPROVAL_KIND) as ApprovalKind[])
              .filter((k) => k !== 'orcamento' && k !== 'pagamento')
              .map((k) => (
                <option key={k} value={k}>
                  {APPROVAL_KIND[k]}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Responder até">
          <Input type="date" value={due} min={today()} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="O que precisa ser aprovado" required className="sm:col-span-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Troca do porcelanato da sala por 120×120" />
        </Field>
        <Field label="Detalhes" className="sm:col-span-2">
          <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Explique a mudança, o motivo e o impacto no prazo." />
        </Field>
        <Field label={kind === 'aditivo' ? 'Valor do aditivo' : 'Valor (opcional)'} hint={kind === 'aditivo' ? 'Aprovado, soma ao valor contratado da obra.' : undefined}>
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
      </div>
    </Modal>
  );
}

/** Linha de um pedido de aprovação: tipo, título, valor, status e ações. */
export function ApprovalRow({ approval, onAnswer, onCancel }: { approval: ObraApproval; onAnswer: () => void; onCancel: () => void }) {
  const { maps } = useData();
  const st = APPROVAL_STATUS[approval.status];
  const by = approval.requested_by ? maps.profiles[approval.requested_by] : null;
  return (
    <li className="py-4" data-approval={approval.status}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="text-[12px] font-medium uppercase tracking-[0.06em] text-faint">{APPROVAL_KIND[approval.kind]}</div>
          <div className="mt-0.5 text-[14.5px] font-semibold text-ink">{approval.title}</div>
          {approval.description && <p className="mt-1 whitespace-pre-line text-[13px] text-muted">{approval.description}</p>}
          <div className="mt-1.5 text-[12px] text-faint">
            Pedido em {formatDateTime(approval.requested_at)}
            {by && <> por {by.name}</>}
            {approval.due_date && approval.status === 'pendente' && <> · responder até {formatDate(approval.due_date)}</>}
          </div>
          {approval.answered_at && (
            <div className={cn('mt-1.5 text-[12.5px]', approval.status === 'aprovado' ? 'text-success-fg' : approval.status === 'recusado' ? 'text-danger-fg' : 'text-muted')}>
              {st.label} {approval.answered_name ? `por ${approval.answered_name}` : ''} em {formatDateTime(approval.answered_at)}
              {approval.answered_via === 'manual' ? ' (registrado pela equipe)' : approval.answered_via === 'link' ? ' (pelo link)' : ''}
              {approval.answer_comment && <span className="block text-muted">“{approval.answer_comment}”</span>}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {approval.amount != null && <span className="font-display text-[16px] font-semibold tabular text-ink">{formatMoney(approval.amount)}</span>}
          <ToneBadge tone={st.tone} label={st.label} />
        </div>
      </div>
      {approval.status === 'pendente' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ApprovalLink approval={approval} compact />
          <Button size="sm" variant="ghost" onClick={onAnswer}>
            Registrar resposta
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} className="text-muted">
            Cancelar pedido
          </Button>
        </div>
      )}
    </li>
  );
}

