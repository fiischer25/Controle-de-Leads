import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { useData } from '../context/DataContext';
import { photoUrl } from '../lib/obraFiles';
import { APPROVAL_KIND, APPROVAL_STATUS, PAYMENT_CATEGORY, PAYMENT_STATE, paymentState, STAGE_STATE, stageState, VISIT_KIND } from '../lib/obras';
import type { ObraPhoto } from '../lib/types';
import { addDays, formatDate, formatDateShort, formatMoney, today } from '../lib/utils';
import { useObraSummaries } from '../components/obras/useObraSummaries';
import { Button, Checkbox } from '../components/ui';

const PERIODS = [
  { days: 7, label: 'Últimos 7 dias' },
  { days: 15, label: 'Últimos 15 dias' },
  { days: 30, label: 'Últimos 30 dias' },
  { days: 0, label: 'Toda a obra' },
];

/**
 * Relatório da obra para o cliente (A4, imprimir ou salvar em PDF): avanço das etapas, visitas do
 * período com fotos, pagamentos, aprovações e pendências.
 */
export default function ObraReportPage() {
  const { id } = useParams();
  const { me, settings } = useData();
  const summary = useObraSummaries().find((s) => s.obra.id === id);
  const [days, setDays] = useState(15);
  const [showPayments, setShowPayments] = useState(true);
  const [showIssues, setShowIssues] = useState(true);

  useEffect(() => {
    const html = document.documentElement;
    const wasDark = html.classList.contains('dark');
    html.classList.remove('dark');
    const previousTitle = document.title;
    if (summary) document.title = `Relatório ${summary.obra.name} · ${settings.office_name}`;
    return () => {
      if (wasDark) html.classList.add('dark');
      document.title = previousTitle;
    };
  }, [summary, settings.office_name]);

  if (!summary) {
    return (
      <div className="p-10 text-center text-muted">
        Obra não encontrada. <Link to="/obras" className="underline">Voltar</Link>
      </div>
    );
  }
  const { obra, stages, money, progress, expected } = summary;
  const t = today();
  const from = days ? addDays(t, -days + 1) : null;
  const visits = summary.visits.filter((v) => v.shared && (!from || v.date >= from));
  const payments = [...summary.payments].filter((p) => p.approval !== 'recusado').sort((a, b) => a.due_date.localeCompare(b.due_date));
  const approvals = summary.approvals.filter((a) => a.status !== 'cancelado' && (!from || a.requested_at.slice(0, 10) >= from || a.status === 'pendente'));
  const issues = summary.issues.filter((i) => i.status === 'aberta');
  const stageName = (sid: string | null | undefined) => (sid ? stages.find((s) => s.id === sid)?.name : null);

  return (
    <div className="min-h-screen bg-canvas print:bg-white">
      <style>{'@page { size: A4; margin: 14mm 12mm; } @media print { body { background: #fff; } }'}</style>
      <div className="sticky top-0 z-10 border-b border-line bg-canvas/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[860px] flex-wrap items-center gap-3 px-5 py-3">
          <Link to={`/obras/${obra.id}`} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" /> Obra
          </Link>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="input h-8 w-auto" aria-label="Período">
            {PERIODS.map((p) => (
              <option key={p.days} value={p.days}>
                {p.label}
              </option>
            ))}
          </select>
          <div className="flex-1" />
          <Checkbox checked={showPayments} onChange={setShowPayments} label={<span className="text-[13px]">Pagamentos</span>} />
          <Checkbox checked={showIssues} onChange={setShowIssues} label={<span className="text-[13px]">Pendências</span>} />
          <Button variant="primary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
            Imprimir / salvar PDF
          </Button>
        </div>
      </div>

      <article className="mx-auto my-4 max-w-[860px] bg-white px-4 py-6 text-[12px] leading-[1.45] text-stone-900 shadow-surface sm:my-8 sm:px-10 sm:py-10 print:my-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-stone-300 pb-5">
          <div>
            {settings.logo_url ? (
              <img src={settings.logo_url} alt={settings.office_name} className="mb-2 h-10 w-auto object-contain" />
            ) : (
              <div className="mb-1 text-[14px] font-semibold tracking-[0.12em]">{settings.office_name.toUpperCase()}</div>
            )}
            <h1 className="font-display text-[24px] font-semibold leading-tight">Relatório da obra</h1>
            <div className="text-[14px] text-stone-600">
              {obra.name}
              {obra.client_name ? ` · ${obra.client_name}` : ''}
            </div>
          </div>
          <div className="text-right text-[11px] text-stone-500">
            {from ? `${formatDate(from)} a ${formatDate(t)}` : `Até ${formatDate(t)}`}
            <br />
            {me.name}
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 print:grid-cols-4">
          <Box label="Avanço da obra" value={`${progress}%`} sub={expected != null ? `previsto ${expected}%` : undefined} />
          <Box label="Entrega prevista" value={obra.due_date ? formatDate(obra.due_date) : '—'} sub={obra.start_date ? `início ${formatDate(obra.start_date)}` : undefined} />
          <Box label="Valor contratado" value={formatMoney(money.contracted)} sub={money.additives ? `inclui ${formatMoney(money.additives)} de aditivos` : undefined} />
          <Box label="Pago até agora" value={formatMoney(money.paid)} sub={`a pagar ${formatMoney(money.open)}`} />
        </section>

        <Title>Etapas</Title>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-stone-400 text-left text-[10.5px] uppercase tracking-[0.06em] text-stone-500">
              <th className="py-1.5 font-medium">Etapa</th>
              <th className="w-32 py-1.5 font-medium">Período</th>
              <th className="w-40 py-1.5 font-medium">Avanço</th>
              <th className="w-28 py-1.5 pl-3 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((s) => (
              <tr key={s.id} className="border-b border-stone-100">
                <td className="py-1.5 pr-2">{s.name}</td>
                <td className="py-1.5 tabular text-stone-600">{s.start_date ? `${formatDateShort(s.start_date)} → ${formatDateShort(s.due_date)}` : '—'}</td>
                <td className="py-1.5">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200">
                      <span className="block h-full bg-stone-800" style={{ width: `${s.progress}%` }} />
                    </span>
                    <span className="w-9 text-right tabular">{Math.round(s.progress)}%</span>
                  </span>
                </td>
                <td className="py-1.5 pl-3 text-stone-600">{STAGE_STATE[stageState(s, t)].label}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Title>Visitas {from ? 'do período' : ''}</Title>
        {visits.length === 0 && <p className="text-stone-500">Nenhuma visita registrada no período.</p>}
        <div className="space-y-5">
          {visits.map((v) => (
            <div key={v.id} className="break-inside-avoid">
              <div className="flex items-baseline justify-between gap-3 border-b border-stone-200 pb-1">
                <b className="text-[13px]">
                  {VISIT_KIND[v.kind]} · {formatDate(v.date)}
                </b>
                <span className="text-[11px] text-stone-500">{[v.weather, v.workers].filter(Boolean).join(' · ')}</span>
              </div>
              {v.summary && <p className="mt-1.5 whitespace-pre-line">{v.summary}</p>}
              {v.progress.length > 0 && (
                <p className="mt-1 text-[11px] text-stone-600">
                  Avanço: {v.progress.map((p) => `${stageName(p.stage_id) ?? 'etapa'} ${Math.round(p.from)}% → ${Math.round(p.to)}%`).join(' · ')}
                </p>
              )}
              {v.photos.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {v.photos.map((p) => (
                    <ReportPhoto key={p.id} photo={p} stage={stageName(p.stage_id)} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {approvals.length > 0 && (
          <>
            <Title>Aprovações</Title>
            <table className="w-full border-collapse">
              <tbody>
                {approvals.map((a) => (
                  <tr key={a.id} className="border-b border-stone-100 align-top">
                    <td className="py-1.5 pr-2">
                      {a.title}
                      <div className="text-[10.5px] text-stone-500">{APPROVAL_KIND[a.kind]}</div>
                    </td>
                    <td className="w-28 py-1.5 text-right tabular">{a.amount != null ? formatMoney(a.amount) : ''}</td>
                    <td className="w-40 py-1.5 pl-3 text-stone-600">
                      {APPROVAL_STATUS[a.status].label}
                      {a.answered_at && <div className="text-[10.5px]">{[a.answered_name, formatDate(a.answered_at.slice(0, 10))].filter(Boolean).join(' · ')}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {showPayments && payments.length > 0 && (
          <>
            <Title>Pagamentos</Title>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-stone-400 text-left text-[10.5px] uppercase tracking-[0.06em] text-stone-500">
                  <th className="w-20 py-1.5 font-medium">Venc.</th>
                  <th className="py-1.5 font-medium">Descrição</th>
                  <th className="w-28 py-1.5 text-right font-medium">Valor</th>
                  <th className="w-32 py-1.5 pl-3 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-stone-100 align-top">
                    <td className="py-1.5 tabular">{formatDateShort(p.due_date)}</td>
                    <td className="py-1.5 pr-2">
                      {p.description}
                      <div className="text-[10.5px] text-stone-500">{[p.supplier_name, PAYMENT_CATEGORY[p.category], stageName(p.stage_id)].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="py-1.5 text-right tabular">{formatMoney(p.amount)}</td>
                    <td className="py-1.5 pl-3 text-stone-600">
                      {PAYMENT_STATE[paymentState(p, t)].label}
                      {p.paid_at && <span className="text-[10.5px]"> · {formatDateShort(p.paid_at)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td colSpan={2} className="py-2 text-right">
                    Pago {formatMoney(money.paid)} · a pagar {formatMoney(money.open)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </>
        )}

        {showIssues && issues.length > 0 && (
          <>
            <Title>Pendências em aberto</Title>
            <ul className="list-disc space-y-1 pl-5">
              {issues.map((i) => (
                <li key={i.id}>
                  {i.title}
                  <span className="text-stone-500">{[i.responsible, i.due_date ? `até ${formatDate(i.due_date)}` : null].filter(Boolean).map((x) => ` · ${x}`).join('')}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </article>
    </div>
  );
}

function Title({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 mt-8 break-after-avoid text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-500">{children}</h2>;
}

function Box({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-stone-200 px-3 py-2.5">
      <div className="text-[10.5px] text-stone-500">{label}</div>
      <div className="mt-0.5 text-[16px] font-semibold tabular">{value}</div>
      {sub && <div className="text-[10.5px] text-stone-500">{sub}</div>}
    </div>
  );
}

function ReportPhoto({ photo, stage }: { photo: ObraPhoto; stage?: string | null }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    photoUrl(photo.path).then((u) => alive && setSrc(u)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [photo.path]);
  return (
    <figure className="break-inside-avoid">
      <div className="aspect-[4/3] overflow-hidden rounded bg-stone-100">{src && <img src={src} alt={photo.caption ?? photo.name} className="h-full w-full object-cover" />}</div>
      {(photo.caption || stage) && <figcaption className="mt-0.5 text-[10px] leading-tight text-stone-600">{[photo.caption, stage].filter(Boolean).join(' · ')}</figcaption>}
    </figure>
  );
}
