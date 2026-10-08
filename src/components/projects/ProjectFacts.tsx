import type { ReactNode } from 'react';
import { AlertTriangle, CalendarClock, CalendarX2, CheckCircle2, Clock, ListChecks, UserRound } from 'lucide-react';
import type { Project } from '../../lib/types';
import { cn, formatDateShort, formatMinutes } from '../../lib/utils';
import { alertWhen, projectDeadlineAlert, type ProjectFactsData } from './facts';

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

function Alert({ late, children, ...data }: { late: boolean; children: ReactNode } & Record<`data-${string}`, string>) {
  return (
    <div
      {...data}
      className={cn('flex w-fit max-w-full items-start gap-2 rounded-[9px] px-2.5 py-1.5 text-[12.5px]', late ? 'bg-danger-bg text-danger-fg' : 'bg-warning-bg text-warning-fg')}
    >
      <AlertTriangle className="mt-[2px] h-3.5 w-3.5 shrink-0" strokeWidth={2} />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** Alertas e detalhes do projeto na lista, focados em prazos: o essencial sem precisar abrir o projeto. */
export function ProjectFacts({
  project,
  facts,
  overdueTasks,
  minutes,
  soonDays,
}: {
  project: Project;
  facts: ProjectFactsData;
  overdueTasks: number;
  minutes: number;
  soonDays: number;
}) {
  const { manager } = facts;
  const [task, ...rest] = facts.alerts;
  const delivery = projectDeadlineAlert(project, soonDays);
  // A tarefa do alerta já aparece em destaque; tarefa sem prazo não entra como "próximo prazo"
  const next = facts.next && facts.next.task.due_date && facts.next.task.id !== task?.task.id ? facts.next : null;
  return (
    <>
      {(delivery || task) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {delivery && (
            <Alert late={delivery.late} data-project-deadline-alert={delivery.late ? 'atrasada' : 'perto'}>
              <span className="font-medium">{delivery.text}</span>
            </Alert>
          )}
          {task && (
            <Alert late={task.days < 0} data-deadline-alert={task.days < 0 ? 'atrasada' : 'perto'}>
              <span className="font-medium">Em andamento e {alertWhen(task, formatDateShort)}:</span> {task.task.title}
              {task.assignee && ` · ${first(task.assignee.name)}`}
              {rest.length > 0 && ` · +${rest.length} ${rest.length === 1 ? 'outra' : 'outras'} com prazo perto`}
            </Alert>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-hairline-surface pt-3 text-[12.5px] text-muted" data-project-facts>
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
              icon={next.overdue ? <CalendarX2 strokeWidth={1.8} /> : <CalendarClock strokeWidth={1.8} />}
              className={cn(next.overdue && 'text-danger-fg')}
              title={next.task.title}
            >
              Próximo prazo:{' '}
              {/* Só o nome da tarefa encurta; data e pessoa ficam sempre inteiras */}
              <span className={cn('inline-block max-w-[150px] truncate align-bottom sm:max-w-[280px]', !next.overdue && 'text-ink')}>{next.task.title}</span>
              {` · ${next.overdue ? 'venceu ' : ''}${formatDateShort(next.task.due_date!)}`}
              {next.assignee && ` · ${first(next.assignee.name)}`}
            </Fact>
          )
        )}
        {minutes > 0 && <Fact icon={<Clock strokeWidth={1.8} />}>{formatMinutes(minutes)} registradas</Fact>}
      </div>
    </>
  );
}
