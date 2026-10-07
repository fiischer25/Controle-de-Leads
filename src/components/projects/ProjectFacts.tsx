import type { ReactNode } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, ListChecks, MapPin, UserRound } from 'lucide-react';
import type { Project } from '../../lib/types';
import { cn, formatDateShort, formatMinutes, formatNumber } from '../../lib/utils';
import { alertWhen, type ProjectFactsData } from './facts';

const first = (name: string) => name.split(' ')[0];

function Fact({ icon, children, className, title, truncate = false }: { icon: ReactNode; children: ReactNode; className?: string; title?: string; truncate?: boolean }) {
  return (
    <span className={cn('flex min-w-0 max-w-full items-start gap-1.5', className)} title={title}>
      <span className="mt-[3px] shrink-0 text-faint [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      {/* Datas e números nunca cortam: quebram a linha; só o nome da tarefa é encurtado */}
      <span className={cn('min-w-0', truncate && 'truncate')}>{children}</span>
    </span>
  );
}

/** Alerta de prazo: tarefa em andamento atrasada ou vencendo nos próximos dias. */
function DeadlineAlert({ facts }: { facts: ProjectFactsData }) {
  const [a, ...rest] = facts.alerts;
  if (!a) return null;
  const late = a.days < 0;
  return (
    <div
      className={cn(
        'col-span-full -mt-1 flex w-fit max-w-full items-start gap-2 rounded-[9px] px-2.5 py-1.5 text-[12.5px]',
        late ? 'bg-danger-bg text-danger-fg' : 'bg-warning-bg text-warning-fg',
      )}
      data-deadline-alert={late ? 'atrasada' : 'perto'}
    >
      <AlertTriangle className="mt-[2px] h-3.5 w-3.5 shrink-0" strokeWidth={2} />
      <span className="min-w-0">
        <span className="font-medium">Em andamento e {alertWhen(a, formatDateShort)}:</span> {a.task.title}
        {a.assignee && ` · ${first(a.assignee.name)}`}
        {rest.length > 0 && ` · +${rest.length} ${rest.length === 1 ? 'outra' : 'outras'} com prazo perto`}
      </span>
    </div>
  );
}

/** Detalhes do projeto na lista, focados em prazos: o essencial sem precisar abrir o projeto. */
export function ProjectFacts({ project, facts, overdueTasks, minutes }: { project: Project; facts: ProjectFactsData; overdueTasks: number; minutes: number }) {
  const { manager } = facts;
  // A tarefa do alerta já aparece em destaque: não repete como próximo prazo
  const next = facts.next && facts.next.task.id !== facts.alerts[0]?.task.id ? facts.next : null;
  const place = [project.site_city, project.area_m2 ? `${formatNumber(project.area_m2)} m²` : null].filter(Boolean).join(' · ');
  return (
    <>
      <DeadlineAlert facts={facts} />
      <div className="col-span-full -mt-1 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px] text-muted" data-project-facts>
        {manager && <Fact icon={<UserRound strokeWidth={1.8} />}>Responsável: {first(manager.name)}</Fact>}
        {facts.total > 0 && (
          <Fact icon={<ListChecks strokeWidth={1.8} />}>
            {facts.done}/{facts.total} tarefas
            {overdueTasks > 0 && (
              <span className="text-danger-fg">
                {' · '}
                {overdueTasks} {overdueTasks === 1 ? 'atrasada' : 'atrasadas'}
              </span>
            )}
          </Fact>
        )}
        {project.status === 'concluido' && project.completed_at ? (
          <Fact icon={<CheckCircle2 strokeWidth={1.8} />}>Finalizado em {formatDateShort(project.completed_at.slice(0, 10))}</Fact>
        ) : (
          next && (
            <Fact
              icon={<CalendarClock strokeWidth={1.8} />}
              className={cn('max-w-[min(100%,440px)]', next.overdue && 'text-danger-fg')}
              title={next.task.title}
              truncate
            >
              Próximo prazo: <span className={next.overdue ? undefined : 'text-ink'}>{next.task.title}</span>
              {next.task.due_date ? ` · ${next.overdue ? 'venceu ' : ''}${formatDateShort(next.task.due_date)}` : ' · sem prazo'}
              {next.assignee && ` · ${first(next.assignee.name)}`}
            </Fact>
          )
        )}
        {minutes > 0 && <Fact icon={<Clock strokeWidth={1.8} />}>{formatMinutes(minutes)} registradas</Fact>}
        {place && <Fact icon={<MapPin strokeWidth={1.8} />}>{place}</Fact>}
      </div>
    </>
  );
}
