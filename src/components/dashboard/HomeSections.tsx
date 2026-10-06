import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import { cn, formatCurrency, weekdayDay } from '../../lib/utils';
import { ActionLink, Avatar, AvatarStack } from '../ui';
import { ProjectDeadline, StageRail } from '../projects/StageRail';
import { useOpenTask } from '../tasks/useOpenTask';
import type { AgendaItem, FunnelRow, HomeProject, TeamRow } from './useHomeData';

const WEEK_HOURS = 40;

/** Horas da semana: "12h", "7,5h", "45min". */
function formatHours(minutes: number) {
  if (minutes > 0 && minutes < 60) return `${Math.round(minutes)}min`;
  return `${(Math.round((minutes / 60) * 2) / 2).toLocaleString('pt-BR')}h`;
}

// ---------------------------------------------------------------- Hoje / próximos dias
export function TodayColumn({
  className,
  todayEvents,
  upcoming,
  calendarConnected,
  onTask,
  onLead,
}: {
  className?: string;
  todayEvents: AgendaItem[];
  upcoming: AgendaItem[];
  calendarConnected: boolean;
  onTask?: (id: string) => void;
  onLead?: (id: string) => void;
}) {
  const { can } = useData();
  const navigate = useNavigate();
  const openTask = useOpenTask();
  const open = (a: AgendaItem) => {
    if (a.taskId) return (onTask ?? openTask)(a.taskId);
    if (a.leadId) {
      if (onLead) return onLead(a.leadId);
      if (can('comercial')) navigate(`/oportunidades?lead=${a.leadId}`);
      return;
    }
    if (a.href && (!a.href.startsWith('/projetos') || can('projetos'))) navigate(a.href);
  };
  return (
    <section aria-labelledby="hoje" className={cn('panel', className)}>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 id="hoje" className="font-display text-section text-ink">Hoje</h2>
        <ActionLink to="/?aba=agenda" muted>Agenda</ActionLink>
      </div>
      {todayEvents.length === 0 ? (
        <p className="border-t border-hairline py-3 text-[13px] text-faint">Nada na sua agenda hoje.</p>
      ) : (
        <ul>
          {todayEvents.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => open(a)}
                className="grid w-full grid-cols-[44px_minmax(0,1fr)] gap-3 border-t border-hairline py-3 text-left transition-colors hover:bg-ink/[0.025]"
              >
                {a.time ? (
                  <span className={cn('pt-px font-mono text-xs tabular', a.past ? 'text-stone-400' : 'text-ink')}>{a.time}</span>
                ) : (
                  <span className="pt-px text-xs text-warning-fg">hoje</span>
                )}
                <span className="min-w-0">
                  <span className={cn('block truncate text-[13.5px] leading-5', a.past ? 'text-faint' : 'text-ink')}>{a.title}</span>
                  <span className={cn('block truncate text-[12.5px]', a.deadline ? 'text-warning-fg' : 'text-faint')}>{a.context}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="px-0 pb-2 pt-6 text-[12.5px] text-faint">Próximos dias</div>
      {upcoming.length === 0 ? (
        <p className="border-t border-hairline py-3 text-[13px] text-faint">Nada agendado.</p>
      ) : (
        <ul>
          {upcoming.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => open(a)}
                className="grid min-h-14 w-full grid-cols-[44px_minmax(0,1fr)] gap-3 border-t border-hairline py-3 text-left transition-colors hover:bg-ink/[0.025] md:min-h-0"
              >
                <span className="pt-px text-xs text-faint">{weekdayDay(a.date)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] leading-5 text-ink">{a.title}</span>
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    {a.time && <span className="shrink-0 font-mono text-[11.5px] tabular text-muted">{a.time}</span>}
                    <span className={cn('truncate text-[12.5px]', a.deadline ? 'text-warning-fg' : 'text-faint')}>{a.context}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 border-t border-hairline pt-3 text-[13px] text-faint">
        Google Agenda ·{' '}
        {calendarConnected ? (
          <Link to="/?aba=agenda" className="font-medium text-accent-fg hover:text-brand-900">Abrir</Link>
        ) : (
          <Link to={can('configuracoes') ? '/configuracoes?aba=agenda' : '/perfil'} className="font-medium text-accent-fg hover:text-brand-900">
            Conectar
          </Link>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Projetos
export function ProjectsSection({
  projects,
  soonDays,
  title = 'Projetos',
  limit = 6,
  empty = 'Nenhum projeto ativo.',
}: {
  projects: HomeProject[];
  soonDays: number;
  title?: string;
  limit?: number;
  empty?: string;
}) {
  const { can } = useData();
  const linkable = can('projetos');
  const shown = projects.slice(0, limit);
  const rowCls =
    'grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 border-t border-hairline py-4 transition-colors md:grid-cols-[180px_minmax(0,1fr)_44px_130px_56px] md:gap-x-6';
  return (
    <section aria-labelledby="projetos" className="panel">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 id="projetos" className="font-display text-section text-ink">
          {title}
        </h2>
        {linkable ? (
          <ActionLink to="/projetos" muted>
            {projects.length > shown.length ? `Ver todos (${projects.length})` : 'Lista de projetos'}
          </ActionLink>
        ) : (
          <span className="text-[13px] text-faint">{projects.length}</span>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="border-t border-hairline py-4 text-[13px] text-faint">{empty}</p>
      ) : (
        <ul>
          {shown.map(({ summary: s, phases, current }) => {
            const inPhase = current >= 0 && current < phases.length;
            const phaseLabel = inPhase ? phases[current] : s.phase;
            const inner = (
              <>
                <div className="min-w-0">
                  <div className="truncate font-display text-[14.5px] font-semibold tracking-[0.01em] text-ink">{s.project.name}</div>
                  <div className="truncate text-[12.5px] text-faint">{s.client?.name ?? s.type?.name ?? '—'}</div>
                </div>
                <div className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:row-start-auto">
                  <StageRail phases={phases} current={current} />
                  <div className="mt-2 flex min-w-0 gap-2 text-[12.5px]">
                    <span className="truncate text-muted">{phaseLabel}</span>
                    {inPhase && <span className="shrink-0 tabular text-muted">· {current + 1}/{phases.length}</span>}
                    {s.overdueTasks > 0 && (
                      <span className="shrink-0 text-danger-fg">
                        · {s.overdueTasks} {s.overdueTasks === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="hidden text-right text-[13px] tabular text-muted md:block">{s.progress}%</div>
                <div className="col-start-2 row-start-1 text-right md:col-start-auto md:row-start-auto md:text-left">
                  <ProjectDeadline due={s.project.due_date} soonDays={soonDays} />
                </div>
                <div className="hidden justify-end md:flex">
                  <AvatarStack users={s.people} max={3} size={22} ring="ring-canvas" />
                </div>
              </>
            );
            return (
              <li key={s.project.id}>
                {linkable ? (
                  <Link to={`/projetos/${s.project.id}`} className={cn(rowCls, 'hover:bg-ink/[0.025]')}>
                    {inner}
                  </Link>
                ) : (
                  <div className={rowCls}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Equipe
export function TeamSection({ team }: { team: TeamRow[] }) {
  const { can } = useData();
  const linkable = can('equipe');
  if (team.length === 0) return null;
  return (
    <section aria-labelledby="equipe" className="panel hidden md:block">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 id="equipe" className="font-display text-section text-ink">Equipe esta semana</h2>
        <span className="text-[13px] text-faint">de {WEEK_HOURS}h</span>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-8 border-t border-hairline pt-5 xl:grid-cols-4">
        {team.map((m) => {
          const inner = (
            <>
              <div className="flex items-center gap-2.5">
                <Avatar user={m.user} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink group-hover:underline group-hover:decoration-stone-300 group-hover:underline-offset-4">
                  {m.user.name}
                </span>
                <span className="shrink-0 text-[13px] tabular text-muted">{formatHours(m.minutes)}</span>
              </div>
              <div className="mt-3 h-0.5 overflow-hidden rounded-full bg-hairline">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, (m.minutes / 60 / WEEK_HOURS) * 100)}%` }} />
              </div>
              <div className="mt-2 text-xs text-faint">
                {m.open} {m.open === 1 ? 'aberta' : 'abertas'}
                {m.overdue > 0 && (
                  <>
                    {' · '}
                    <span className="text-danger-fg">
                      {m.overdue} {m.overdue === 1 ? 'atrasada' : 'atrasadas'}
                    </span>
                  </>
                )}
              </div>
            </>
          );
          return linkable ? (
            <Link key={m.user.id} to={`/equipe?membro=${m.user.id}`} className="group min-w-0">
              {inner}
            </Link>
          ) : (
            <div key={m.user.id} className="min-w-0">
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Funil
export function FunnelSection({ rows, total, conversion }: { rows: FunnelRow[]; total: number; conversion: number | null }) {
  const count = rows.reduce((acc, r) => acc + r.count, 0);
  return (
    <section aria-labelledby="funil" className="panel">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 id="funil" className="font-display text-section text-ink">Funil</h2>
        <ActionLink to="/oportunidades" muted>Abrir</ActionLink>
      </div>
      <div className="border-t border-hairline pt-4">
        <div className="font-display text-metric tabular text-ink">{formatCurrency(total)}</div>
        <div className="mt-1 text-[12.5px] text-faint">
          em {count} {count === 1 ? 'oportunidade aberta' : 'oportunidades abertas'}
        </div>
        <div className="mt-4 flex h-1 gap-0.5 overflow-hidden rounded-[2px]" aria-hidden>
          {count === 0 ? (
            <span className="flex-1 bg-line-strong" />
          ) : (
            rows.filter((r) => r.count > 0).map((r) => <span key={r.stage.id} style={{ flex: r.count, backgroundColor: r.color }} />)
          )}
        </div>
        <ul className="mt-4 space-y-2.5">
          {rows.map((r) => (
            <li key={r.stage.id} className="grid grid-cols-[minmax(0,1fr)_24px_auto] items-baseline gap-3">
              <span className="flex min-w-0 items-center gap-2 text-[13px] text-stone-700">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} aria-hidden />
                <span className="truncate">{r.stage.name}</span>
              </span>
              <span className="text-right text-[13px] tabular text-ink">{r.count}</span>
              <span className="text-right text-[12.5px] tabular text-faint">{r.value ? formatCurrency(r.value) : r.count ? 'sem proposta' : '—'}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-hairline pt-3 text-[12.5px] text-faint">
          90 dias · {conversion === null ? 'sem fechamentos' : `${conversion}% de conversão`}
        </div>
      </div>
    </section>
  );
}
