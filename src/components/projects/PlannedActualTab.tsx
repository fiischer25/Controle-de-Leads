import { useMemo, type ReactNode } from 'react';
import { Calculator } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { plannedVsActual, pricingForProject, type StageState } from '../../lib/plannedActual';
import type { Pricing, Project } from '../../lib/types';
import { cn, formatCurrency, formatMoney, formatNumber } from '../../lib/utils';
import { ActionLink, Badge, EmptyState, MetricRow, SectionHeader, Select } from '../ui';

const STATE: Record<StageState, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  nao_iniciada: { label: 'Não iniciada', tone: 'neutral' },
  no_ritmo: { label: 'No previsto', tone: 'success' },
  atencao: { label: 'Um pouco acima', tone: 'warning' },
  estourou: { label: 'Estourou', tone: 'danger' },
  sem_previsao: { label: 'Sem previsão', tone: 'info' },
};

const hours = (h: number) => `${formatNumber(h, h > 0 && h < 10 ? 1 : 0)} h`;
const pctDiff = (actual: number, planned: number) => (planned > 0 ? Math.round((actual / planned - 1) * 100) : null);

/**
 * Aba Previsto × realizado do projeto: a precificação (dias de cada etapa, custo e lucro) contra
 * as horas lançadas por etapa, com a projeção ao fim no ritmo atual.
 */
export function PlannedActualTab({ project }: { project: Project }) {
  const { db, maps, patch } = useData();
  const toast = useToast();
  const pricing = pricingForProject(db.pricings, project);

  const link = async (next: Pricing | null) => {
    try {
      // Só uma precificação por projeto: a anterior deixa de apontar para ele
      if (pricing && pricing.data.project_id === project.id && pricing.id !== next?.id) {
        await patch('pricings', pricing.id, { data: { ...pricing.data, project_id: null } });
      }
      if (next) {
        await patch('pricings', next.id, { data: { ...next.data, project_id: project.id } });
        toast.success(`${project.name} segue a precificação ${next.name}.`);
      }
    } catch (e) {
      toast.error(e);
    }
  };

  const options = [...db.pricings].sort((a, b) => {
    const mine = (p: Pricing) => (p.lead_id && p.lead_id === project.lead_id ? 0 : 1);
    return mine(a) - mine(b) || b.updated_at.localeCompare(a.updated_at);
  });
  const picker = (
    <Select
      value={pricing?.id ?? ''}
      aria-label="Precificação do projeto"
      className="h-8 w-auto max-w-[260px] text-[13px]"
      onChange={(e) => link(db.pricings.find((p) => p.id === e.target.value) ?? null)}
    >
      <option value="">{pricing ? 'Trocar precificação…' : 'Escolher a precificação…'}</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} · {formatCurrency(p.total)}
        </option>
      ))}
    </Select>
  );

  if (!pricing) {
    return (
      <div className="rounded-[16px] border border-line bg-surface shadow-card">
        <EmptyState
          icon={<Calculator strokeWidth={1.6} />}
          title="Este projeto ainda não tem precificação"
          description="Escolha a precificação usada na proposta para comparar os dias previstos de cada etapa com as horas lançadas."
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              {options.length > 0 && picker}
              <ActionLink to={project.lead_id ? `/precificacao/nova?oportunidade=${project.lead_id}` : '/precificacao/nova'}>Fazer a precificação</ActionLink>
            </div>
          }
          className="py-14"
        />
      </div>
    );
  }
  return <Comparison project={project} pricing={pricing} picker={picker} missingName={(id) => maps.profiles[id]?.name.split(' ')[0]} />;
}

function Comparison({ project, pricing, picker, missingName }: { project: Project; pricing: Pricing; picker: ReactNode; missingName: (id: string) => string | undefined }) {
  const { db } = useData();
  const r = useMemo(
    () => plannedVsActual({ pricing, project, tasks: db.tasks, timeEntries: db.time_entries, costs: db.finance_member_costs, entries: db.finance_entries }),
    [pricing, project, db.tasks, db.time_entries, db.finance_member_costs, db.finance_entries],
  );
  const hoursDiff = pctDiff(r.projectedHours, r.plannedHours);
  const over = hoursDiff != null && hoursDiff > 5;
  const max = Math.max(1, ...r.stages.map((s) => Math.max(s.plannedHours, s.projectedHours)));
  const missing = r.missingCost.map(missingName).filter(Boolean);
  const started = r.actualHours > 0;

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted">
        <span>
          Comparando com a precificação{' '}
          <ActionLink to={`/precificacao/${pricing.id}`} className="text-[length:inherit]">
            {pricing.name}
          </ActionLink>{' '}
          · {formatMoney(r.price)} · {formatNumber(r.hoursPerDay)} h por dia
        </span>
        {picker}
      </div>

      <MetricRow
        items={[
          {
            label: 'Horas lançadas',
            value: hours(r.actualHours),
            sub: r.plannedHours ? `${Math.round((r.actualHours / r.plannedHours) * 100)}% das ${hours(r.plannedHours)} previstas` : 'sem horas previstas',
          },
          { label: 'Andamento', value: `${Math.round(r.progress * 100)}%`, sub: 'tarefas concluídas' },
          {
            label: 'Horas no fim (projeção)',
            value: started ? hours(r.projectedHours) : '—',
            tone: started && over ? 'text-danger-fg' : undefined,
            sub: started && hoursDiff != null ? (hoursDiff > 0 ? `${hoursDiff}% acima do previsto` : hoursDiff < 0 ? `${-hoursDiff}% abaixo do previsto` : 'igual ao previsto') : 'sem horas lançadas',
          },
          { label: 'Custo até agora', value: formatCurrency(r.actualCost), hint: formatMoney(r.actualCost), sub: `de ${formatMoney(r.plannedCost)} previstos` },
          {
            label: 'Lucro projetado',
            value: formatCurrency(r.projectedProfit),
            hint: formatMoney(r.projectedProfit),
            tone: r.projectedProfit < r.plannedProfit * 0.8 ? 'text-danger-fg' : undefined,
            sub: `previsto ${formatMoney(r.plannedProfit)}`,
          },
        ]}
      />

      {started && (
        <p
          className={cn('-mt-4 rounded-[12px] px-4 py-3 text-[13.5px]', over ? 'bg-danger-bg text-danger-fg' : 'bg-success-bg text-success-fg')}
          data-planned-summary
        >
          {over
            ? `No ritmo atual, o projeto termina com ${hours(r.projectedHours)}, ${hoursDiff}% acima das ${hours(r.plannedHours)} previstas, e o lucro cai para ${formatMoney(r.projectedProfit)}. Veja abaixo as etapas que estouraram e use o histórico na próxima precificação.`
            : `No ritmo atual, o projeto fecha dentro das ${hours(r.plannedHours)} previstas, com lucro de ${formatMoney(r.projectedProfit)}.`}
        </p>
      )}

      <section aria-labelledby="pa-etapas" className="panel">
        <SectionHeader id="pa-etapas" title="Por etapa" aside={<span className="text-[12.5px] text-faint">barra cinza: previsto · cor: lançado</span>} />
        <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_90px_90px_90px_120px] gap-4 border-b border-hairline pb-2.5 text-right text-[12.5px] text-faint md:grid">
          <span className="text-left">Etapa</span>
          <span />
          <span>Previsto</span>
          <span>Lançado</span>
          <span>No fim</span>
          <span>Situação</span>
        </div>
        <ul className="divide-y divide-hairline">
          {r.stages.map((s) => {
            const st = STATE[s.state];
            const bar = s.state === 'estourou' ? 'bg-danger-solid' : s.state === 'atencao' ? 'bg-warning-solid' : s.state === 'sem_previsao' ? 'bg-info-solid' : 'bg-success-solid';
            return (
              <li
                key={s.label}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-3 text-[13px] md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_90px_90px_90px_120px]"
                data-stage={s.label}
                data-state={s.state}
              >
                <div className="min-w-0">
                  <div className="truncate text-ink">{s.label}</div>
                  <div className="text-[12px] text-faint">
                    {s.plannedDays ? `${formatNumber(s.plannedDays, 1)} ${s.plannedDays === 1 ? 'dia' : 'dias'}` : 'fora da precificação'}
                    {s.progress != null && ` · ${Math.round(s.progress * 100)}% feito`}
                  </div>
                </div>
                <Badge tone={st.tone} dot className="justify-self-end md:hidden">
                  {st.label}
                </Badge>
                <div className="relative col-span-2 h-2.5 rounded-full bg-stone-100 md:col-span-1" aria-hidden>
                  <span className="absolute inset-y-0 left-0 rounded-full bg-stone-300" style={{ width: `${(s.plannedHours / max) * 100}%` }} />
                  <span className={cn('absolute inset-y-[2px] left-0 rounded-full', bar)} style={{ width: `${(s.actualHours / max) * 100}%` }} />
                </div>
                <span className="hidden text-right tabular text-muted md:block">{s.plannedHours ? hours(s.plannedHours) : '—'}</span>
                <span className="hidden text-right tabular text-ink md:block">{hours(s.actualHours)}</span>
                <span className={cn('hidden text-right tabular md:block', s.state === 'estourou' ? 'text-danger-fg' : 'text-muted')}>
                  {s.actualHours > 0 ? hours(s.projectedHours) : '—'}
                </span>
                <span className="col-span-2 text-[12px] tabular text-muted md:hidden">
                  {s.plannedHours ? `${hours(s.plannedHours)} previstas` : 'sem previsão'} · {hours(s.actualHours)} lançadas
                  {s.actualHours > 0 && s.projectedHours !== s.actualHours ? ` · ${hours(s.projectedHours)} no fim` : ''}
                </span>
                <span className="hidden justify-self-end md:block">
                  <Badge tone={st.tone} dot>
                    {st.label}
                  </Badge>
                </span>
              </li>
            );
          })}
        </ul>
        {missing.length > 0 && (
          <p className="mt-4 text-[12.5px] text-warning-fg">
            Sem custo/hora cadastrado: {missing.join(', ')}. O custo dessas horas fica de fora.{' '}
            <ActionLink to="/financeiro?aba=rentabilidade" className="text-[length:inherit]">
              Cadastrar
            </ActionLink>
          </p>
        )}
        <p className="mt-4 text-[12.5px] text-faint">
          A projeção divide as horas lançadas pelo andamento de cada etapa (tarefas concluídas). Etapas sem horas contam o previsto. O tempo
          real de cada etapa concluída alimenta o histórico de dias por m² na Precificação.
        </p>
      </section>
    </div>
  );
}
