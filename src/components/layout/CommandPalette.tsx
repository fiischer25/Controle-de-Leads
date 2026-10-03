import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Briefcase, CalendarDays, CornerDownLeft, FolderKanban, LayoutGrid, ListChecks, Search, UsersRound } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { cn, matches } from '../../lib/utils';

interface Result {
  id: string;
  group: string;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  to: string;
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { db, maps, me, can } = useData();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const results = useMemo<Result[]>(() => {
    const q = query.trim();
    if (!q) {
      const go: Array<Result | false> = [
        { id: 'go-home', group: 'Ir para', icon: <LayoutGrid className="h-4 w-4" />, title: 'Painel de projetos', to: '/' },
        can('projetos') && { id: 'go-projects', group: 'Ir para', icon: <Briefcase className="h-4 w-4" />, title: 'Projetos', to: '/projetos' },
        { id: 'go-tasks', group: 'Ir para', icon: <ListChecks className="h-4 w-4" />, title: 'Minhas tarefas', to: '/tarefas' },
        { id: 'go-agenda', group: 'Ir para', icon: <CalendarDays className="h-4 w-4" />, title: 'Agenda', to: '/?aba=agenda' },
        can('comercial') && { id: 'go-leads', group: 'Ir para', icon: <FolderKanban className="h-4 w-4" />, title: 'Oportunidades', to: '/oportunidades' },
        can('comercial') && { id: 'go-clients', group: 'Ir para', icon: <UsersRound className="h-4 w-4" />, title: 'Clientes', to: '/clientes' },
      ];
      return go.filter((r): r is Result => !!r);
    }
    const out: Result[] = [];
    const canProjects = can('projetos');
    const canCommercial = can('comercial');
    (canProjects ? db.projects : [])
      .filter((p) => matches(q, p.name, p.code, maps.clients[p.client_id]?.name, p.site_city))
      .slice(0, 6)
      .forEach((p) =>
        out.push({ id: p.id, group: 'Projetos', icon: <Briefcase className="h-4 w-4" />, title: p.name, subtitle: `${p.code} · ${maps.clients[p.client_id]?.name ?? ''}`, to: `/projetos/${p.id}` }),
      );
    (canCommercial ? db.leads : [])
      .filter((l) => matches(q, l.name, l.city, l.phone, l.email))
      .slice(0, 6)
      .forEach((l) =>
        out.push({ id: l.id, group: 'Oportunidades', icon: <FolderKanban className="h-4 w-4" />, title: l.name, subtitle: `${l.city} · ${maps.stages[l.stage_id]?.name ?? ''}`, to: `/oportunidades?lead=${l.id}` }),
      );
    (canCommercial ? db.clients : [])
      .filter((c) => matches(q, c.name, c.document, c.email, c.phone, c.city))
      .slice(0, 6)
      .forEach((c) =>
        out.push({ id: c.id, group: 'Clientes', icon: <UsersRound className="h-4 w-4" />, title: c.name, subtitle: `${c.city}/${c.state}`, to: `/clientes/${c.id}` }),
      );
    db.tasks
      .filter((t) => canProjects || t.assignee_id === me.id || t.created_by === me.id)
      .filter((t) => matches(q, t.title, t.phase))
      .slice(0, 8)
      .forEach((t) =>
        out.push({
          id: t.id, group: 'Tarefas', icon: <ListChecks className="h-4 w-4" />, title: t.title,
          subtitle: t.project_id ? maps.projects[t.project_id]?.name : 'Tarefa avulsa',
          to: `/tarefas?tarefa=${t.id}`,
        }),
      );
    return out;
  }, [query, db, maps, me.id, can]);

  useEffect(() => setActive(0), [query]);

  const go = (r: Result) => {
    navigate(r.to);
    onClose();
  };

  let lastGroup = '';
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-stone-900/40 p-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-xl bg-surface shadow-lg animate-fade-in" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line/70 px-4">
          <Search className="h-5 w-5 text-stone-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={can('comercial') ? 'Buscar projetos, clientes, oportunidades, tarefas…' : can('projetos') ? 'Buscar projetos e tarefas…' : 'Buscar nas minhas tarefas…'}
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-stone-400"
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === 'Enter' && results[active]) go(results[active]);
            }}
          />
        </div>
        <div className="scrollbar-thin max-h-[55vh] overflow-y-auto p-2">
          {results.length === 0 && <p className="px-3 py-10 text-center text-sm text-stone-500">Nada encontrado para “{query}”.</p>}
          {results.map((r, i) => {
            const header = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            return (
              <div key={`${r.group}-${r.id}`}>
                {header && <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-stone-400">{header}</div>}
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r)}
                  className={cn('flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left', i === active ? 'bg-stone-100' : '')}
                >
                  <span className="text-stone-400">{r.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{r.title}</span>
                    {r.subtitle && <span className="block truncate text-xs text-stone-500">{r.subtitle}</span>}
                  </span>
                  {i === active && <CornerDownLeft className="h-4 w-4 text-stone-400" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
