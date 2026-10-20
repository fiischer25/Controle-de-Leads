import { AlertTriangle, Camera } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { isObraActive, PAYMENT_STATE, paymentState, STAGE_STATE, stageState, VISIT_KIND } from '../../lib/obras';
import { cn, deadlineState, dueLabel, formatDate, formatDateShort, formatMoney, today } from '../../lib/utils';
import { ActionLink, MetricRow } from '../ui';
import type { ObraTab } from '../../pages/ObraDetailPage';
import { DualBar, Panel, PhotoGrid, ToneBadge } from './parts';
import type { ObraSummary } from './useObraSummaries';

/** Painel da obra: avanço físico × previsto, dinheiro, prazos e o que pede atenção. */
export function ObraOverview({ summary, onTab, onVisit }: { summary: ObraSummary; onTab: (t: ObraTab) => void; onVisit: () => void }) {
  const { settings, maps } = useData();
  const { obra, stages, money, progress, expected } = summary;
  const t = today();
  const done = !isObraActive(obra);
  const due = deadlineState(obra.due_date, done, settings.due_soon_days);
  const gap = expected != null ? progress - expected : null;
  const openPayments = summary.payments
    .filter((p) => !p.paid_at && p.approval !== 'recusado')
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 6);
  const pending = summary.approvals.filter((a) => a.status === 'pendente');
  const issues = summary.issues.filter((i) => i.status === 'aberta').sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
  const recentPhotos = summary.visits.flatMap((v) => v.photos.map((p) => ({ ...p, _date: v.date }))).slice(0, 12);
  const pctPaid = money.contracted > 0 ? Math.round((money.paid / money.contracted) * 100) : 0;

  return (
    <div className="space-y-10">
      <MetricRow
        label="Visão geral"
        items={[
          {
            label: 'Avanço físico',
            value: `${progress}%`,
            tone: gap != null && gap <= -10 && !done ? 'text-danger-fg' : undefined,
            sub: expected != null && !done ? (gap! >= 0 ? `previsto ${expected}% · em dia` : `previsto ${expected}% · ${Math.abs(gap!)} pts atrás`) : `${stages.length} etapas`,
          },
          {
            label: 'Entrega',
            value: obra.due_date ? formatDateShort(obra.due_date) : '—',
            tone: due === 'overdue' ? 'text-danger-fg' : due === 'soon' || due === 'today' ? 'text-warning-fg' : undefined,
            sub: obra.due_date ? (done ? `início ${formatDate(obra.start_date)}` : dueLabel(obra.due_date)) : 'sem data',
          },
          {
            label: 'Pago',
            value: formatMoney(money.paid),
            sub: `${pctPaid}% de ${formatMoney(money.contracted)}${money.additives ? ' (com aditivos)' : ''}`,
          },
          {
            label: 'A pagar',
            value: formatMoney(money.open),
            tone: money.overdue > 0 ? 'text-danger-fg' : undefined,
            sub: money.overdue > 0 ? `${formatMoney(money.overdue)} vencido` : money.awaitingCount ? `${money.awaitingCount} aguardando o cliente` : 'nada vencido',
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Etapas" aside={<ActionLink onClick={() => onTab('cronograma')} muted>Cronograma</ActionLink>} id="ov-etapas">
          {stages.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">Sem etapas. Crie no cronograma.</p>
          ) : (
            <ul className="divide-y divide-hairline-surface pb-2">
              {stages.map((s) => {
                const state = stageState(s, t);
                const m = money.byStage[s.id];
                return (
                  <li key={s.id} className="py-2.5" data-stage-row>
                    <div className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="min-w-0 truncate font-medium text-ink">{s.name}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {state === 'atrasada' && <ToneBadge tone={STAGE_STATE[state].tone} label={STAGE_STATE[state].label} />}
                        <span className="tabular text-ink">{Math.round(s.progress)}%</span>
                      </span>
                    </div>
                    <DualBar className="mt-1.5" actual={s.progress} expected={null} color={state === 'atrasada' ? 'rgb(var(--danger-solid))' : undefined} />
                    <div className="mt-1 flex justify-between gap-3 text-[11.5px] tabular text-faint">
                      <span>{s.start_date ? `${formatDateShort(s.start_date)} → ${formatDateShort(s.due_date)}` : 'sem datas'}</span>
                      {m && (m.planned > 0 || m.paid > 0) && (
                        <span className={cn(m.paid + m.open > m.planned && m.planned > 0 && 'text-warning-fg')}>
                          {formatMoney(m.paid)} / {formatMoney(m.planned)}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Financeiro da obra" id="ov-fin">
            <dl className="space-y-2 pb-3 text-[13px]">
              <Line label="Orçado" value={formatMoney(money.budget)} />
              {money.additives > 0 && <Line label="Aditivos aprovados" value={`+ ${formatMoney(money.additives)}`} />}
              <Line label="Contratado" value={formatMoney(money.contracted)} strong />
              <Line label="Pago" value={formatMoney(money.paid)} />
              <Line label="Lançado a pagar" value={formatMoney(money.open)} />
              <Line
                label="Saldo do orçamento"
                value={formatMoney(money.balance)}
                strong
                tone={money.balance < 0 ? 'text-danger-fg' : undefined}
              />
            </dl>
            <DualBar actual={pctPaid} expected={money.contracted > 0 ? Math.round((money.committed / money.contracted) * 100) : null} className="mb-3" />
            {money.balance < 0 && (
              <p className="mb-3 flex items-center gap-1.5 text-[12.5px] text-danger-fg">
                <AlertTriangle className="h-3.5 w-3.5" /> Os pagamentos já passam do valor contratado.
              </p>
            )}
          </Panel>

          {pending.length > 0 && (
            <Panel title="Aguardando o cliente" aside={<ActionLink onClick={() => onTab('aprovacoes')} muted>Aprovações</ActionLink>} id="ov-aprov">
              <ul className="divide-y divide-hairline-surface pb-2">
                {pending.map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                    <span className="min-w-0 truncate text-ink">{a.title}</span>
                    {a.amount != null && <span className="shrink-0 tabular text-muted">{formatMoney(a.amount)}</span>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Próximos pagamentos" aside={<ActionLink onClick={() => onTab('pagamentos')} muted>Pagamentos</ActionLink>} id="ov-pag">
          {openPayments.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">Nada a pagar.</p>
          ) : (
            <ul className="divide-y divide-hairline-surface pb-2">
              {openPayments.map((p) => {
                const ps = paymentState(p, t);
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{p.description}</span>
                      <span className="block truncate text-[12px] text-faint">
                        {[p.supplier_name, formatDate(p.due_date)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="tabular text-ink">{formatMoney(p.amount)}</span>
                      {ps !== 'a_pagar' && <ToneBadge tone={PAYMENT_STATE[ps].tone} label={PAYMENT_STATE[ps].label} />}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <Panel title="Pendências abertas" aside={<ActionLink onClick={() => onTab('pendencias')} muted>Pendências</ActionLink>} id="ov-pend">
          {issues.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">Nenhuma pendência aberta.</p>
          ) : (
            <ul className="divide-y divide-hairline-surface pb-2">
              {issues.slice(0, 6).map((i) => (
                <li key={i.id} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                  <span className="min-w-0 truncate text-ink">{i.title}</span>
                  <span className={cn('shrink-0 text-[12px]', i.due_date && i.due_date < t ? 'text-danger-fg' : 'text-faint')}>
                    {i.responsible ?? ''} {i.due_date ? `· ${formatDateShort(i.due_date)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Últimas visitas"
        aside={summary.visits.length ? <ActionLink onClick={() => onTab('visitas')} muted>Diário da obra</ActionLink> : <ActionLink onClick={onVisit}>Registrar a primeira</ActionLink>}
        id="ov-visitas"
      >
        {summary.visits.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-8 text-[13px] text-muted">
            <Camera className="h-4 w-4" strokeWidth={1.6} /> Registre cada visita com fotos, o que foi feito e o avanço das etapas.
          </p>
        ) : (
          <div className="space-y-4 pb-3">
            <ul className="divide-y divide-hairline-surface">
              {summary.visits.slice(0, 3).map((v) => (
                <li key={v.id} className="py-2.5 text-[13px]">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-ink">
                      {VISIT_KIND[v.kind]} · {formatDate(v.date)}
                    </span>
                    <span className="text-[12px] text-faint">
                      {v.author_id ? maps.profiles[v.author_id]?.name : ''}
                      {v.photos.length ? ` · ${v.photos.length} fotos` : ''}
                    </span>
                  </div>
                  {v.summary && <p className="mt-0.5 line-clamp-2 text-muted">{v.summary}</p>}
                </li>
              ))}
            </ul>
            {recentPhotos.length > 0 && <PhotoGrid photos={recentPhotos} max={12} meta={(p) => formatDate((p as typeof recentPhotos[number])._date)} />}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? 'font-medium text-ink' : 'text-muted'}>{label}</dt>
      <dd className={cn('tabular', tone ?? (strong ? 'font-semibold text-ink' : 'text-stone-700'))}>{value}</dd>
    </div>
  );
}
