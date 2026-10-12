import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { officeHealth, type HealthIndicator, type HealthStatus } from '../../lib/health';
import { TONE_DOT, type Tone } from '../../lib/status';
import { cn, today } from '../../lib/utils';
import { Badge, SectionHeader } from '../ui';

const TONE: Record<HealthStatus, Tone> = { bom: 'success', atencao: 'warning', critico: 'danger', sem_dados: 'neutral' };
const LABEL: Record<HealthStatus, string> = { bom: 'Bom', atencao: 'Atenção', critico: 'Crítico', sem_dados: 'Sem dados' };
const OVERALL: Record<HealthStatus, string> = { bom: 'Saudável', atencao: 'Pede atenção', critico: 'Em risco', sem_dados: 'Sem dados suficientes' };
const RING: Record<HealthStatus, string> = {
  bom: 'stroke-success-solid',
  atencao: 'stroke-warning-solid',
  critico: 'stroke-danger-solid',
  sem_dados: 'stroke-stone-300',
};

/**
 * Relatórios → Saúde do escritório: nota geral e por área (Financeiro, Comercial, Prazos e
 * Equipe), o que melhorar primeiro e onde analisar cada ponto.
 */
export function OfficeHealthReport() {
  const { db, can } = useData();
  const finance = can('financeiro');
  const commercial = can('comercial');
  const h = useMemo(
    () =>
      officeHealth({
        today: today(),
        finance,
        commercial,
        accounts: db.finance_accounts,
        categories: db.finance_categories,
        entries: db.finance_entries,
        memberCosts: db.finance_member_costs,
        clients: db.clients,
        leads: db.leads,
        stages: db.lead_stages,
        projects: db.projects,
        tasks: db.tasks,
        timeEntries: db.time_entries,
        profiles: db.profiles,
      }),
    [db, finance, commercial],
  );
  const toImprove = h.priorities.length;

  return (
    <div className="space-y-10 md:space-y-12">
      {/* Nota geral e por área */}
      <section aria-label="Nota do escritório" className="rounded-[16px] border border-line bg-surface p-5 shadow-card md:p-7" data-health-score={h.score ?? ''}>
        <div className="grid items-center gap-8 md:grid-cols-[220px_minmax(0,1fr)] md:gap-12">
          <div className="flex items-center gap-5 md:flex-col md:text-center">
            <ScoreRing score={h.score} status={h.status} />
            <div>
              <div className={cn('font-display text-[19px] font-semibold', h.status === 'sem_dados' ? 'text-muted' : 'text-ink')} data-health-status>
                {OVERALL[h.status]}
              </div>
              <p className="mt-1 text-[13px] text-muted">
                {h.status === 'sem_dados'
                  ? 'Lance projetos, tarefas, oportunidades e o Financeiro para ver a saúde do escritório.'
                  : toImprove
                    ? `${toImprove} ${toImprove === 1 ? 'ponto para melhorar' : 'pontos para melhorar'} · ${h.strengths.length} ${h.strengths.length === 1 ? 'ponto forte' : 'pontos fortes'}`
                    : 'Tudo em ordem nos indicadores avaliados.'}
              </p>
            </div>
          </div>
          <ul className="space-y-4">
            {h.areas.map((a) => {
              const open = a.indicators.filter((i) => i.status === 'critico' || i.status === 'atencao').length;
              return (
                <li key={a.id}>
                  <a href={`#saude-${a.id}`} className="group block" data-health-area={a.id}>
                    <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                      <span className="font-medium text-ink group-hover:underline group-hover:decoration-stone-300 group-hover:underline-offset-4">{a.label}</span>
                      <span className="flex items-center gap-2 text-[12.5px] text-muted">
                        {open > 0 && <span>{open} para melhorar</span>}
                        <span className="w-10 text-right font-semibold tabular text-ink">{a.score ?? '—'}</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100">
                      <span className={cn('block h-full rounded-full', TONE_DOT[TONE[a.status]])} style={{ width: `${a.score ?? 0}%` }} />
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* O que melhorar primeiro */}
      <section aria-labelledby="saude-melhorar">
        <SectionHeader id="saude-melhorar" title="O que melhorar primeiro" aside={<span className="text-[12.5px] text-faint">do mais urgente para o menos</span>} />
        {toImprove === 0 ? (
          <p className="flex items-center gap-2 rounded-[14px] border border-line bg-surface px-5 py-4 text-[13.5px] text-success-fg shadow-card">
            <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            {h.status === 'sem_dados' ? 'Ainda não há dados suficientes para apontar melhorias.' : 'Nenhum indicador pedindo atenção agora.'}
          </p>
        ) : (
          <ol className="divide-y divide-hairline-surface overflow-hidden rounded-[16px] border border-line bg-surface shadow-card">
            {h.priorities.map((i, n) => (
              <li key={i.id} className="grid gap-x-4 gap-y-1 px-5 py-4 md:grid-cols-[28px_minmax(0,1fr)_auto]" data-health-priority={i.id}>
                <span className="hidden pt-0.5 text-[13px] font-semibold tabular text-faint md:block">{n + 1}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Badge tone={TONE[i.status]} dot>
                      {LABEL[i.status]}
                    </Badge>
                    <span className="text-[14px] font-semibold text-ink">{i.label}</span>
                    <span className="text-[13px] tabular text-muted">· {i.value}</span>
                  </div>
                  <p className="mt-1 text-[12.5px] text-faint">{i.detail}</p>
                  <p className="mt-1.5 text-[13.5px] text-stone-700">{i.advice}</p>
                </div>
                <AnalyzeLink link={i.link} className="md:self-center" />
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Cada área */}
      <div className="grid gap-6 lg:grid-cols-2">
        {h.areas.map((a) => (
          <section
            key={a.id}
            id={`saude-${a.id}`}
            aria-labelledby={`saude-${a.id}-t`}
            className="scroll-mt-6 rounded-[16px] border border-line bg-surface p-5 shadow-card md:p-6"
          >
            <SectionHeader
              id={`saude-${a.id}-t`}
              title={a.label}
              aside={
                <Badge tone={TONE[a.status]} dot>
                  {a.score != null ? `${a.score} · ${LABEL[a.status]}` : LABEL[a.status]}
                </Badge>
              }
            />
            {a.indicators.length === 0 ? (
              <p className="text-[13px] text-faint">Sem dados suficientes nesta área ainda.</p>
            ) : (
              <ul className="divide-y divide-hairline-surface">
                {a.indicators.map((i) => (
                  <Indicator key={i.id} i={i} />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <p className="text-[12.5px] leading-relaxed text-faint">
        Como é calculado: cada indicador vale 100 (bom), 60 (atenção) ou 20 (crítico); a nota da área é a média dos seus indicadores e a nota
        geral, a média das áreas (75 ou mais é saudável). Com algum ponto crítico, a situação fica no máximo em atenção. O Financeiro olha os 3 últimos meses fechados; o Comercial, os últimos 6 meses; as horas, as últimas 4 semanas.
        Indicadores sem dados ficam de fora.
      </p>
    </div>
  );
}

function Indicator({ i }: { i: HealthIndicator }) {
  return (
    <li className="py-3.5 first:pt-1" data-health-indicator={i.id} data-status={i.status}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', TONE_DOT[TONE[i.status]])} aria-hidden />
            {i.label}
          </div>
          <p className="mt-0.5 text-[12.5px] text-faint">{i.detail}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[15px] font-semibold tabular text-ink">{i.value}</div>
          <div className={cn('text-[11.5px]', i.status === 'bom' ? 'text-success-fg' : i.status === 'atencao' ? 'text-warning-fg' : i.status === 'critico' ? 'text-danger-fg' : 'text-faint')}>
            {LABEL[i.status]}
          </div>
        </div>
      </div>
      {i.status !== 'bom' && (
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-[12.5px] text-muted">{i.advice}</p>
          <AnalyzeLink link={i.link} />
        </div>
      )}
    </li>
  );
}

function AnalyzeLink({ link, className }: { link: HealthIndicator['link']; className?: string }) {
  return (
    <Link to={link.to} className={cn('inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] font-medium text-ink hover:underline hover:decoration-stone-300 hover:underline-offset-4', className)}>
      {link.label}
      <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.8} />
    </Link>
  );
}

function ScoreRing({ score, status }: { score: number | null; status: HealthStatus }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-[112px] w-[112px] shrink-0 md:h-[132px] md:w-[132px]">
      <svg viewBox="0 0 112 112" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="56" cy="56" r={r} fill="none" strokeWidth="9" className="stroke-stone-100" />
        <circle
          cx="56"
          cy="56"
          r={r}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - (score ?? 0) / 100)}
          className={RING[status]}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[32px] font-semibold leading-none tabular text-ink md:text-[38px]">{score ?? '—'}</span>
        <span className="mt-1 text-[11.5px] text-faint">de 100</span>
      </div>
    </div>
  );
}
