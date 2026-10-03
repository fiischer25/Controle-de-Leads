import { useMemo } from 'react';
import { TASK_STATUS } from '../../lib/constants';
import { TASK_STATUS_STYLE } from '../../lib/status';
import { orderedPhases } from '../../lib/domain';
import type { Profile, Task } from '../../lib/types';
import { addDays, byPosition, cn, diffDays, formatDate, MONTHS_FULL, parseDate, today } from '../../lib/utils';
import { Avatar, EmptyState } from '../ui';


/** Cronograma (Gantt) das tarefas do projeto, agrupado por etapa. */
export function GanttChart({
  tasks,
  profiles,
  projectDue,
  onOpen,
}: {
  tasks: Task[];
  profiles: Record<string, Profile>;
  projectDue: string | null;
  onOpen: (id: string) => void;
}) {
  const dated = useMemo(() => tasks.filter((t) => t.start_date || t.due_date).sort(byPosition), [tasks]);
  const range = useMemo(() => {
    if (dated.length === 0) return null;
    const keys = dated.flatMap((t) => [t.start_date ?? t.due_date!, t.due_date ?? t.start_date!]);
    if (projectDue) keys.push(projectDue);
    keys.push(today());
    const min = keys.reduce((a, b) => (a < b ? a : b));
    const max = keys.reduce((a, b) => (a > b ? a : b));
    const start = addDays(min, -2);
    const end = addDays(max, 3);
    return { start, end, days: diffDays(start, end) + 1 };
  }, [dated, projectDue]);

  if (!range) {
    return <EmptyState title="Sem datas para exibir" description="Defina datas de início e término nas tarefas para ver o cronograma." />;
  }

  const DAY = range.days > 150 ? 8 : range.days > 80 ? 14 : 22;
  const width = range.days * DAY;
  const x = (key: string) => diffDays(range.start, key) * DAY;
  const phases = orderedPhases(dated);

  // Cabeçalho de meses
  const months: Array<{ label: string; left: number; width: number }> = [];
  for (let i = 0; i < range.days; ) {
    const key = addDays(range.start, i);
    const d = parseDate(key);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const span = Math.min(daysInMonth - d.getDate() + 1, range.days - i);
    months.push({ label: `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`, left: i * DAY, width: span * DAY });
    i += span;
  }
  const weeks: number[] = [];
  for (let i = 0; i < range.days; i++) if (parseDate(addDays(range.start, i)).getDay() === 1) weeks.push(i);

  const t = today();
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="flex">
        {/* Coluna fixa */}
        <div className="w-60 shrink-0 border-r border-line bg-surface sm:w-72">
          <div className="h-12 border-b border-line bg-stone-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Tarefa</div>
          {phases.map((phase) => (
            <div key={phase}>
              <div className="flex h-8 items-center bg-stone-50/70 px-3 text-xs font-semibold text-stone-700">{phase}</div>
              {dated.filter((tk) => (tk.phase || 'Geral') === phase).map((tk) => (
                <button key={tk.id} onClick={() => onOpen(tk.id)} className="flex h-9 w-full items-center gap-2 px-3 text-left hover:bg-stone-50">
                  <Avatar user={tk.assignee_id ? profiles[tk.assignee_id] : null} size="xs" />
                  <span className={cn('truncate text-xs', tk.status === 'done' ? 'text-stone-400 line-through' : 'text-stone-700')}>{tk.title}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        {/* Linha do tempo */}
        <div className="scrollbar-thin flex-1 overflow-x-auto">
          <div style={{ width }} className="relative">
            <div className="relative h-12 border-b border-line bg-stone-50">
              {months.map((m) => (
                <div key={m.left} className="absolute top-0 h-6 truncate border-l border-line px-2 pt-1 text-[11px] font-semibold text-stone-600" style={{ left: m.left, width: m.width }}>
                  {m.label}
                </div>
              ))}
              {weeks.map((i) => (
                <div key={i} className="absolute bottom-0 h-6 border-l border-line pl-1 pt-1 text-[10px] text-stone-400" style={{ left: i * DAY }}>
                  {parseDate(addDays(range.start, i)).getDate()}
                </div>
              ))}
            </div>
            <div className="relative">
              {/* grade semanal e fins de semana */}
              {weeks.map((i) => (
                <div key={i} className="absolute inset-y-0 border-l border-line/70" style={{ left: i * DAY }} />
              ))}
              {DAY >= 14 &&
                Array.from({ length: range.days }, (_, i) => i)
                  .filter((i) => [0, 6].includes(parseDate(addDays(range.start, i)).getDay()))
                  .map((i) => <div key={`w${i}`} className="absolute inset-y-0 bg-stone-100/60" style={{ left: i * DAY, width: DAY }} />)}
              {/* hoje */}
              <div className="absolute inset-y-0 z-10 w-px bg-danger-solid" style={{ left: x(t) + DAY / 2 }} title="Hoje">
                <span className="absolute -top-1 -translate-x-1/2 rounded bg-danger-solid px-1 text-[9px] font-bold text-surface">HOJE</span>
              </div>
              {projectDue && (
                <div className="absolute inset-y-0 z-10 w-0 border-l-2 border-dashed border-ink/60" style={{ left: x(projectDue) + DAY }} title={`Prazo do projeto: ${formatDate(projectDue)}`} />
              )}
              {phases.map((phase) => (
                <div key={phase}>
                  <div className="h-8 bg-stone-50/40" />
                  {dated.filter((tk) => (tk.phase || 'Geral') === phase).map((tk) => {
                    const s = tk.start_date ?? tk.due_date!;
                    const e = tk.due_date ?? tk.start_date!;
                    const late = tk.status !== 'done' && tk.due_date && tk.due_date < t;
                    return (
                      <div key={tk.id} className="relative h-9">
                        <button
                          onClick={() => onOpen(tk.id)}
                          title={`${tk.title}\n${formatDate(s)} → ${formatDate(e)} · ${TASK_STATUS[tk.status].label}`}
                          className={cn('absolute top-2 h-5 rounded-[4px] transition-all hover:brightness-110', late && 'ring-2 ring-danger-solid ring-offset-1')}
                          style={{ left: x(s) + 1, width: Math.max(DAY - 2, (diffDays(s, e) + 1) * DAY - 2), backgroundColor: TASK_STATUS_STYLE[tk.status].color }}
                        >
                          {DAY >= 14 && (diffDays(s, e) + 1) * DAY > 60 && (
                            <span className={cn('block truncate px-1.5 text-left text-[10px] font-medium leading-5', tk.status === 'todo' ? 'text-stone-900' : 'text-surface')}>{tk.title}</span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-line bg-stone-50 px-4 py-2 text-xs text-stone-600">
        {(Object.keys(TASK_STATUS_STYLE) as Task['status'][]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-[2px]" style={{ backgroundColor: TASK_STATUS_STYLE[s].color }} />{TASK_STATUS[s].label}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-px bg-danger-solid" /> Hoje</span>
        {projectDue && <span className="inline-flex items-center gap-1.5"><span className="h-3 border-l-2 border-dashed border-ink/60" /> Prazo do projeto</span>}
      </div>
    </div>
  );
}
