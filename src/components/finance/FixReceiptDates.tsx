import { useMemo, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { pastReceipts, type PastReceipt } from '../../lib/finance';
import { formatDate, formatMoney, MONTHS_FULL } from '../../lib/utils';
import { Button, Checkbox, Modal } from '../ui';
import { useFinance } from './useFinance';

const DISMISS_KEY = 'airos:recebimentos-revisados';

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Aviso no Financeiro: parcelas de meses passados lançadas agora (projetos já em andamento
 * cadastrados depois) que estão contando no mês atual: recebidas com a data do dia ou ainda em
 * aberto como "a receber vencido". Corrige de uma vez: cada uma recebida na data da parcela.
 * `projectId`: só as parcelas daquele projeto (aba Financeiro do projeto).
 */
export function FixReceiptDates({ projectId }: { projectId?: string } = {}) {
  const { maps } = useData();
  const fin = useFinance();
  const toast = useToast();
  const [dismissed, setDismissed] = useState(readDismissed);
  const candidates = useMemo(
    () => pastReceipts(fin.entries).filter((c) => !dismissed.includes(c.entry.id) && (!projectId || c.entry.project_id === projectId)),
    [fin.entries, dismissed, projectId],
  );
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  if (!candidates.length) return null;
  const total = candidates.reduce((a, c) => a + c.entry.amount, 0);

  const dismiss = (ids: string[]) => {
    const next = [...dismissed, ...ids];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* só lembra neste navegador */
    }
  };

  const apply = async () => {
    const chosen = candidates.filter((c) => picked.has(c.entry.id));
    setBusy(true);
    try {
      for (const c of chosen) await fin.updateEntry(c.entry, { paid_at: c.entry.due_date });
      toast.success(`${chosen.length} ${chosen.length === 1 ? 'parcela acertada' : 'parcelas acertadas'}: cada uma recebida no mês da parcela.`);
      dismiss(candidates.filter((c) => !picked.has(c.entry.id)).map((c) => c.entry.id));
      setOpen(false);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const group = (kind: PastReceipt['kind'], title: string, hint: string) => {
    const items = candidates.filter((c) => c.kind === kind);
    if (!items.length) return null;
    return (
      <section className="mb-5 last:mb-0">
        <h3 className="text-[13.5px] font-semibold text-ink">{title}</h3>
        <p className="mb-1 text-[12.5px] text-faint">{hint}</p>
        <ul className="divide-y divide-hairline-surface">
          {items.map(({ entry: e }) => {
            const project = e.project_id ? maps.projects[e.project_id] : null;
            return (
              <li key={e.id} className="flex items-start gap-3 py-2.5">
                <Checkbox
                  checked={picked.has(e.id)}
                  onChange={(on) =>
                    setPicked((s) => {
                      const n = new Set(s);
                      if (on) n.add(e.id);
                      else n.delete(e.id);
                      return n;
                    })
                  }
                  label={<span className="sr-only">Acertar {e.description}</span>}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] text-ink">{e.description}</div>
                  <div className="text-[12.5px] text-muted">
                    {project ? `${project.name} · ` : ''}
                    {kind === 'data' ? (
                      <>
                        Recebida em <s>{formatDate(e.paid_at)}</s> → <span className="text-ink">{formatDate(e.due_date)}</span>
                      </>
                    ) : (
                      <>
                        Em aberto, venceu {formatDate(e.due_date)} → <span className="text-ink">recebida em {formatDate(e.due_date)}</span>
                      </>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-[13.5px] tabular text-ink">{formatMoney(e.amount)}</span>
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  return (
    <>
      <section
        aria-label="Parcelas de meses passados para acertar"
        className="mb-6 flex flex-col gap-3 rounded-[14px] border border-line bg-warning-bg px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="flex items-start gap-2.5 text-[13.5px] text-ink">
          <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-warning-fg" strokeWidth={1.8} />
          <span>
            {candidates.length} {candidates.length === 1 ? 'parcela de mês passado está contando' : 'parcelas de meses passados estão contando'} em{' '}
            {MONTHS_FULL[new Date().getMonth()].toLowerCase()} ({formatMoney(total)}), e não no mês de cada parcela.
          </span>
        </p>
        <Button
          size="sm"
          variant="primary"
          className="shrink-0"
          onClick={() => {
            setPicked(new Set(candidates.map((c) => c.entry.id)));
            setOpen(true);
          }}
        >
          Revisar e acertar
        </Button>
      </section>
      {open && (
        <Modal
          title="Acertar parcelas de meses passados"
          subtitle="Cada parcela marcada passa a constar como recebida na data da parcela, no mês certo."
          onClose={() => setOpen(false)}
          size="lg"
          footer={
            <>
              <Button
                variant="ghost"
                className="mr-auto"
                onClick={() => {
                  dismiss(candidates.map((c) => c.entry.id));
                  setOpen(false);
                }}
              >
                Manter como está
              </Button>
              <Button onClick={() => setOpen(false)}>Cancelar</Button>
              <Button variant="primary" loading={busy} disabled={!picked.size} onClick={apply}>
                Acertar {picked.size} {picked.size === 1 ? 'parcela' : 'parcelas'}
              </Button>
            </>
          }
        >
          {group('aberta', 'Ainda como "a receber"', 'Lançadas depois do vencimento e nunca marcadas como recebidas: hoje contam como vencidas. Desmarque as que ainda não foram pagas.')}
          {group('data', 'Recebidas com a data de hoje', 'Marcadas como recebidas no dia do lançamento: passam para a data da parcela.')}
        </Modal>
      )}
    </>
  );
}
