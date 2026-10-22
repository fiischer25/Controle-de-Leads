import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { isProjectActive } from '../../lib/domain';
import { cn, formatDateShort, formatMinutes, formatNumber } from '../../lib/utils';
import { Avatar, AvatarStack } from '../ui';
import { ProjectStagePicker } from './ProjectStage';
import { alertWhen, projectDeadlineAlert, type ProjectFactsData } from './facts';
import { projectRail } from './rail';
import { ProjectDeadline, StageRail } from './StageRail';
import type { ProjectSummary } from './useProjectSummaries';

const first = (name: string) => name.split(' ')[0];
const TH = 'whitespace-nowrap border-b border-line px-3 py-2.5 text-left text-[12px] font-medium text-faint';
const TD = 'whitespace-nowrap px-3 py-2.5 align-middle';
/** Coluna do nome, fixa à esquerda (mais estreita no celular). */
const STICKY = 'sticky left-0 w-[168px] min-w-[168px] max-w-[168px] bg-surface shadow-[1px_0_0_rgb(var(--line))] sm:w-[260px] sm:min-w-[260px] sm:max-w-[260px] md:w-[300px] md:min-w-[300px] md:max-w-[300px]';

/**
 * Lista de projetos em tabela: uma linha por projeto, o nome fixo à esquerda e as informações
 * em colunas que rolam para o lado (cabem muitos projetos na mesma tela).
 */
export function ProjectsTable({
  rows,
  facts,
  templates,
  soonDays,
}: {
  rows: ProjectSummary[];
  facts: Record<string, ProjectFactsData>;
  templates: Record<string, string[]>;
  soonDays: number;
}) {
  const navigate = useNavigate();
  // Sombra à direita enquanto há colunas escondidas (convite para rolar para o lado)
  const box = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const check = () => {
    const el = box.current;
    if (el) setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };
  useEffect(() => {
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [rows.length]);
  return (
    <div className="relative overflow-hidden rounded-[16px] border border-line bg-surface shadow-card">
      <div ref={box} onScroll={check} className="overflow-x-auto" data-projects-table>
        <table className="w-full min-w-[1480px] border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th className={cn(TH, STICKY, 'z-10 border-b border-line')}>Projeto</th>
              <th className={cn(TH, 'w-[260px]')}>Status</th>
              <th className={cn(TH, 'w-[200px]')}>Progresso</th>
              <th className={TH}>Entrega</th>
              <th className={cn(TH, 'w-[300px]')}>Alerta</th>
              <th className={cn(TH, 'w-[300px]')}>Próximo prazo</th>
              <th className={TH}>Responsável</th>
              <th className={TH}>Equipe</th>
              <th className={cn(TH, 'text-right')}>Tarefas</th>
              <th className={cn(TH, 'text-right')}>Horas</th>
              <th className={cn(TH, 'text-right')}>Área</th>
              <th className={TH}>Tipo</th>
              <th className={TH}>Início</th>
              <th className={TH}>Código</th>
            </tr>
          </thead>
          <tbody className="[&>tr:last-child>td]:border-b-0 [&>tr>td]:border-b [&>tr>td]:border-hairline-surface">
            {rows.map((s) => {
              const p = s.project;
              const f = facts[p.id];
              const { phases, current } = projectRail(s, templates[p.project_type_id]);
              const active = isProjectActive(p);
              const stage = current >= 0 && current < phases.length ? phases[current] : s.phase;
              const delivery = projectDeadlineAlert(p, soonDays);
              const [task, ...rest] = f?.alerts ?? [];
              const next = f?.next && f.next.task.due_date ? f.next : null;
              const late = !!delivery?.late || (task?.days ?? 0) < 0;
              return (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/projetos/${p.id}`)}
                  className="group cursor-pointer hover:bg-canvas"
                  data-project-row={p.id}
                >
                  <td className={cn(TD, STICKY, 'z-[1] group-hover:bg-canvas')}>
                    {(delivery || task) && <span className={cn('absolute inset-y-0 left-0 w-[3px]', late ? 'bg-danger-solid' : 'bg-warning-solid')} aria-hidden />}
                    <Link to={`/projetos/${p.id}`} onClick={(e) => e.stopPropagation()} className="block min-w-0 font-display text-[14px] font-semibold text-ink hover:underline" data-project-name>
                      <span className="block truncate">{p.name}</span>
                    </Link>
                    <span className="block truncate text-[12px] text-faint">{s.client?.name ?? 'Cliente removido'}</span>
                  </td>
                  <td className={cn(TD, 'w-[260px] max-w-[260px]')}>
                    <ProjectStagePicker project={p} rail={{ phases, current }} fallback={s.phase} />
                  </td>
                  <td className={cn(TD, 'w-[200px]')}>
                    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                      <span className="truncate text-stone-700" title={stage}>
                        {active && phases.length > 0 && current >= 0 && current < phases.length ? `Etapa ${current + 1} de ${phases.length}` : stage}
                      </span>
                      <span className="shrink-0 font-semibold tabular text-ink">{s.progress}%</span>
                    </div>
                    <StageRail phases={phases} current={p.status === 'concluido' ? phases.length : current} className="mt-1.5" />
                  </td>
                  <td className={TD}>
                    {p.due_date ? <ProjectDeadline due={p.due_date} soonDays={soonDays} done={p.status === 'concluido'} /> : <span className="text-faint">—</span>}
                  </td>
                  <td className={cn(TD, 'w-[300px] max-w-[300px]')}>
                    {delivery || task ? (
                      <div className="space-y-1">
                        {delivery && (
                          <AlertChip late={delivery.late} data-project-deadline-alert={delivery.late ? 'atrasada' : 'perto'}>
                            {delivery.text}
                          </AlertChip>
                        )}
                        {task && (
                          <AlertChip late={task.days < 0} data-deadline-alert={task.days < 0 ? 'atrasada' : 'perto'} title={task.task.title}>
                            Em andamento e {alertWhen(task, formatDateShort)}: {task.task.title}
                            {task.assignee && ` · ${first(task.assignee.name)}`}
                            {rest.length > 0 && ` · +${rest.length}`}
                          </AlertChip>
                        )}
                      </div>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className={cn(TD, 'w-[300px] max-w-[300px]')}>
                    {p.status === 'concluido' && p.completed_at ? (
                      <span className="text-success-fg">Finalizado em {formatDateShort(p.completed_at.slice(0, 10))}</span>
                    ) : next ? (
                      <div className="min-w-0" title={next.task.title} data-next-deadline>
                        <div className={cn('truncate', next.overdue ? 'text-danger-fg' : 'text-ink')}>{next.task.title}</div>
                        <div className={cn('text-[12px] tabular', next.overdue ? 'text-danger-fg' : 'text-faint')}>
                          {next.overdue ? 'venceu ' : ''}
                          {formatDateShort(next.task.due_date!)}
                          {next.assignee && ` · ${first(next.assignee.name)}`}
                        </div>
                      </div>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className={TD}>
                    {f?.manager ? (
                      <span className="inline-flex items-center gap-2 text-stone-700" data-manager>
                        <Avatar user={f.manager} size="xs" />
                        {first(f.manager.name)}
                      </span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className={TD}>
                    <AvatarStack users={s.people} max={4} size={22} ring="ring-surface" />
                  </td>
                  <td className={cn(TD, 'text-right tabular')} data-tasks>
                    <span className="text-ink">
                      {f?.done ?? 0}/{f?.total ?? 0}
                    </span>
                    {s.overdueTasks > 0 && <div className="text-[12px] text-danger-fg">{s.overdueTasks} {s.overdueTasks === 1 ? 'atrasada' : 'atrasadas'}</div>}
                  </td>
                  <td className={cn(TD, 'text-right tabular text-stone-700')} data-hours>
                    {s.minutes > 0 ? formatMinutes(s.minutes) : <span className="text-faint">—</span>}
                  </td>
                  <td className={cn(TD, 'text-right tabular text-stone-700')}>{p.area_m2 ? `${formatNumber(p.area_m2)} m²` : <span className="text-faint">—</span>}</td>
                  <td className={cn(TD, 'text-stone-700')}>{s.type?.name ?? '—'}</td>
                  <td className={cn(TD, 'tabular text-stone-700')}>{formatDateShort(p.start_date)}</td>
                  <td className={cn(TD, 'tabular text-faint')}>{p.code}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {more && <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-surface to-transparent" aria-hidden />}
    </div>
  );
}

function AlertChip({ late, children, title, ...data }: { late: boolean; children: ReactNode; title?: string } & Record<`data-${string}`, string>) {
  return (
    <div
      {...data}
      title={title}
      className={cn('flex max-w-full items-center gap-1.5 rounded-[8px] px-2 py-1 text-[12px] font-medium', late ? 'bg-danger-bg text-danger-fg' : 'bg-warning-bg text-warning-fg')}
    >
      <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={2} />
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}
