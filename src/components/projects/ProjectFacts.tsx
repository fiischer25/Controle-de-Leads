import type { ReactNode } from 'react';
import { CalendarClock, CheckCircle2, Clock, ListChecks, MapPin, UserRound, Wallet } from 'lucide-react';
import type { Project } from '../../lib/types';
import { cn, formatCurrency, formatDateShort, formatMinutes, formatNumber } from '../../lib/utils';
import type { ProjectFactsData } from './facts';

const first = (name: string) => name.split(' ')[0];

function Fact({ icon, children, className, title, truncate = false }: { icon: ReactNode; children: ReactNode; className?: string; title?: string; truncate?: boolean }) {
  return (
    <span className={cn('flex min-w-0 max-w-full items-start gap-1.5', className)} title={title}>
      <span className="mt-[3px] shrink-0 text-faint [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      {/* Valores nunca cortam: quebram a linha; só o nome da próxima tarefa é encurtado */}
      <span className={cn('min-w-0', truncate && 'truncate')}>{children}</span>
    </span>
  );
}

/** Linha de detalhes do projeto na lista: o essencial sem precisar abrir o projeto. */
export function ProjectFacts({ project, facts, overdueTasks, minutes }: { project: Project; facts: ProjectFactsData; overdueTasks: number; minutes: number }) {
  const { manager, next, fees } = facts;
  const place = [project.site_city, project.area_m2 ? `${formatNumber(project.area_m2)} m²` : null].filter(Boolean).join(' · ');
  return (
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
            className={cn('max-w-[min(100%,420px)]', next.overdue && 'text-danger-fg')}
            title={next.task.title}
            truncate
          >
            Próxima: <span className={next.overdue ? undefined : 'text-ink'}>{next.task.title}</span>
            {next.task.due_date && ` · ${next.overdue ? 'venceu ' : ''}${formatDateShort(next.task.due_date)}`}
            {next.assignee && ` · ${first(next.assignee.name)}`}
          </Fact>
        )
      )}
      {minutes > 0 && <Fact icon={<Clock strokeWidth={1.8} />}>{formatMinutes(minutes)} registradas</Fact>}
      {fees && (
        <Fact icon={<Wallet strokeWidth={1.8} />}>
          Honorários: {formatCurrency(fees.received)} de {formatCurrency(fees.total)} recebidos
          {fees.overdue > 0 ? (
            <span className="text-danger-fg"> · {formatCurrency(fees.overdue)} vencido</span>
          ) : (
            fees.next && ` · próxima ${formatCurrency(fees.next.amount)} em ${formatDateShort(fees.next.due_date)}`
          )}
        </Fact>
      )}
      {place && <Fact icon={<MapPin strokeWidth={1.8} />}>{place}</Fact>}
    </div>
  );
}
