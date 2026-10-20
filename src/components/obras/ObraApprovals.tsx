import { useState } from 'react';
import { Plus, ThumbsUp } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import type { ObraApproval } from '../../lib/types';
import { formatMoney } from '../../lib/utils';
import { Button, ConfirmDialog, EmptyState, MetricRow } from '../ui';
import { AnswerModal, ApprovalRow, NewApprovalModal } from './approvals';
import { Panel } from './parts';
import { useObraActions } from './useObraActions';
import type { ObraSummary } from './useObraSummaries';

/** Aprovações do cliente: orçamento, pagamentos, aditivos, materiais… com o link para responder. */
export function ObraApprovals({ summary }: { summary: ObraSummary }) {
  const { obra, approvals, money } = summary;
  const { cancelApproval } = useObraActions();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [answering, setAnswering] = useState<ObraApproval | null>(null);
  const [canceling, setCanceling] = useState<ObraApproval | null>(null);
  const sorted = [...approvals].sort((a, b) => b.requested_at.localeCompare(a.requested_at));
  const pending = sorted.filter((a) => a.status === 'pendente');
  const done = sorted.filter((a) => a.status !== 'pendente');
  const approved = approvals.filter((a) => a.status === 'aprovado').length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <MetricRow
          className="min-w-0 flex-1"
          items={[
            { label: 'Aguardando cliente', value: pending.length, tone: pending.length ? 'text-warning-fg' : undefined, sub: formatMoney(pending.reduce((a, x) => a + (x.amount ?? 0), 0)) },
            { label: 'Aprovados', value: approved, sub: `de ${approvals.filter((a) => a.status !== 'cancelado').length} pedidos` },
            { label: 'Aditivos aprovados', value: formatMoney(money.additives), sub: 'somam ao contratado' },
          ]}
        />
      </div>
      <div className="flex justify-end">
        <Button variant="primary" icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => setCreating(true)}>
          Pedir aprovação
        </Button>
      </div>
      {approvals.length === 0 ? (
        <div className="rounded-[16px] border border-line bg-surface shadow-card">
          <EmptyState
            icon={<ThumbsUp strokeWidth={1.6} />}
            title="Nenhum pedido de aprovação"
            description="Peça a aprovação do cliente para aditivos, troca de material, detalhes de projeto e pagamentos. Ele responde por um link, sem login, e fica registrado quem aprovou e quando."
            className="py-14"
          />
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <Panel title="Aguardando o cliente" id="aprov-pend">
              <ul className="divide-y divide-hairline-surface">
                {pending.map((a) => (
                  <ApprovalRow key={a.id} approval={a} onAnswer={() => setAnswering(a)} onCancel={() => setCanceling(a)} />
                ))}
              </ul>
            </Panel>
          )}
          {done.length > 0 && (
            <Panel title="Histórico" id="aprov-hist">
              <ul className="divide-y divide-hairline-surface">
                {done.map((a) => (
                  <ApprovalRow key={a.id} approval={a} onAnswer={() => setAnswering(a)} onCancel={() => setCanceling(a)} />
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
      {creating && <NewApprovalModal obra={obra} onClose={() => setCreating(false)} />}
      {answering && <AnswerModal approval={answering} onClose={() => setAnswering(null)} />}
      {canceling && (
        <ConfirmDialog
          title="Cancelar pedido?"
          message={`${canceling.title}. O link deixa de aceitar respostas.`}
          confirmLabel="Cancelar pedido"
          danger
          onConfirm={() => cancelApproval(canceling).catch(toast.error)}
          onClose={() => setCanceling(null)}
        />
      )}
    </div>
  );
}
