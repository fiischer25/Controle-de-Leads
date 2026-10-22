import type { MouseEvent, ReactNode } from 'react';
import { CalendarDays, Check, ChevronDown, RotateCcw } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { PROJECT_STATUS_STYLE } from '../../lib/status';
import type { Project, ProjectStatus } from '../../lib/types';
import { cn } from '../../lib/utils';
import { Popover } from '../ui';
import { CLIENT_MEETING_STAGE, macroStage } from './rail';

/** Cor do indicador pelo status interno: verde em andamento, laranja pausado, azul obra. */
const DOT: Record<ProjectStatus, string> = {
  em_andamento: 'bg-success-solid shadow-[0_0_0_3px_rgb(var(--success-bg))]',
  pausado: 'bg-warning-solid shadow-[0_0_0_3px_rgb(var(--warning-bg))]',
  obra: 'bg-info-solid shadow-[0_0_0_3px_rgb(var(--info-bg))]',
  nao_iniciado: 'border-[1.5px] border-stone-400 bg-transparent',
  concluido: 'bg-stone-400',
  cancelado: 'bg-stone-300',
};

/** Indicador do status interno do projeto (muda sozinho quando o status do projeto muda). */
export function ProjectStatusDot({ status, className }: { status: ProjectStatus; className?: string }) {
  const label = `Status do projeto: ${PROJECT_STATUS_STYLE[status].label}`;
  if (status === 'concluido') {
    return (
      <span role="img" aria-label={label} title={label} data-project-dot={status} className={cn('inline-flex h-3 w-3 shrink-0 items-center justify-center', className)}>
        <Check className="h-3 w-3 text-stone-500" strokeWidth={2.4} />
      </span>
    );
  }
  return <span role="img" aria-label={label} title={label} data-project-dot={status} className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', DOT[status], className)} />;
}

const stop = (e: MouseEvent) => e.stopPropagation();

/**
 * Status da lista de projetos: a etapa macro (escolhida à mão, ex.: "Reunião com cliente", ou
 * automática pelas tarefas) com o indicador do status interno.
 */
export function ProjectStagePicker({
  project,
  rail,
  fallback,
}: {
  project: Project;
  rail: { phases: string[]; current: number };
  fallback?: string;
}) {
  const { updateProject } = useData();
  const toast = useToast();
  const stage = macroStage(project, rail, fallback);
  const set = (value: string | null) => {
    if ((project.macro_stage ?? null) === value) return;
    updateProject(project.id, { macro_stage: value }).catch(toast.error);
  };
  const isMeeting = stage.label === CLIENT_MEETING_STAGE;
  const options = [...rail.phases];
  // Etapa escolhida que não está mais nas tarefas: continua no menu
  if (!stage.auto && !isMeeting && !options.includes(stage.label)) options.push(stage.label);
  return (
    <div onClick={stop} className="min-w-0">
      <Popover
        align="left"
        className="max-h-[min(420px,70vh)] w-72 overflow-y-auto"
        trigger={({ toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-label={`Etapa de ${project.name}: ${stage.label}`}
            data-project-stage={stage.label}
            data-stage-auto={stage.auto ? 'sim' : 'nao'}
            className="flex max-w-full items-center gap-2 rounded-[8px] py-1 pl-1 pr-1.5 text-left text-[12.5px] transition-colors hover:bg-ink/[0.05]"
          >
            <ProjectStatusDot status={project.status} className="ml-0.5" />
            {isMeeting && <CalendarDays className="h-3.5 w-3.5 shrink-0 text-info-fg" strokeWidth={1.8} aria-hidden />}
            <span className={cn('min-w-0 truncate', isMeeting ? 'font-medium text-info-fg' : 'text-ink')} title={stage.label}>
              {stage.label}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-faint" strokeWidth={1.8} aria-hidden />
          </button>
        )}
      >
        {(close) => (
          <div onClick={stop} role="menu" aria-label={`Etapa de ${project.name}`}>
            <div className="px-2.5 pb-1 pt-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-faint">Etapa na lista</div>
            <Option
              active={isMeeting}
              icon={<CalendarDays className="h-4 w-4 text-info-fg" strokeWidth={1.8} />}
              onClick={() => {
                close();
                set(CLIENT_MEETING_STAGE);
              }}
            >
              {CLIENT_MEETING_STAGE}
            </Option>
            {options.length > 0 && <div className="mx-2 my-1 border-t border-line" />}
            {options.map((ph) => (
              <Option
                key={ph}
                active={!stage.auto && stage.label === ph}
                onClick={() => {
                  close();
                  set(ph);
                }}
              >
                {ph}
              </Option>
            ))}
            <div className="mx-2 my-1 border-t border-line" />
            <Option
              active={stage.auto}
              icon={<RotateCcw className="h-4 w-4 text-faint" strokeWidth={1.8} />}
              onClick={() => {
                close();
                set(null);
              }}
            >
              Automático (pelas tarefas)
              <span className="block truncate text-[12px] text-faint">{stage.autoLabel}</span>
            </Option>
          </div>
        )}
      </Popover>
    </div>
  );
}

function Option({ active, icon, onClick, children }: { active: boolean; icon?: ReactNode; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={onClick}
      className={cn('flex w-full items-start gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-canvas', active ? 'font-medium text-ink' : 'text-stone-800')}
    >
      <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center">{icon ?? (active ? <Check className="h-3.5 w-3.5 text-ink" strokeWidth={2} /> : null)}</span>
      <span className="min-w-0 flex-1">{children}</span>
      {icon && active && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink" strokeWidth={2} />}
    </button>
  );
}

/** Etapa macro só para leitura (cartões), com o indicador do status interno. */
export function ProjectStageTag({ project, rail, fallback }: { project: Project; rail: { phases: string[]; current: number }; fallback?: string }) {
  const stage = macroStage(project, rail, fallback);
  const isMeeting = stage.label === CLIENT_MEETING_STAGE;
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-ink/[0.04] px-2 py-0.5 text-[12px]" data-project-stage={stage.label}>
      <ProjectStatusDot status={project.status} />
      {isMeeting && <CalendarDays className="h-3 w-3 shrink-0 text-info-fg" strokeWidth={1.8} aria-hidden />}
      <span className={cn('min-w-0 truncate', isMeeting ? 'font-medium text-info-fg' : 'text-stone-700')}>{stage.label}</span>
    </span>
  );
}
