import { useMemo, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { backdatedReceipts } from '../../lib/finance';
import { formatDate, formatMoney } from '../../lib/utils';
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
 * Aviso no Financeiro: parcelas antigas (ex.: de projetos já em andamento cadastrados agora)
 * marcadas como recebidas com a data do dia, e não com a data combinada. Revisa e corrige de uma vez.
 */
export function FixReceiptDates() {
  const { maps } = useData();
  const fin = useFinance();
  const toast = useToast();
  const [dismissed, setDismissed] = useState(readDismissed);
  const candidates = useMemo(() => backdatedReceipts(fin.entries).filter((e) => !dismissed.includes(e.id)), [fin.entries, dismissed]);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  if (!candidates.length) return null;
  const months = new Set(candidates.map((e) => e.paid_at!.slice(0, 7))).size;

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
    const chosen = candidates.filter((e) => picked.has(e.id));
    setBusy(true);
    try {
      for (const e of chosen) await fin.updateEntry(e, { paid_at: e.due_date });
      toast.success(`${chosen.length} ${chosen.length === 1 ? 'recebimento corrigido' : 'recebimentos corrigidos'}: agora cada um está no mês do pagamento.`);
      dismiss(candidates.filter((e) => !picked.has(e.id)).map((e) => e.id));
      setOpen(false);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section
        aria-label="Datas de recebimento para revisar"
        className="mb-6 flex flex-col gap-3 rounded-[14px] border border-line bg-warning-bg px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="flex items-start gap-2.5 text-[13.5px] text-ink">
          <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-warning-fg" strokeWidth={1.8} />
          <span>
            {candidates.length} {candidates.length === 1 ? 'parcela antiga foi marcada' : 'parcelas antigas foram marcadas'} como recebida
            {candidates.length === 1 ? '' : 's'} com a data do dia em que {candidates.length === 1 ? 'foi lançada' : 'foram lançadas'}
            {months === 1 ? ' (tudo no mesmo mês)' : ''}, e não com a data do pagamento.
          </span>
        </p>
        <Button
          size="sm"
          variant="primary"
          className="shrink-0"
          onClick={() => {
            setPicked(new Set(candidates.map((e) => e.id)));
            setOpen(true);
          }}
        >
          Revisar e corrigir
        </Button>
      </section>
      {open && (
        <Modal
          title="Corrigir datas de recebimento"
          subtitle="Cada parcela passa a contar no mês da data do pagamento (vencimento combinado)."
          onClose={() => setOpen(false)}
          size="lg"
          footer={
            <>
              <Button
                variant="ghost"
                className="mr-auto"
                onClick={() => {
                  dismiss(candidates.map((e) => e.id));
                  setOpen(false);
                }}
              >
                Manter como está
              </Button>
              <Button onClick={() => setOpen(false)}>Cancelar</Button>
              <Button variant="primary" loading={busy} disabled={!picked.size} onClick={apply}>
                Corrigir {picked.size} {picked.size === 1 ? 'recebimento' : 'recebimentos'}
              </Button>
            </>
          }
        >
          <ul className="divide-y divide-hairline-surface">
            {candidates.map((e) => {
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
                    label={<span className="sr-only">Corrigir {e.description}</span>}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] text-ink">{e.description}</div>
                    <div className="text-[12.5px] text-muted">
                      {project ? `${project.name} · ` : ''}Recebido em <s>{formatDate(e.paid_at)}</s> → <span className="text-ink">{formatDate(e.due_date)}</span>
                    </div>
                  </div>
                  <span className="shrink-0 text-[13.5px] tabular text-ink">{formatMoney(e.amount)}</span>
                </li>
              );
            })}
          </ul>
        </Modal>
      )}
    </>
  );
}
