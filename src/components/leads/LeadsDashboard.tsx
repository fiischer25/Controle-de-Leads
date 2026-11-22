import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import { leadDashboard, monthHistory, monthResult, topWithOthers, type Bucket } from '../../lib/leadDashboard';
import { monthLabel as fullMonth } from '../../lib/finance';
import { MonthPicker } from '../finance/MonthPicker';
import { CSS_COLOR } from '../../lib/status';
import type { Lead } from '../../lib/types';
import { cn, formatCurrency, formatDateShort, MONTHS_FULL, today } from '../../lib/utils';
import { BarRow, EmptyState, MetricRow, SectionHeader } from '../ui';

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const monthLabel = (key: string) => `${MONTHS_FULL[Number(key.slice(5, 7)) - 1].slice(0, 3)}/${key.slice(2, 4)}`;

/**
 * Painel das Oportunidades: resultado, taxa de conversão, valores em aberto, fechados e não
 * fechados, de onde vêm os leads, perfil e localidades. Segue os filtros da tela.
 */
export function LeadsDashboard({
  leads,
  monthLeads,
  onSource,
  onOpenLead,
}: {
  leads: Lead[];
  /** Para o resultado do mês: os mesmos filtros, menos o de entrada (o mês escolhido manda). */
  monthLeads: Lead[];
  onSource: (id: string) => void;
  onOpenLead: (id: string) => void;
}) {
  const { db, maps } = useData();
  const [month, setMonth] = useState(today().slice(0, 7));
  const top = useRef<HTMLElement>(null);
  const result = useMemo(() => monthResult(monthLeads, db.lead_stages, month), [monthLeads, db.lead_stages, month]);
  const history = useMemo(() => monthHistory(monthLeads, db.lead_stages, today(), 12), [monthLeads, db.lead_stages]);
  const name = MONTHS_FULL[Number(month.slice(5, 7)) - 1].toLowerCase();
  const decidedMonth = result.won.length + result.lost;
  const d = useMemo(
    () => leadDashboard({ leads, stages: db.lead_stages, sources: db.lead_sources, types: db.project_types, today: today() }),
    [leads, db.lead_stages, db.lead_sources, db.project_types],
  );

  if (!leads.length && !monthLeads.length) {
    return <EmptyState title="Nenhuma oportunidade" description="Sem oportunidades com estes filtros. Limpe os filtros ou cadastre uma oportunidade." className="py-16" />;
  }

  const decided = d.won + d.lost;
  const stageMax = Math.max(...d.stages.map((s) => s.value), 0);
  const cities = topWithOthers(d.cities, 8);

  return (
    <div className="space-y-8 md:space-y-10" data-leads-dashboard>
      <section ref={top} aria-labelledby="ld-mes" className="scroll-mt-24 space-y-4" data-month-result={month}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 id="ld-mes" className="text-[12px] font-medium uppercase tracking-[0.08em] text-faint">
            Resultado do mês
          </h2>
          <MonthPicker value={month} onChange={setMonth} className="-mr-2" />
        </div>
        <MetricRow
          items={[
            {
              label: 'Projetos fechados',
              value: result.won.length,
              sub: decidedMonth ? `${pct(result.conversion)} de conversão · ${result.lost} não ${result.lost === 1 ? 'fechado' : 'fechados'}` : 'nenhum decidido no mês',
            },
            { label: 'Valor fechado', value: formatCurrency(result.wonValue), sub: result.avgTicket ? `média ${formatCurrency(result.avgTicket)} por projeto` : `em ${name}` },
            { label: 'Leads novos', value: result.newLeads, sub: `contatos que entraram em ${name}` },
            {
              label: 'Oportunidades no funil',
              value: result.inFunnel,
              sub: `${plural(result.withProposal, 'com proposta', 'com proposta')} · em negociação no mês`,
              hint: 'Oportunidades que estavam abertas em algum momento do mês (entraram até o fim dele e não tinham sido decididas antes)',
            },
          ]}
        />
        <div className="panel">
          <SectionHeader
            title={`Fechados em ${name}`}
            aside={<span className="text-[12.5px] text-faint">{plural(result.won.length, 'projeto', 'projetos')} · {formatCurrency(result.wonValue)}</span>}
          />
          {result.won.length === 0 ? (
            <p className="border-t border-hairline py-4 text-[13px] text-faint">Nenhum projeto fechado em {fullMonth(month).toLowerCase()}.</p>
          ) : (
            <ul>
              {result.won.map((l) => {
                const project = db.projects.find((p) => p.lead_id === l.id);
                const type = l.project_type_id ? maps.types[l.project_type_id]?.name : null;
                return (
                  <li
                    key={l.id}
                    data-won-lead={l.name}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-t border-hairline py-3 text-[13px] sm:grid-cols-[minmax(0,1fr)_minmax(0,180px)_70px_120px]"
                  >
                    <button type="button" onClick={() => onOpenLead(l.id)} className="min-w-0 text-left">
                      <span className="block truncate text-ink hover:underline hover:decoration-stone-300 hover:underline-offset-4">{l.name}</span>
                      <span className="block truncate text-[12px] text-faint">{[type, l.city].filter(Boolean).join(' · ') || '—'}</span>
                    </button>
                    <span className="hidden min-w-0 truncate sm:block">
                      {project ? (
                        <Link to={`/projetos/${project.id}`} className="text-accent-fg hover:underline">
                          {project.name}
                        </Link>
                      ) : (
                        <span className="text-faint">sem projeto ainda</span>
                      )}
                    </span>
                    <span className="hidden tabular text-muted sm:block">{formatDateShort(l.closed_at!.slice(0, 10))}</span>
                    <span className="text-right font-medium tabular text-ink">{l.proposal_value ? formatCurrency(l.proposal_value) : '—'}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <MetricRow
        label="Geral (com os filtros)"
        items={[
          { label: 'Oportunidades', value: d.total, sub: `${plural(d.open, 'em negociação', 'em negociação')}` },
          {
            label: 'Taxa de conversão',
            value: pct(d.conversion),
            sub: decided ? `${plural(d.won, 'ganha', 'ganhas')} de ${plural(decided, 'decidida', 'decididas')}` : 'nenhuma decidida ainda',
            hint: 'Ganhas ÷ (ganhas + não ganhas)',
          },
          {
            label: 'Em aberto para fechar',
            value: formatCurrency(d.openValue),
            sub: `${plural(d.open, 'proposta', 'propostas')}${d.openNoValue ? ` · ${d.openNoValue} sem valor` : ''}`,
          },
          {
            label: 'Fechados',
            value: formatCurrency(d.wonValue),
            sub: `${plural(d.won, 'negócio', 'negócios')}${d.avgTicket ? ` · média ${formatCurrency(d.avgTicket)}` : ''}`,
          },
          { label: 'Não fechados', value: formatCurrency(d.lostValue), sub: plural(d.lost, 'oportunidade', 'oportunidades') },
        ]}
      />

      <section aria-labelledby="ld-meses" className="panel">
        <SectionHeader
          id="ld-meses"
          title="Mês a mês"
          aside={
            <span className="text-[12.5px] text-faint">
              últimos 12 meses · clique para ver o mês{d.avgDaysToClose !== null && ` · fecham em ${plural(d.avgDaysToClose, 'dia', 'dias')}, em média`}
            </span>
          }
        />
        <Table
          cols="grid-cols-[minmax(0,1fr)_52px_56px_minmax(84px,auto)] sm:grid-cols-[minmax(0,1fr)_64px_64px_64px_minmax(110px,auto)_76px_76px]"
          head={['Mês', 'Leads novos', 'No funil', 'Fechados', 'Valor fechado', 'Não fechados', 'Conversão']}
          hideOnMobile={[1, 5, 6]}
          rows={history.map((m) => ({
            key: m.key,
            data: { 'data-lead-month': m.key, ...(m.key === month ? { 'data-selected': 'sim' } : {}) },
            onClick: () => {
              setMonth(m.key);
              top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            },
            title: `Ver ${fullMonth(m.key).toLowerCase()}`,
            cells: [
              <span key="m" className={cn(m.key === month ? 'font-semibold text-ink' : 'text-ink')}>{monthLabel(m.key)}</span>,
              m.newLeads,
              m.inFunnel,
              <span key="w" className={cn(m.won.length ? 'font-medium text-ink' : '')}>{m.won.length}</span>,
              <span key="v" className={cn('whitespace-nowrap', m.wonValue ? 'font-medium text-ink' : 'text-faint')}>{m.wonValue ? formatCurrency(m.wonValue) : '—'}</span>,
              m.lost,
              pct(m.conversion),
            ],
          }))}
        />
      </section>

      <section aria-labelledby="ld-origem" className="panel">
        <SectionHeader id="ld-origem" title="De onde vem o lead" aside={<span className="text-[12.5px] text-faint">clique para filtrar</span>} />
        <Table
          cols="grid-cols-[minmax(0,1fr)_44px_64px_minmax(84px,auto)] sm:grid-cols-[minmax(0,1fr)_64px_64px_88px_84px_minmax(120px,auto)]"
          head={['Origem', 'Leads', 'Ganhas', 'Não ganhas', 'Conversão', 'Fechado']}
          hideOnMobile={[2, 3]}
          rows={d.sources.map((s) => ({
            key: s.key,
            data: { 'data-lead-source': s.label },
            onClick: s.key !== 'none' ? () => onSource(s.key) : undefined,
            title: s.key !== 'none' ? `Ver só as oportunidades de ${s.label}` : undefined,
            cells: [
              <span key="n" className="block text-ink [overflow-wrap:anywhere]">{s.label}</span>,
              s.total,
              s.won,
              s.lost,
              <span key="c" className="font-medium text-ink">{pct(s.conversion)}</span>,
              <span key="v" className="whitespace-nowrap text-stone-700">{s.wonValue ? formatCurrency(s.wonValue) : '—'}</span>,
            ],
          }))}
        />
      </section>

      <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-10">
        <section aria-labelledby="ld-etapas" className="panel">
          <SectionHeader id="ld-etapas" title="Em aberto por etapa" aside={<span className="text-[12.5px] text-faint">valor das propostas</span>} />
          <div className="space-y-4 border-t border-hairline pb-3 pt-4">
            {d.stages.map((s) => (
              <BarRow
                key={s.id}
                label={s.name}
                value={stageMax ? s.value : s.count}
                max={stageMax || Math.max(...d.stages.map((x) => x.count), 0)}
                display={s.value ? formatCurrency(s.value) : '—'}
                suffix={`· ${s.count}`}
                title={`${s.name}: ${plural(s.count, 'oportunidade', 'oportunidades')}, ${formatCurrency(s.value)} em propostas`}
              />
            ))}
          </div>
        </section>
        <section aria-labelledby="ld-perdas" className="panel">
          <SectionHeader id="ld-perdas" title="Por que não fechou" />
          <div className="space-y-4 border-t border-hairline pb-3 pt-4">
            {d.lostReasons.length === 0 && <p className="text-[13px] text-faint">Nenhuma oportunidade não ganha.</p>}
            {d.lostReasons.slice(0, 8).map((r) => (
              <BarRow
                key={r.reason}
                label={r.reason}
                value={r.count}
                max={d.lostReasons[0].count}
                color={CSS_COLOR.stone(500)}
                suffix={r.value ? `· ${formatCurrency(r.value)}` : undefined}
              />
            ))}
          </div>
        </section>
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-10">
        <section aria-labelledby="ld-perfil" className="panel">
          <SectionHeader id="ld-perfil" title="Perfil dos leads" aside={<span className="text-[12.5px] text-faint">quantidade · % que fecha</span>} />
          <div className="space-y-6 border-t border-hairline pb-3 pt-4">
            <Group title="Tipo de projeto" buckets={d.types} name="tipo" />
            <Group title="Categoria" buckets={d.categories} name="categoria" />
            <Group title="Área do imóvel" buckets={d.areas} name="area" />
          </div>
        </section>
        <section aria-labelledby="ld-local" className="panel">
          <SectionHeader id="ld-local" title="Localidades" aside={<span className="text-[12.5px] text-faint">quantidade · % que fecha</span>} />
          <div className="space-y-4 border-t border-hairline pb-3 pt-4">
            {cities.map((c) => (
              <Bar key={c.key} b={c} max={cities[0].total} data={{ 'data-lead-city': c.label }} />
            ))}
          </div>
          {d.states.length > 1 && (
            <p className="border-t border-hairline py-3 text-[12.5px] leading-5 text-muted" data-lead-states>
              Por estado:{' '}
              {d.states.map((s, i) => (
                <span key={s.key} className="whitespace-nowrap">
                  {i > 0 && ' · '}
                  {s.label} <span className="tabular text-ink">{s.total}</span>
                </span>
              ))}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function Group({ title, buckets, name }: { title: string; buckets: Bucket[]; name: string }) {
  const rows = topWithOthers(buckets, 6, 'Outros');
  return (
    <div>
      <h3 className="mb-3 text-[12px] font-medium uppercase tracking-[0.08em] text-faint">{title}</h3>
      <div className="space-y-4">
        {rows.map((b) => (
          <Bar key={b.key} b={b} max={rows.reduce((a, x) => Math.max(a, x.total), 0)} data={{ [`data-lead-${name}`]: b.label }} />
        ))}
      </div>
    </div>
  );
}

/** Barra com a quantidade e o quanto fecha; o detalhe (ganhas, não ganhas, valor) no title. */
function Bar({ b, max, data }: { b: Bucket; max: number; data: Record<string, string> }) {
  return (
    <div {...data}>
      <BarRow
        label={b.label}
        value={b.total}
        max={max}
        suffix={b.conversion !== null ? `· ${pct(b.conversion)}` : undefined}
        title={`${b.label}: ${plural(b.total, 'oportunidade', 'oportunidades')} · ${b.won} ganhas · ${b.lost} não ganhas · ${b.open} em aberto${b.wonValue ? ` · ${formatCurrency(b.wonValue)} fechados` : ''}`}
      />
    </div>
  );
}

/** Tabela em grade (sem rolagem para o lado no celular: algumas colunas somem). */
function Table({
  cols,
  head,
  rows,
  hideOnMobile = [],
}: {
  cols: string;
  head: string[];
  hideOnMobile?: number[];
  rows: Array<{ key: string; cells: ReactNode[]; onClick?: () => void; title?: string; data?: Record<string, string> }>;
}) {
  const cell = (i: number) => cn(i === 0 ? 'min-w-0 text-left' : 'text-right', hideOnMobile.includes(i) && 'max-sm:hidden');
  return (
    <div role="table" className="text-[13px]">
      <div role="row" className={cn('grid gap-3 border-b border-hairline pb-2.5 text-[12.5px] text-faint', cols)}>
        {head.map((h, i) => (
          <span key={h} role="columnheader" className={cell(i)}>
            {h}
          </span>
        ))}
      </div>
      {rows.map((r) => {
        const Tag = r.onClick ? 'button' : 'div';
        return (
          <Tag
            key={r.key}
            type={r.onClick ? 'button' : undefined}
            role="row"
            onClick={r.onClick}
            title={r.title}
            {...r.data}
            className={cn('grid w-full items-baseline gap-3 border-b border-hairline py-3 tabular last:border-b-0', cols, r.onClick && 'hover:bg-canvas')}
          >
            {r.cells.map((c, i) => (
              <span key={i} role="cell" className={cn(cell(i), 'text-stone-700')}>
                {c}
              </span>
            ))}
          </Tag>
        );
      })}
    </div>
  );
}
