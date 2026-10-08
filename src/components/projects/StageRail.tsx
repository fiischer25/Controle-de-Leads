import { CSS_COLOR } from '../../lib/status';
import { cn, deadlineState, diffDays, formatDateShort, today, weekdayDate } from '../../lib/utils';

/** Trilho de etapas: concluídas em grafite, atual em bronze, futuras em cinza (2px). */
export function StageRail({ phases, current, className, thick = false }: { phases: string[]; current: number; className?: string; thick?: boolean }) {
  const h = thick ? 'h-1.5' : 'h-0.5';
  if (phases.length === 0) return <div className={cn(h, 'rounded-full bg-line-strong', className)} />;
  return (
    <div className={cn('flex gap-[3px]', className)} aria-hidden>
      {phases.map((p, i) => (
        <span
          key={p}
          title={p}
          className={cn(h, 'flex-1 rounded-full')}
          style={{ backgroundColor: i < current ? CSS_COLOR.stone(800) : i === current ? CSS_COLOR.accent : CSS_COLOR.lineStrong }}
        />
      ))}
    </div>
  );
}

/** Prazo de projeto em duas linhas, com cor só dentro da janela ou vencido. */
export function ProjectDeadline({ due, soonDays, done }: { due: string | null; soonDays: number; done?: boolean }) {
  if (!due) return <div className="text-[13px] text-faint">Sem prazo</div>;
  if (done) {
    return (
      <div className="leading-tight">
        <div className="text-[13px] text-success-fg">Entregue</div>
        <div className="mt-0.5 text-xs text-faint">{formatDateShort(due)}</div>
      </div>
    );
  }
  const state = deadlineState(due, false, soonDays);
  const d = diffDays(today(), due);
  const main =
    state === 'overdue' ? `venceu ${formatDateShort(due)}` : state === 'today' ? 'hoje' : state === 'soon' ? (d === 1 ? 'amanhã' : `em ${d} dias`) : formatDateShort(due);
  const sub = state === 'ok' ? `${d} dias` : state === 'overdue' ? `há ${-d} ${d === -1 ? 'dia' : 'dias'}` : weekdayDate(due);
  return (
    <div className="leading-tight">
      <div className={cn('text-[13px]', state === 'overdue' ? 'text-danger-fg' : state === 'ok' ? 'text-stone-700' : 'text-warning-fg')}>{main}</div>
      <div className="mt-0.5 text-xs text-faint">{sub}</div>
    </div>
  );
}
