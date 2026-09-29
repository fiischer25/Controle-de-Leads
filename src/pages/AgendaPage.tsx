import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, CalendarDays, ChevronLeft, ChevronRight, FolderKanban, ListChecks, Rocket } from 'lucide-react';
import { useData } from '../context/DataContext';
import { isProjectActive } from '../lib/domain';
import { addDays, cn, formatDate, MONTHS_FULL, parseDate, toDateKey, today, WEEKDAYS_SHORT } from '../lib/utils';
import { Button, Card, Checkbox, PageHeader, Segmented, Select } from '../components/ui';
import { CalendarEmbed } from '../components/dashboard/CalendarEmbed';
import { useOpenTask } from '../components/tasks/useOpenTask';

type Kind = 'delivery' | 'start' | 'task' | 'lead';
interface CalEvent {
  id: string;
  date: string;
  kind: Kind;
  title: string;
  color: string;
  done?: boolean;
  onClick: () => void;
}

const KIND_META: Record<Kind, { label: string; icon: typeof Briefcase }> = {
  delivery: { label: 'Entregas de projeto', icon: Briefcase },
  start: { label: 'Inícios de projeto', icon: Rocket },
  task: { label: 'Prazos de tarefas', icon: ListChecks },
  lead: { label: 'Retornos de leads', icon: FolderKanban },
};

export default function AgendaPage() {
  const { db, maps, me } = useData();
  const navigate = useNavigate();
  const openTask = useOpenTask();
  const [tab, setTab] = useState<'internal' | 'google'>('internal');
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [person, setPerson] = useState<string>('all');
  const [kinds, setKinds] = useState<Record<Kind, boolean>>({ delivery: true, start: true, task: true, lead: true });
  const [selected, setSelected] = useState<string>(today());

  const events = useMemo(() => {
    const out: CalEvent[] = [];
    db.projects.forEach((p) => {
      const include = person === 'all' || p.manager_id === person || p.member_ids.includes(person);
      if (!include || p.status === 'cancelado') return;
      const color = maps.types[p.project_type_id]?.color ?? '#9a5b3f';
      if (p.due_date) out.push({ id: `d${p.id}`, date: p.due_date, kind: 'delivery', title: `Entrega · ${p.name}`, color, done: p.status === 'concluido', onClick: () => navigate(`/projetos/${p.id}`) });
      out.push({ id: `s${p.id}`, date: p.start_date, kind: 'start', title: `Início · ${p.name}`, color, onClick: () => navigate(`/projetos/${p.id}`) });
    });
    db.tasks.forEach((t) => {
      if (!t.due_date) return;
      if (person !== 'all' && t.assignee_id !== person) return;
      const project = t.project_id ? maps.projects[t.project_id] : null;
      if (project && !isProjectActive(project) && project.status !== 'concluido') return;
      out.push({
        id: t.id, date: t.due_date, kind: 'task', title: project ? `${project.name} · ${t.title}` : t.title,
        color: maps.profiles[t.assignee_id ?? '']?.color ?? '#a8a29e', done: t.status === 'done', onClick: () => openTask(t.id),
      });
    });
    db.leads.forEach((l) => {
      if (!l.next_contact_date || maps.stages[l.stage_id]?.kind !== 'open') return;
      if (person !== 'all' && l.owner_id !== person) return;
      out.push({ id: `l${l.id}`, date: l.next_contact_date, kind: 'lead', title: `Retorno · ${l.name}`, color: '#4a3aa7', onClick: () => navigate(`/oportunidades?lead=${l.id}`) });
    });
    return out.filter((e) => kinds[e.kind]);
  }, [db, maps, person, kinds, navigate, openTask]);

  const byDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    events.forEach((e) => (map[e.date] ||= []).push(e));
    return map;
  }, [events]);

  const first = new Date(cursor.y, cursor.m, 1);
  const gridStart = addDays(toDateKey(first), -first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const t = today();
  const move = (delta: number) => setCursor((c) => {
    const d = new Date(c.y, c.m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const dayEvents = byDate[selected] ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Planejamento"
        title="Agenda"
        description="Entregas, prazos de tarefas e retornos comerciais — e o Google Agenda do escritório."
        actions={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { id: 'internal', label: 'Prazos do sistema', icon: <CalendarDays className="h-4 w-4" /> },
              { id: 'google', label: 'Google Agenda' },
            ]}
          />
        }
      />

      {tab === 'google' ? (
        <CalendarEmbed height={720} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => move(-1)} aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></Button>
                <h2 className="w-44 text-center font-display text-lg font-bold">{MONTHS_FULL[cursor.m]} {cursor.y}</h2>
                <Button size="sm" variant="ghost" onClick={() => move(1)} aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></Button>
                <Button size="sm" onClick={() => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }); setSelected(t); }}>Hoje</Button>
              </div>
              <Select value={person} onChange={(e) => setPerson(e.target.value)} className="h-8 w-auto py-1 text-sm">
                <option value="all">Toda a equipe</option>
                <option value={me.id}>Somente eu</option>
                {db.profiles.filter((p) => p.id !== me.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-7 border-b border-stone-100 bg-stone-50 text-center text-[11px] font-semibold uppercase tracking-wide text-stone-500">
              {WEEKDAYS_SHORT.map((d) => <div key={d} className="py-2">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {days.map((key) => {
                const d = parseDate(key);
                const inMonth = d.getMonth() === cursor.m;
                const evs = byDate[key] ?? [];
                const isToday = key === t;
                return (
                  <button
                    key={key}
                    onClick={() => setSelected(key)}
                    className={cn(
                      'min-h-[92px] border-b border-r border-stone-100 p-1.5 text-left align-top transition-colors hover:bg-stone-50 sm:min-h-[110px]',
                      !inMonth && 'bg-stone-50/60 text-stone-400',
                      selected === key && 'bg-brand-50/60 ring-1 ring-inset ring-brand-300',
                    )}
                  >
                    <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold', isToday ? 'bg-brand-600 text-white' : '')}>{d.getDate()}</span>
                    <div className="mt-1 space-y-0.5">
                      {evs.slice(0, 3).map((e) => (
                        <div key={e.id} className={cn('flex items-center gap-1 truncate rounded px-1 py-px text-[10px] sm:text-[11px]', e.done && 'line-through opacity-60')} style={{ backgroundColor: `${e.color}1a`, color: '#292524' }}>
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
                          <span className="truncate">{e.title}</span>
                        </div>
                      ))}
                      {evs.length > 3 && <div className="px-1 text-[10px] font-medium text-stone-500">+{evs.length - 3} mais</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          <div className="space-y-5">
            <Card className="p-4">
              <h3 className="font-display text-sm font-bold">{formatDate(selected)}</h3>
              <ul className="mt-3 space-y-1">
                {dayEvents.length === 0 && <li className="text-sm text-stone-500">Nada neste dia.</li>}
                {dayEvents.map((e) => {
                  const Icon = KIND_META[e.kind].icon;
                  return (
                    <li key={e.id}>
                      <button onClick={e.onClick} className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-stone-50">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: e.color }} />
                        <span className={cn('text-sm', e.done && 'text-stone-400 line-through')}>{e.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
            <Card className="space-y-2 p-4">
              <h3 className="mb-1 font-display text-sm font-bold">Mostrar</h3>
              {(Object.keys(KIND_META) as Kind[]).map((k) => (
                <Checkbox key={k} checked={kinds[k]} onChange={(v) => setKinds((s) => ({ ...s, [k]: v }))} label={KIND_META[k].label} className="flex" />
              ))}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
