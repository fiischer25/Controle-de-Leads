import { ArrowLeftRight, Check, Paperclip } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import type { FinanceEntry } from '../../lib/types';
import { cn, formatMoney, formatDateShort, today } from '../../lib/utils';
import { settledDate } from '../../lib/finance';
import { Badge } from '../ui';
import { STATUS_STYLE, useFinance } from './useFinance';

/**
 * Lista de lançamentos: data, descrição (categoria · projeto · parcela), conta, valor e
 * status, com "Receber"/"Pagar" direto na linha. Clique na linha abre a edição.
 */
export function EntryList({
  entries,
  onOpen,
  showProject = true,
  compact = false,
  empty = 'Nenhum lançamento.',
}: {
  entries: FinanceEntry[];
  onOpen: (e: FinanceEntry) => void;
  showProject?: boolean;
  /** Colunas estreitas: sem a coluna da conta. */
  compact?: boolean;
  empty?: string;
}) {
  const { maps } = useData();
  const fin = useFinance();
  const toast = useToast();

  if (entries.length === 0) return <p className="border-t border-hairline py-4 text-[13px] text-faint">{empty}</p>;

  const settle = async (e: FinanceEntry) => {
    try {
      const date = settledDate(e.due_date, today());
      await fin.setPaid(e, date);
      toast.success(`${e.kind === 'receita' ? 'Recebimento' : 'Pagamento'} registrado em ${formatDateShort(date)}.`);
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <ul>
      {entries.map((e) => {
        const st = fin.status(e);
        const transfer = e.kind === 'transferencia';
        const category = e.category_id ? fin.categoryMap[e.category_id] : null;
        const project = e.project_id ? maps.projects[e.project_id] : null;
        const client = !project && e.client_id ? maps.clients[e.client_id] : null;
        const account = e.account_id ? fin.accountMap[e.account_id] : null;
        const to = e.to_account_id ? fin.accountMap[e.to_account_id] : null;
        const sub = [
          transfer ? `${account?.name ?? '—'} → ${to?.name ?? '—'}` : (category?.name ?? 'Sem categoria'),
          showProject ? (project?.name ?? client?.name) : null,
        ].filter(Boolean);
        // Nº da parcela fica fora do trecho que pode ser cortado
        const counter = e.installments ? `${e.installment}/${e.installments}` : null;
        return (
          <li
            key={e.id}
            className={cn(
              'group grid min-h-14 grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-x-4 border-t border-hairline',
              compact ? 'md:grid-cols-[56px_minmax(0,1fr)_128px_172px]' : 'md:grid-cols-[60px_minmax(0,1fr)_150px_136px_172px]',
            )}
          >
            <button type="button" onClick={() => onOpen(e)} className="contents text-left">
              <span className={cn('py-3 text-[12.5px] tabular', st === 'vencido' ? 'text-danger-fg' : 'text-muted')}>
                {formatDateShort(e.paid_at ?? e.due_date)}
              </span>
              <span className="min-w-0 py-3">
                <span className="flex min-w-0 items-center gap-1.5 text-[13.5px] text-ink">
                  {transfer && <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-faint" />}
                  <span className="truncate group-hover:underline group-hover:decoration-stone-300 group-hover:underline-offset-4">{e.description}</span>
                  {(e.attachments?.length ?? 0) > 0 && (
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-faint" aria-label={`${e.attachments!.length} anexo(s)`} />
                  )}
                </span>
                <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-faint">
                  {category && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} aria-hidden />}
                  <span className="truncate">{sub.join(' · ')}</span>
                  {counter && <span className="shrink-0 tabular">· {counter}</span>}
                </span>
              </span>
              {!compact && <span className="hidden truncate py-3 text-[13px] text-muted md:block">{transfer ? '' : (account?.name ?? 'Sem conta')}</span>}
              <span
                className={cn(
                  'py-3 text-right text-[13.5px] tabular',
                  e.kind === 'receita' ? 'text-success-fg' : e.kind === 'despesa' ? 'text-ink' : 'text-muted',
                )}
              >
                {e.kind === 'despesa' ? '−' : e.kind === 'receita' ? '+' : ''}
                {formatMoney(e.amount)}
              </span>
            </button>
            <span className="col-span-3 -mt-2 flex justify-end whitespace-nowrap pb-3 md:col-span-1 md:mt-0 md:pb-0">
              {transfer ? (
                <span className="text-[12.5px] text-faint">Transferência</span>
              ) : st === 'pago' ? (
                <Badge tone="success" dot title={`Em ${formatDateShort(e.paid_at)}`}>
                  {e.kind === 'receita' ? 'Recebido' : 'Pago'}
                </Badge>
              ) : (
                <span className="flex items-center gap-2">
                  {st === 'vencido' && <Badge tone={STATUS_STYLE.vencido.tone}>Vencido</Badge>}
                  <button
                    type="button"
                    onClick={() => settle(e)}
                    className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-medium text-accent-fg transition-colors hover:bg-ink/5"
                    title={`Registrar ${e.kind === 'receita' ? 'recebimento' : 'pagamento'} em ${formatDateShort(settledDate(e.due_date, today()))}`}
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={2} />
                    {e.kind === 'receita' ? 'Receber' : 'Pagar'}
                  </button>
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
