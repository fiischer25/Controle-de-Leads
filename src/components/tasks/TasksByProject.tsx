import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, FolderOpen } from 'lucide-react';
import type { Task } from '../../lib/types';
import { cn, formatDateShort, today } from '../../lib/utils';
import { useProjectSummaries } from '../projects/useProjectSummaries';
import { TaskRow } from './TaskRow';
import { byDue, dueBucket } from './taskBuckets';

const COLLAPSED_KEY = 'airos:tarefas-recolhidos';

function readCollapsed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]');
  } catch {
    return [];
  }
}

function Chip({ tone, children }: { tone: 'danger' | 'warning' | 'info' | 'neutral'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-medium tabular',
        tone === 'danger' && 'bg-danger-bg text-danger-fg',
        tone === 'warning' && 'bg-warning-bg text-warning-fg',
        tone === 'info' && 'bg-info-bg text-info-fg',
        tone === 'neutral' && 'bg-stone-100 text-stone-600',
      )}
    >
      {children}
    </span>
  );
}

/**
 * Tarefas abertas agrupadas por projeto: um bloco por projeto (o mais urgente primeiro), com a
 * etapa e o andamento do projeto e quantas tarefas estão atrasadas, para hoje e na semana.
 * As avulsas (sem projeto) formam um bloco próprio.
 */
export function TasksByProject({ tasks, onOpen }: { tasks: Task[]; onOpen: (id: string) => void }) {
  const summaries = useProjectSummaries();
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed);
  const t = today();

  const groups = useMemo(() => {
    const byProject = new Map<string, Task[]>();
    for (const x of tasks) {
      const k = x.project_id ?? '';
      byProject.set(k, [...(byProject.get(k) ?? []), x]);
    }
    const info = Object.fromEntries(summaries.map((s) => [s.project.id, s]));
    return [...byProject.entries()]
      .map(([id, items]) => {
        const sorted = [...items].sort(byDue);
        const count = (b: string) => items.filter((x) => dueBucket(x, t) === b).length;
        return {
          id,
          summary: id ? info[id] : undefined,
          tasks: sorted,
          overdue: count('overdue'),
          today: count('today'),
          week: count('week'),
          doing: items.filter((x) => x.status === 'doing' || x.status === 'review').length,
          next: sorted.find((x) => x.due_date && x.due_date >= t)?.due_date ?? null,
        };
      })
      // Mais urgente primeiro (atrasadas, depois para hoje, depois o prazo mais próximo); avulsas no empate
      .sort(
        (a, b) =>
          b.overdue - a.overdue ||
          b.today - a.today ||
          (a.tasks[0]?.due_date ?? '9999').localeCompare(b.tasks[0]?.due_date ?? '9999') ||
          (a.id ? 0 : 1) - (b.id ? 0 : 1),
      );
  }, [tasks, summaries, t]);

  const toggle = (id: string) =>
    setCollapsed((c) => {
      const next = c.includes(id) ? c.filter((x) => x !== id) : [...c, id];
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      } catch {
        /* só lembra neste navegador */
      }
      return next;
    });

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const key = g.id || 'avulsas';
        const open = !collapsed.includes(key);
        const p = g.summary?.project;
        const name = p ? p.name : 'Tarefas avulsas';
        return (
          <section key={key} aria-label={name} data-task-project={key} className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-card">
            <header className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 md:px-6', open && 'border-b border-hairline-surface')}>
              <button
                type="button"
                onClick={() => toggle(key)}
                aria-expanded={open}
                aria-label={open ? `Recolher ${name}` : `Expandir ${name}`}
                className="-ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-faint hover:bg-ink/5 hover:text-ink"
              >
                <ChevronDown className={cn('h-4 w-4 transition-transform', !open && '-rotate-90')} />
              </button>
              <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-0">
                <div className="flex min-w-0 items-baseline gap-2">
                  {p ? (
                    <Link
                      to={`/projetos/${p.id}`}
                      className="truncate font-display text-[15.5px] font-semibold tracking-[0.01em] text-ink hover:underline hover:decoration-stone-300 hover:underline-offset-4"
                    >
                      {name}
                    </Link>
                  ) : (
                    <span className="flex items-center gap-1.5 font-display text-[15.5px] font-semibold text-ink">
                      <FolderOpen className="h-4 w-4 text-faint" strokeWidth={1.6} />
                      {name}
                    </span>
                  )}
                  <span className="shrink-0 text-[12.5px] tabular text-faint">
                    {g.tasks.length} {g.tasks.length === 1 ? 'tarefa' : 'tarefas'}
                  </span>
                </div>
                {g.summary && (
                  <div className="mt-1 flex min-w-0 items-center gap-2 text-[12.5px] text-muted">
                    <span className="truncate">
                      {g.summary.client?.name ? `${g.summary.client.name} · ` : ''}Etapa: {g.summary.phase}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5" title={`Projeto ${g.summary.progress}% concluído`}>
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-200">
                        <span className="block h-full rounded-full bg-ink/70" style={{ width: `${g.summary.progress}%` }} />
                      </span>
                      <span className="tabular">{g.summary.progress}%</span>
                    </span>
                  </div>
                )}
              </div>
              <div className="flex w-full flex-wrap items-center gap-1.5 pl-9 sm:w-auto sm:pl-0">
                {g.overdue > 0 && (
                  <Chip tone="danger">
                    {g.overdue} {g.overdue === 1 ? 'atrasada' : 'atrasadas'}
                  </Chip>
                )}
                {g.today > 0 && <Chip tone="warning">{g.today} para hoje</Chip>}
                {g.week > 0 && <Chip tone="neutral">{g.week} em 7 dias</Chip>}
                {g.doing > 0 && <Chip tone="info">{g.doing} em andamento</Chip>}
                {!g.overdue && !g.today && g.next && <span className="text-[12.5px] text-faint">próximo prazo {formatDateShort(g.next)}</span>}
              </div>
            </header>
            {open && (
              <div className="divide-y divide-hairline-surface md:[&>div]:px-6">
                {g.tasks.map((x) => (
                  <TaskRow key={x.id} task={x} onOpen={() => onOpen(x.id)} showPhase />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
