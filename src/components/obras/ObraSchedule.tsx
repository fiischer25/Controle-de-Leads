import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { expectedStageProgress, itemCost, STAGE_STATE, stageSpan, stageState } from '../../lib/obras';
import type { ObraStage } from '../../lib/types';
import { cn, diffDays, formatDateShort, formatMoney, formatNumber, today } from '../../lib/utils';
import { Button, ConfirmDialog, IconButton, Input } from '../ui';
import { DecimalInput, ToneBadge } from './parts';
import { useObraActions } from './useObraActions';
import type { ObraSummary } from './useObraSummaries';

const COLS = 'lg:grid-cols-[28px_minmax(0,1.6fr)_124px_124px_minmax(130px,1fr)_100px_108px_112px_76px]';

/** Cronograma físico-financeiro: etapas com datas, avanço, valor previsto × pago e o gráfico de Gantt. */
export function ObraSchedule({ summary }: { summary: ObraSummary }) {
  const { obra, stages, money } = summary;
  const { addStage, updateStage, deleteStage } = useObraActions();
  const toast = useToast();
  const [name, setName] = useState('');
  const [removing, setRemoving] = useState<ObraStage | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const t = today();

  const save = (id: string, c: Partial<ObraStage>) => updateStage(id, c).catch(toast.error);
  const move = (idx: number, dir: -1 | 1) => {
    const a = stages[idx];
    const b = stages[idx + dir];
    if (!a || !b) return;
    save(a.id, { position: b.position });
    save(b.id, { position: a.position });
  };
  const add = async () => {
    if (!name.trim()) return;
    try {
      await addStage(obra, name);
      setName('');
    } catch (e) {
      toast.error(e);
    }
  };
  const planned = stages.reduce((a, s) => a + s.budget, 0);

  return (
    <div className="space-y-10">
      <section aria-label="Etapas da obra" className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-card">
        <div className={cn('hidden gap-3 border-b border-line px-4 py-2.5 text-[11.5px] font-medium text-faint lg:grid', COLS)}>
          <span>#</span>
          <span>Etapa</span>
          <span>Início</span>
          <span>Fim</span>
          <span>Avanço</span>
          <span className="text-right">Previsto</span>
          <span className="text-right">Pago</span>
          <span>Situação</span>
          <span />
        </div>
        {stages.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted">Nenhuma etapa. Adicione as etapas da obra abaixo.</p>}
        <ul className="divide-y divide-hairline-surface">
          {stages.map((s, idx) => {
            const state = stageState(s, t);
            const exp = expectedStageProgress(s, t);
            const m = money.byStage[s.id];
            return (
              <li key={s.id} data-stage={s.name}>
                <div className={cn('grid grid-cols-2 items-center gap-3 px-4 py-3 lg:py-2', COLS)}>
                  <button
                    type="button"
                    onClick={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))}
                    className="hidden items-center text-[12.5px] tabular text-faint hover:text-ink lg:flex"
                    aria-label={`Itens de ${s.name}`}
                    aria-expanded={!!open[s.id]}
                  >
                    {open[s.id] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    {idx + 1}
                  </button>
                  <NameInput value={s.name} onSave={(v) => save(s.id, { name: v })} className="col-span-2 lg:col-span-1" />
                  <label className="text-[11.5px] text-faint lg:contents">
                    <span className="lg:hidden">Início</span>
                    <Input type="date" className="h-8 px-2" value={s.start_date ?? ''} aria-label={`Início de ${s.name}`} onChange={(e) => save(s.id, { start_date: e.target.value || null })} />
                  </label>
                  <label className="text-[11.5px] text-faint lg:contents">
                    <span className="lg:hidden">Fim</span>
                    <Input
                      type="date"
                      className="h-8 px-2"
                      value={s.due_date ?? ''}
                      min={s.start_date ?? undefined}
                      aria-label={`Fim de ${s.name}`}
                      onChange={(e) => save(s.id, { due_date: e.target.value || null })}
                    />
                  </label>
                  <ProgressInput value={s.progress} expected={exp} label={s.name} onSave={(v) => save(s.id, { progress: v })} />
                  <div className="text-right">
                    <span className="mr-1 text-[11.5px] text-faint lg:hidden">Previsto</span>
                    <DecimalInput value={s.budget} onCommit={(v) => save(s.id, { budget: v })} aria-label={`Valor previsto de ${s.name}`} className="w-full" />
                  </div>
                  <div className="text-right text-[13px] tabular text-ink">
                    <span className="mr-1 text-[11.5px] text-faint lg:hidden">Pago</span>
                    <span className={cn(m && s.budget > 0 && m.paid > s.budget && 'text-danger-fg')}>{formatMoney(m?.paid ?? 0)}</span>
                    {m && m.open > 0 && <div className="whitespace-nowrap text-[11px] text-faint" title="Lançado e ainda não pago">+ {formatMoney(m.open)}</div>}
                  </div>
                  <div>
                    <ToneBadge tone={STAGE_STATE[state].tone} label={STAGE_STATE[state].label} />
                  </div>
                  <div className="flex justify-end">
                    <IconButton label={`Subir ${s.name}`} size="xs" disabled={idx === 0} onClick={() => move(idx, -1)}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton label={`Descer ${s.name}`} size="xs" disabled={idx === stages.length - 1} onClick={() => move(idx, 1)}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton label={`Excluir ${s.name}`} size="xs" onClick={() => setRemoving(s)} className="hover:text-danger-fg">
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                    </IconButton>
                  </div>
                </div>
                {open[s.id] && (
                  <div className="border-t border-hairline bg-subtle px-4 py-3 lg:pl-[60px]">
                    {s.items.length === 0 ? (
                      <p className="text-[12.5px] text-muted">Sem itens orçados nesta etapa.</p>
                    ) : (
                      <table className="w-full text-[12.5px]">
                        <tbody>
                          {s.items.map((i) => (
                            <tr key={i.id} className="border-b border-hairline last:border-0">
                              <td className="py-1.5 pr-3 text-ink">{i.description}</td>
                              <td className="w-24 py-1.5 text-right tabular text-muted">
                                {formatNumber(i.qty, 2)} {i.unit}
                              </td>
                              <td className="w-28 py-1.5 text-right tabular text-muted">{formatMoney(itemCost(i))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
          <div className="flex min-w-[240px] flex-1 gap-2">
            <Input
              value={name}
              placeholder="Nova etapa (ex.: Pintura)"
              aria-label="Nome da nova etapa"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              className="max-w-sm"
            />
            <Button icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={add} disabled={!name.trim()}>
              Etapa
            </Button>
          </div>
          <span className="text-[12.5px] tabular text-muted">
            Previsto nas etapas: <b className="font-semibold text-ink">{formatMoney(planned)}</b>
            {obra.contract_value != null && Math.abs(planned - obra.contract_value) >= 1 && <> · contrato {formatMoney(obra.contract_value)}</>}
          </span>
        </div>
      </section>

      <Gantt stages={stages} today={t} />

      {removing && (
        <ConfirmDialog
          title="Excluir etapa?"
          message={`${removing.name}. Os pagamentos e pendências dela ficam sem etapa.`}
          confirmLabel="Excluir"
          danger
          onConfirm={() => deleteStage(removing).catch(toast.error)}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function NameInput({ value, onSave, className }: { value: string; onSave: (v: string) => void; className?: string }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <Input
      value={text ?? value}
      title={value}
      aria-label="Nome da etapa"
      className={cn('h-8 border-transparent px-1.5 font-medium hover:border-line-strong', className)}
      onFocus={() => setText(value)}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      onBlur={() => {
        if (text != null && text.trim() && text.trim() !== value) onSave(text.trim());
        setText(null);
      }}
    />
  );
}

/** Avanço da etapa: deslizar de 5 em 5 (grava ao soltar) ou digitar. Marca o previsto para hoje. */
function ProgressInput({ value, expected, label, onSave }: { value: number; expected: number | null; label: string; onSave: (v: number) => void }) {
  const [v, setV] = useState<number | null>(null);
  const shown = v ?? Math.round(value);
  const commit = () => {
    if (v != null && v !== Math.round(value)) onSave(Math.min(100, Math.max(0, v)));
    setV(null);
  };
  return (
    <div className="col-span-2 flex items-center gap-2 lg:col-span-1">
      <div className="relative flex-1">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={shown}
          aria-label={`Avanço de ${label}`}
          onChange={(e) => setV(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
          className="w-full accent-[rgb(var(--ink))]"
        />
        {expected != null && expected > 0 && expected < 100 && (
          <span className="pointer-events-none absolute -bottom-1 h-1.5 w-px bg-stone-400" style={{ left: `${expected}%` }} title={`Previsto hoje: ${expected}%`} />
        )}
      </div>
      <span className="w-10 text-right text-[13px] font-medium tabular text-ink">{shown}%</span>
    </div>
  );
}

/** Gantt das etapas: barra do período com o avanço preenchido e a linha de hoje. */
function Gantt({ stages, today: t }: { stages: ObraStage[]; today: string }) {
  const dated = stages.filter((s) => s.start_date && s.due_date);
  const span = stageSpan(dated);
  if (!dated.length || !span.start || !span.end) {
    return <p className="text-center text-[13px] text-muted">Coloque início e fim nas etapas para ver o gráfico do cronograma.</p>;
  }
  const total = diffDays(span.start, span.end) + 1;
  const pos = (d: string) => (diffDays(span.start!, d) / total) * 100;
  const todayPos = t >= span.start && t <= span.end ? pos(t) : null;
  // Marcas de mês
  const months: Array<{ left: number; label: string }> = [];
  const d = new Date(`${span.start.slice(0, 7)}-01T12:00:00`);
  while (d.toISOString().slice(0, 10) <= span.end) {
    const key = d.toISOString().slice(0, 10);
    if (key >= span.start) months.push({ left: pos(key), label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) });
    d.setMonth(d.getMonth() + 1);
  }
  return (
    <section aria-label="Gráfico do cronograma" className="panel">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-[15.5px] font-semibold text-ink">Gráfico do cronograma</h2>
        <span className="text-[12px] tabular text-faint">
          {formatDateShort(span.start)} → {formatDateShort(span.end)} · {total} dias
        </span>
      </div>
      <div className="scrollbar-thin overflow-x-auto pb-3">
        <div className="min-w-[640px]">
          <div className="relative ml-[170px] h-5 border-b border-line text-[11px] text-faint">
            {months.map((m) => (
              <span key={m.label} className="absolute top-0 -translate-x-0" style={{ left: `${m.left}%` }}>
                {m.label}
              </span>
            ))}
          </div>
          <div className="relative">
            {todayPos != null && (
              <div className="pointer-events-none absolute inset-y-0 z-10 ml-[170px]" style={{ left: 0, right: 0 }}>
                <div className="absolute inset-y-0 w-px bg-danger-solid/70" style={{ left: `${todayPos}%` }} title="Hoje" />
              </div>
            )}
            {stages.map((s) => {
              const state = stageState(s, t);
              return (
                <div key={s.id} className="flex h-8 items-center">
                  <div className="w-[170px] shrink-0 truncate pr-3 text-[12.5px] text-stone-700" title={s.name}>
                    {s.name}
                  </div>
                  <div className="relative h-full flex-1">
                    {s.start_date && s.due_date && (
                      <div
                        className={cn('absolute top-1/2 h-3.5 -translate-y-1/2 overflow-hidden rounded-[4px]', state === 'atrasada' ? 'bg-danger-bg' : 'bg-stone-200')}
                        style={{ left: `${pos(s.start_date)}%`, width: `${Math.max(0.8, ((diffDays(s.start_date, s.due_date) + 1) / total) * 100)}%` }}
                        title={`${s.name}: ${formatDateShort(s.start_date)} → ${formatDateShort(s.due_date)} · ${Math.round(s.progress)}%`}
                      >
                        <div className={cn('h-full', state === 'atrasada' ? 'bg-danger-solid' : state === 'concluida' ? 'bg-success-solid' : 'bg-stone-700')} style={{ width: `${s.progress}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
