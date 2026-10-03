import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { CSS_COLOR, personColor } from '../../lib/status';
import { isProjectActive } from '../../lib/domain';
import { addDays, cn, formatDate, isoToLocalTime, MONTHS_FULL, parseDate, toDateKey, today, WEEKDAYS_SHORT } from '../../lib/utils';
import { EventFormModal } from '../events/EventFormModal';
import type { CalendarEvent } from '../../lib/types';
import { ActionLink, Avatar, Button, Checkbox, FilterPick, IconButton, SectionHeader, Tabs, Toolbar } from '../ui';
import { CalendarEmbed } from '../dashboard/CalendarEmbed';
import { useOpenTask } from '../tasks/useOpenTask';

type Kind = 'meeting' | 'delivery' | 'start' | 'task' | 'lead';
interface CalEvent {
  id: string;
  date: string;
  kind: Kind;
  title: string;
  time?: string;
  color: string;
  done?: boolean;
  onClick: () => void;
}

const KIND_META: Record<Kind, { label: string; one: string }> = {
  meeting: { label: 'Reuniões', one: 'Reunião' },
  delivery: { label: 'Entregas de projeto', one: 'Entrega de projeto' },
  start: { label: 'Inícios de projeto', one: 'Início de projeto' },
  task: { label: 'Prazos de tarefas', one: 'Prazo de tarefa' },
  lead: { label: 'Retornos de leads', one: 'Retorno de lead' },
};

/** Agenda do escritório (calendário do sistema + Google Agenda). Fica nas telas iniciais (Meu painel e dashboard do escritório). */
/** `mine`: começa mostrando só a agenda de quem está usando (painel pessoal). */
export function AgendaView({ mine = false }: { mine?: boolean } = {}) {
  const { db, maps, me, can } = useData();
  const navigate = useNavigate();
  const canProjects = can('projetos');
  const canCommercial = can('comercial');
  const openTask = useOpenTask();
  const [tab, setTab] = useState<'internal' | 'google'>('internal');
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [person, setPerson] = useState<string>(mine ? me.id : 'all');
  const [kinds, setKinds] = useState<Record<Kind, boolean>>({ meeting: true, delivery: true, start: true, task: true, lead: true });
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [creatingOn, setCreatingOn] = useState<string | null>(null);
  const eventParam = params.get('evento');
  const paramEvent = eventParam ? db.events.find((e) => e.id === eventParam) ?? null : null;
  const closeEditor = () => {
    setEditing(null);
    if (eventParam) {
      const next = new URLSearchParams(params);
      next.delete('evento');
      setParams(next, { replace: true });
    }
  };
  const [selected, setSelected] = useState<string>(today());

  const events = useMemo(() => {
    const out: CalEvent[] = [];
    db.events.forEach((ev) => {
      if (person !== 'all' && !ev.participant_ids.includes(person) && ev.created_by !== person) return;
      out.push({
        id: `e${ev.id}`, date: toDateKey(new Date(ev.starts_at)), kind: 'meeting', title: ev.title,
        time: ev.all_day ? 'Dia todo' : isoToLocalTime(ev.starts_at), color: CSS_COLOR.ink, onClick: () => setEditing(ev),
      });
    });
    db.projects.forEach((p) => {
      const include = person === 'all' || p.manager_id === person || p.member_ids.includes(person);
      if (!include || p.status === 'cancelado') return;
      const color = maps.types[p.project_type_id]?.color ?? CSS_COLOR.brand(500);
      if (p.due_date) out.push({ id: `d${p.id}`, date: p.due_date, kind: 'delivery', title: `Entrega · ${p.name}`, color, done: p.status === 'concluido', onClick: () => canProjects && navigate(`/projetos/${p.id}`) });
      out.push({ id: `s${p.id}`, date: p.start_date, kind: 'start', title: `Início · ${p.name}`, color, onClick: () => canProjects && navigate(`/projetos/${p.id}`) });
    });
    db.tasks.forEach((t) => {
      if (!t.due_date) return;
      if (person !== 'all' && t.assignee_id !== person) return;
      const project = t.project_id ? maps.projects[t.project_id] : null;
      if (project && !isProjectActive(project) && project.status !== 'concluido') return;
      out.push({
        id: t.id, date: t.due_date, kind: 'task', title: project ? `${project.name} · ${t.title}` : t.title,
        color: personColor(t.assignee_id), done: t.status === 'done', onClick: () => openTask(t.id),
      });
    });
    db.leads.forEach((l) => {
      if (!l.next_contact_date || maps.stages[l.stage_id]?.kind !== 'open') return;
      if (person !== 'all' && l.owner_id !== person) return;
      out.push({ id: `l${l.id}`, date: l.next_contact_date, kind: 'lead', title: `Retorno · ${l.name}`, color: CSS_COLOR.brand(500), onClick: () => canCommercial && navigate(`/oportunidades?lead=${l.id}`) });
    });
    return out.filter((e) => kinds[e.kind]).sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
  }, [db, maps, person, kinds, navigate, openTask, canProjects, canCommercial]);

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
  const selectedDate = parseDate(selected);

  return (
    <div>
      <Toolbar
        filters={
          tab === 'internal' && (
            <>
              <div className="flex items-center gap-0.5">
                <IconButton label="Mês anterior" size="sm" onClick={() => move(-1)}>
                  <ChevronLeft className="h-4 w-4" strokeWidth={1.6} />
                </IconButton>
                <h2 className="min-w-[150px] text-center font-display text-section text-ink">
                  {MONTHS_FULL[cursor.m]} {cursor.y}
                </h2>
                <IconButton label="Próximo mês" size="sm" onClick={() => move(1)}>
                  <ChevronRight className="h-4 w-4" strokeWidth={1.6} />
                </IconButton>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const d = new Date();
                  setCursor({ y: d.getFullYear(), m: d.getMonth() });
                  setSelected(t);
                }}
              >
                Hoje
              </Button>
              <FilterPick
                label="Pessoa"
                allLabel="Toda a equipe"
                value={person === 'all' ? '' : person}
                onChange={(v) => setPerson(v || 'all')}
                options={[
                  { value: me.id, label: 'Somente eu', icon: <Avatar user={me} size="xs" /> },
                  ...db.profiles.filter((p) => p.id !== me.id && p.active).map((p) => ({ value: p.id, label: p.name, icon: <Avatar user={p} size="xs" /> })),
                ]}
              />
            </>
          )
        }
        aside={
          <Tabs<'internal' | 'google'>
            tabs={[
              { id: 'internal', label: 'Calendário' },
              { id: 'google', label: 'Google Agenda' },
            ]}
            value={tab}
            onChange={setTab}
            size="sm"
            underline={1}
            bordered={false}
          />
        }
      />

      <div className="mt-6 md:mt-8">
        {tab === 'google' ? (
          <CalendarEmbed height={720} />
        ) : (
          <div className="grid gap-12 xl:grid-cols-[1fr_300px] xl:gap-16">
            <div className="min-w-0">
              <div className="grid grid-cols-7 border-b border-hairline pb-2 text-[12px] text-faint">
                {WEEKDAYS_SHORT.map((d) => (
                  <div key={d} className="px-1.5">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {days.map((key) => {
                  const d = parseDate(key);
                  const inMonth = d.getMonth() === cursor.m;
                  const evs = byDate[key] ?? [];
                  const isToday = key === t;
                  const isSel = selected === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelected(key)}
                      onDoubleClick={() => setCreatingOn(key)}
                      title="Clique duas vezes para agendar uma reunião"
                      aria-label={`${formatDate(key)}: ${evs.length} ${evs.length === 1 ? 'item' : 'itens'}`}
                      aria-pressed={isSel}
                      className={cn(
                        'flex min-h-[56px] flex-col items-stretch justify-start border-b border-hairline p-1 text-left transition-colors sm:min-h-[112px] sm:p-1.5',
                        isSel ? 'bg-brand-50 shadow-[inset_0_2px_0_rgb(var(--accent))]' : 'hover:bg-ink/[0.025]',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-flex h-6 w-6 items-center justify-center rounded-full text-[12.5px] tabular',
                          isToday ? 'bg-ink font-medium text-surface' : inMonth ? 'text-ink' : 'text-stone-300',
                        )}
                      >
                        {d.getDate()}
                      </span>
                      {/* Celular: só pontos; o dia selecionado mostra os detalhes abaixo. */}
                      <div className="mt-1.5 flex flex-wrap gap-1 px-1 sm:hidden" aria-hidden>
                        {evs.slice(0, 6).map((e) => (
                          <span key={e.id} className={cn('h-1.5 w-1.5 rounded-full', (e.done || !inMonth) && 'opacity-40')} style={{ backgroundColor: e.color }} />
                        ))}
                      </div>
                      <div className="mt-1 hidden space-y-0.5 sm:block">
                        {evs.slice(0, 3).map((e) => (
                          <div
                            key={e.id}
                            className={cn('flex items-center gap-1 truncate px-0.5 text-[11.5px] leading-4', e.done ? 'text-faint line-through' : 'text-stone-700', !inMonth && 'opacity-50')}
                          >
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
                            {e.time && e.kind === 'meeting' && <span className="shrink-0 font-mono text-[10.5px] tabular text-muted">{e.time}</span>}
                            <span className="truncate">{e.title}</span>
                          </div>
                        ))}
                        {evs.length > 3 && <div className="px-0.5 text-[10.5px] text-faint">+{evs.length - 3}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <aside className="space-y-10">
              <section aria-labelledby="dia">
                <SectionHeader
                  id="dia"
                  title={`${WEEKDAYS_SHORT[selectedDate.getDay()]}, ${selectedDate.getDate()} de ${MONTHS_FULL[selectedDate.getMonth()].toLowerCase()}`}
                  aside={<ActionLink onClick={() => setCreatingOn(selected)}>Reunião</ActionLink>}
                />
                {dayEvents.length === 0 ? (
                  <p className="border-t border-hairline py-3 text-[13px] text-faint">Nada neste dia.</p>
                ) : (
                  <ul>
                    {dayEvents.map((e) => (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={e.onClick}
                          className="grid w-full grid-cols-[44px_minmax(0,1fr)] gap-3 border-t border-hairline py-3 text-left transition-colors hover:bg-ink/[0.025]"
                        >
                          <span className="pt-px font-mono text-xs tabular text-muted">{e.time ?? ''}</span>
                          <span className="min-w-0">
                            <span className={cn('block truncate text-[13.5px] leading-5', e.done ? 'text-faint line-through' : 'text-ink')}>{e.title}</span>
                            <span className="flex items-center gap-1.5 text-[12.5px] text-faint">
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: e.color }} aria-hidden />
                              {KIND_META[e.kind].one}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section aria-labelledby="mostrar">
                <SectionHeader id="mostrar" title="Mostrar" />
                <div className="flex flex-col gap-2.5 border-t border-hairline pt-3">
                  {(Object.keys(KIND_META) as Kind[]).filter((k) => k !== 'lead' || canCommercial).map((k) => (
                    <Checkbox key={k} checked={kinds[k]} onChange={(v) => setKinds((st) => ({ ...st, [k]: v }))} label={<span className="text-[13.5px]">{KIND_META[k].label}</span>} />
                  ))}
                </div>
              </section>
            </aside>
          </div>
        )}
      </div>
      {(editing || paramEvent) && <EventFormModal event={(editing ?? paramEvent)!} onClose={closeEditor} />}
      {creatingOn && <EventFormModal defaults={{ date: creatingOn }} onClose={() => setCreatingOn(null)} />}
    </div>
  );
}
