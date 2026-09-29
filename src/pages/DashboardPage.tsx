import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  Clock,
  FolderKanban,
  Layers,
  ListChecks,
  Plus,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { PROJECT_STATUS, PROJECT_STATUS_ORDER } from '../lib/constants';
import { isProjectActive, totalMinutes } from '../lib/domain';
import {
  addDays,
  byPosition,
  cn,
  diffDays,
  formatDate,
  formatDateShort,
  formatMinutes,
  formatRelative,
  MONTHS_FULL,
  startOfWeek,
  today,
  toDateKey,
  WEEKDAYS_SHORT,
  parseDate,
} from '../lib/utils';
import { Avatar, AvatarStack, BarRow, Button, Card, CardHeader, ColorDot, DueBadge, EmptyState, ProgressBar } from '../components/ui';
import { CalendarEmbed } from '../components/dashboard/CalendarEmbed';
import { useProjectSummaries } from '../components/projects/useProjectSummaries';
import { TaskRow } from '../components/tasks/TaskRow';
import { useOpenTask } from '../components/tasks/useOpenTask';
import { LeadFormModal } from '../components/leads/LeadFormModal';
import { TaskFormModal } from '../components/tasks/TaskFormModal';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function DashboardPage() {
  const { db, maps, me, settings } = useData();
  const summaries = useProjectSummaries();
  const navigate = useNavigate();
  const openTask = useOpenTask();
  const [newLead, setNewLead] = useState(false);
  const [newTask, setNewTask] = useState(false);
  const t = today();

  const data = useMemo(() => {
    const active = summaries.filter((s) => isProjectActive(s.project));
    const overdueProjects = active.filter((s) => s.deadline === 'overdue').sort((a, b) => (a.project.due_date ?? '').localeCompare(b.project.due_date ?? ''));
    const soonProjects = active.filter((s) => s.deadline === 'soon' || s.deadline === 'today').sort((a, b) => (a.project.due_date ?? '').localeCompare(b.project.due_date ?? ''));

    const openTasks = db.tasks.filter((x) => {
      if (x.status === 'done') return false;
      if (!x.project_id) return true;
      const project = maps.projects[x.project_id];
      return !!project && isProjectActive(project);
    });
    const overdueTasks = openTasks.filter((x) => x.due_date && x.due_date < t);

    const stageKind = (stageId: string) => maps.stages[stageId]?.kind;
    const openLeads = db.leads.filter((l) => stageKind(l.stage_id) === 'open');
    const since = addDays(t, -90);
    const recent = db.leads.filter((l) => (l.closed_at ?? '').slice(0, 10) >= since);
    const won90 = recent.filter((l) => stageKind(l.stage_id) === 'won').length;
    const lost90 = recent.filter((l) => stageKind(l.stage_id) === 'lost').length;

    // Projetos por etapa (fase atual)
    const byPhase: Record<string, number> = {};
    active.forEach((s) => (byPhase[s.phase] = (byPhase[s.phase] ?? 0) + 1));
    const phaseRows = Object.entries(byPhase).sort((a, b) => b[1] - a[1]);

    const byStatus = PROJECT_STATUS_ORDER.map((st) => ({ status: st, count: summaries.filter((s) => s.project.status === st).length }));

    // Funil e origens
    const funnel = [...db.lead_stages].sort(byPosition).map((s) => ({ stage: s, count: db.leads.filter((l) => l.stage_id === s.id).length }));
    const sourceCounts: Record<string, { total: number; won: number }> = {};
    db.leads.forEach((l) => {
      const key = l.source_id ?? 'none';
      sourceCounts[key] ||= { total: 0, won: 0 };
      sourceCounts[key].total++;
      if (stageKind(l.stage_id) === 'won') sourceCounts[key].won++;
    });
    const sources = Object.entries(sourceCounts)
      .map(([id, v]) => ({ name: id === 'none' ? 'Não informado' : maps.sources[id]?.name ?? '—', ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 7);

    // Carga da equipe
    const ws = startOfWeek(t);
    const team = db.profiles
      .filter((p) => p.active)
      .map((p) => {
        const mine = openTasks.filter((x) => x.assignee_id === p.id);
        return {
          user: p,
          open: mine.length,
          overdue: mine.filter((x) => x.due_date && x.due_date < t).length,
          week: totalMinutes(db.time_entries.filter((e) => e.user_id === p.id && toDateKey(new Date(e.started_at)) >= ws)),
          projects: active.filter((s) => s.people.some((x) => x.id === p.id)).length,
        };
      })
      .sort((a, b) => b.open - a.open);

    const followUps = openLeads
      .filter((l) => l.next_contact_date && l.next_contact_date <= addDays(t, 2))
      .sort((a, b) => (a.next_contact_date ?? '').localeCompare(b.next_contact_date ?? ''));

    const myTasks = openTasks
      .filter((x) => x.assignee_id === me.id && (!x.due_date || x.due_date <= addDays(t, 3)))
      .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
      .slice(0, 8);

    return {
      active, overdueProjects, soonProjects, openTasks, overdueTasks, openLeads, won90, lost90, phaseRows, byStatus,
      funnel, sources, team, followUps, myTasks,
      conversion: won90 + lost90 ? Math.round((won90 / (won90 + lost90)) * 100) : null,
      pendingConversion: db.leads.filter((l) => stageKind(l.stage_id) === 'won' && !l.client_id),
    };
  }, [summaries, db, maps, me.id, t]);

  // Próximos 14 dias: prazos de projetos, tarefas e retornos de leads
  const upcoming = useMemo(() => {
    const end = addDays(t, 14);
    type Ev = { date: string; kind: 'project' | 'task' | 'lead'; title: string; sub: string; onClick: () => void; color: string };
    const evs: Ev[] = [];
    data.active.forEach((s) => {
      if (s.project.due_date && s.project.due_date >= t && s.project.due_date <= end)
        evs.push({ date: s.project.due_date, kind: 'project', title: `Entrega ${s.project.name}`, sub: s.client?.name ?? '', onClick: () => navigate(`/projetos/${s.project.id}`), color: s.type?.color ?? '#9a5b3f' });
    });
    data.openTasks.forEach((x) => {
      if (x.due_date && x.due_date >= t && x.due_date <= end && (x.assignee_id === me.id || !x.project_id))
        evs.push({ date: x.due_date, kind: 'task', title: x.title, sub: x.project_id ? maps.projects[x.project_id]?.name ?? '' : 'Tarefa avulsa', onClick: () => openTask(x.id), color: maps.profiles[x.assignee_id ?? '']?.color ?? '#a8a29e' });
    });
    data.openLeads.forEach((l) => {
      if (l.next_contact_date && l.next_contact_date >= t && l.next_contact_date <= end)
        evs.push({ date: l.next_contact_date, kind: 'lead', title: `Retorno: ${l.name}`, sub: maps.stages[l.stage_id]?.name ?? '', onClick: () => navigate(`/oportunidades?lead=${l.id}`), color: '#4a3aa7' });
    });
    return evs.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 14);
  }, [data, t, me.id, maps, navigate, openTask]);

  const activity = useMemo(() => [...db.activity_log].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 12), [db.activity_log]);
  const now = new Date();
  const maxPhase = Math.max(1, ...data.phaseRows.map(([, c]) => c));
  const maxFunnel = Math.max(1, ...data.funnel.map((f) => f.count));
  const maxSource = Math.max(1, ...data.sources.map((s) => s.total));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-brand-600">
            {WEEKDAYS_SHORT[now.getDay()]}, {now.getDate()} de {MONTHS_FULL[now.getMonth()].toLowerCase()} de {now.getFullYear()}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-[28px]">
            {greeting()}, {me.name.split(' ')[0]}.
          </h1>
          <p className="mt-1 text-sm text-stone-500">Visão geral de tudo o que está acontecendo no escritório.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setNewTask(true)}>Tarefa</Button>
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setNewLead(true)}>Oportunidade</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi to="/projetos" icon={<Briefcase className="h-4 w-4" />} label="Projetos ativos" value={data.active.length} />
        <Kpi to="/projetos" icon={<AlertTriangle className="h-4 w-4" />} label="Projetos vencidos" value={data.overdueProjects.length} tone={data.overdueProjects.length ? 'bad' : 'good'} />
        <Kpi to="/projetos" icon={<CalendarClock className="h-4 w-4" />} label={`A vencer (${settings.due_soon_days} dias)`} value={data.soonProjects.length} tone={data.soonProjects.length ? 'warn' : undefined} />
        <Kpi to="/tarefas" icon={<ListChecks className="h-4 w-4" />} label="Tarefas atrasadas" value={data.overdueTasks.length} tone={data.overdueTasks.length ? 'bad' : 'good'} sub={`${data.openTasks.length} em aberto`} />
        <Kpi to="/oportunidades" icon={<Target className="h-4 w-4" />} label="Oportunidades abertas" value={data.openLeads.length} />
        <Kpi to="/relatorios" icon={<TrendingUp className="h-4 w-4" />} label="Conversão (90 dias)" value={data.conversion === null ? '—' : `${data.conversion}%`} sub={`${data.won90} ganhos · ${data.lost90} perdidos`} />
      </div>

      {data.pendingConversion.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <span className="flex-1">
            <b>{data.pendingConversion.length}</b> oportunidade{data.pendingConversion.length > 1 ? 's fechadas aguardam' : ' fechada aguarda'} o cadastro completo para virar cliente:{' '}
            {data.pendingConversion.slice(0, 3).map((l) => l.name).join(', ')}
          </span>
          <Link to="/oportunidades"><Button size="sm" variant="secondary">Ver no funil</Button></Link>
        </div>
      )}

      {/* Prazos + etapas */}
      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader icon={<AlertTriangle className="h-4 w-4" />} title="Prazos dos projetos" subtitle="Vencidos e próximos de vencer" action={<Link to="/projetos" className="text-xs font-medium text-brand-700 hover:underline">Todos os projetos</Link>} />
          {data.overdueProjects.length + data.soonProjects.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="Nenhum prazo crítico" description={`Nenhum projeto vencido ou vencendo nos próximos ${settings.due_soon_days} dias.`} className="py-8" />
          ) : (
            <div className="divide-y divide-stone-100 border-t border-stone-100">
              {[...data.overdueProjects, ...data.soonProjects].slice(0, 8).map((s) => (
                <Link key={s.project.id} to={`/projetos/${s.project.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-stone-50">
                  <span className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: s.type?.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-stone-900">{s.project.name} <span className="font-normal text-stone-500">· {s.client?.name}</span></div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-stone-500">
                      <span className="truncate">Etapa: {s.phase}</span>
                      <ProgressBar value={s.progress} className="w-20" />
                      <span className="tabular">{s.progress}%</span>
                    </div>
                  </div>
                  <AvatarStack users={s.people} size="xs" />
                  <div className="w-36 shrink-0 text-right"><DueBadge due={s.project.due_date} done={false} soonDays={settings.due_soon_days} /></div>
                </Link>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <CardHeader icon={<Layers className="h-4 w-4" />} title="Projetos por etapa" subtitle="Etapa atual dos projetos ativos" />
          <div className="space-y-3 px-5 pb-5">
            {data.phaseRows.length === 0 && <p className="py-6 text-center text-sm text-stone-500">Sem projetos ativos.</p>}
            {data.phaseRows.map(([phase, count]) => (
              <BarRow key={phase} label={phase} value={count} max={maxPhase} title={`${count} projeto(s) em ${phase}`} onClick={() => navigate('/projetos')} />
            ))}
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-stone-100 pt-3 text-xs text-stone-600">
              {data.byStatus.filter((b) => b.count > 0).map((b) => (
                <span key={b.status} className="inline-flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 rounded-full', PROJECT_STATUS[b.status].dot)} />
                  {PROJECT_STATUS[b.status].label} <b className="tabular">{b.count}</b>
                </span>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Agenda + minhas tarefas */}
      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <CalendarEmbed height={520} />
        <div className="space-y-5">
          <Card>
            <CardHeader icon={<ListChecks className="h-4 w-4" />} title="Minhas tarefas" subtitle="Atrasadas e dos próximos 3 dias" action={<Link to="/tarefas" className="text-xs font-medium text-brand-700 hover:underline">Ver todas</Link>} />
            {data.myTasks.length === 0 ? (
              <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="Tudo em dia!" className="py-8" />
            ) : (
              <div className="divide-y divide-stone-100 border-t border-stone-100">
                {data.myTasks.map((x) => <TaskRow key={x.id} task={x} onOpen={() => openTask(x.id)} showProject showDates={false} />)}
              </div>
            )}
          </Card>
          <Card>
            <CardHeader icon={<CalendarClock className="h-4 w-4" />} title="Próximos 14 dias" subtitle="Entregas, tarefas e retornos" action={<Link to="/agenda" className="text-xs font-medium text-brand-700 hover:underline">Agenda</Link>} />
            {upcoming.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-stone-500">Nada agendado.</p>
            ) : (
              <ul className="space-y-1 px-3 pb-3">
                {upcoming.map((e, i) => {
                  const d = parseDate(e.date);
                  const dd = diffDays(t, e.date);
                  return (
                    <li key={i}>
                      <button onClick={e.onClick} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-stone-50">
                        <div className="w-11 shrink-0 text-center leading-tight">
                          <div className="text-[10px] uppercase text-stone-400">{WEEKDAYS_SHORT[d.getDay()]}</div>
                          <div className={cn('font-display text-base font-bold', dd === 0 ? 'text-brand-700' : 'text-stone-800')}>{d.getDate()}</div>
                        </div>
                        <span className="h-7 w-1 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-stone-800">{e.title}</div>
                          <div className="truncate text-xs text-stone-500">{e.sub}</div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* Comercial + equipe */}
      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        <Card>
          <CardHeader icon={<FolderKanban className="h-4 w-4" />} title="Funil de oportunidades" subtitle="Quantidade por etapa" action={<Link to="/oportunidades" className="text-xs font-medium text-brand-700 hover:underline">Abrir funil</Link>} />
          <div className="space-y-3 px-5 pb-5">
            {data.funnel.map((f) => (
              <BarRow key={f.stage.id} label={<span className="inline-flex items-center gap-2"><ColorDot color={f.stage.color} />{f.stage.name}</span>} value={f.count} max={maxFunnel} color={f.stage.color} onClick={() => navigate('/oportunidades')} />
            ))}
          </div>
          {data.followUps.length > 0 && (
            <div className="border-t border-stone-100 px-5 py-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Retornos pendentes</div>
              <ul className="space-y-1.5">
                {data.followUps.slice(0, 5).map((l) => (
                  <li key={l.id}>
                    <Link to={`/oportunidades?lead=${l.id}`} className="flex items-center justify-between gap-2 text-sm hover:text-brand-700">
                      <span className="truncate">{l.name}</span>
                      <span className={cn('shrink-0 text-xs', l.next_contact_date! < t ? 'font-medium text-rose-600' : 'text-stone-500')}>
                        {l.next_contact_date === t ? 'hoje' : l.next_contact_date! < t ? `atrasado · ${formatDateShort(l.next_contact_date)}` : formatDateShort(l.next_contact_date)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader icon={<Target className="h-4 w-4" />} title="Como os clientes chegam" subtitle="Leads por origem (fechados entre parênteses)" />
          <div className="space-y-3 px-5 pb-5">
            {data.sources.length === 0 && <p className="py-6 text-center text-sm text-stone-500">Sem oportunidades ainda.</p>}
            {data.sources.map((s) => (
              <BarRow key={s.name} label={s.name} value={s.total} max={maxSource} suffix={`(${s.won})`} color="#2a78d6" title={`${s.total} leads, ${s.won} fechados`} />
            ))}
          </div>
        </Card>
        <Card className="lg:col-span-2 2xl:col-span-1">
          <CardHeader icon={<Users className="h-4 w-4" />} title="Carga da equipe" subtitle="Tarefas abertas e horas nesta semana" action={<Link to="/equipe" className="text-xs font-medium text-brand-700 hover:underline">Equipe</Link>} />
          <div className="divide-y divide-stone-100 border-t border-stone-100">
            {data.team.map((m) => (
              <Link key={m.user.id} to={`/equipe?membro=${m.user.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-stone-50">
                <Avatar user={m.user} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.user.name}</div>
                  <div className="text-xs text-stone-500">{m.projects} projeto{m.projects !== 1 ? 's' : ''}</div>
                </div>
                <div className="text-right text-xs">
                  <div className="font-semibold tabular text-stone-900">{m.open} abertas</div>
                  {m.overdue > 0 ? <div className="font-medium text-rose-600">{m.overdue} atrasada{m.overdue > 1 ? 's' : ''}</div> : <div className="text-stone-400">em dia</div>}
                </div>
                <div className="w-16 text-right text-xs text-stone-600">
                  <Clock className="mr-1 inline h-3 w-3" />{formatMinutes(m.week)}
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* Atividade */}
      <Card>
        <CardHeader icon={<Activity className="h-4 w-4" />} title="Atividade recente" />
        {activity.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-stone-500">Nenhuma atividade ainda.</p>
        ) : (
          <ol className="grid gap-x-8 gap-y-3 px-5 pb-5 md:grid-cols-2">
            {activity.map((a) => {
              const u = a.user_id ? maps.profiles[a.user_id] : null;
              return (
                <li key={a.id} className="flex items-start gap-3 text-sm">
                  <Avatar user={u} size="sm" />
                  <div className="min-w-0">
                    <span className="font-medium text-stone-900">{u?.name.split(' ')[0] ?? 'Sistema'}</span> <span className="text-stone-600">{a.description}</span>
                    <div className="text-xs text-stone-400" title={formatDate(toDateKey(new Date(a.created_at)))}>{formatRelative(a.created_at)}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {newLead && <LeadFormModal onClose={() => setNewLead(false)} />}
      {newTask && <TaskFormModal onClose={() => setNewTask(false)} />}
    </div>
  );
}

function Kpi({ to, icon, label, value, tone, sub }: { to: string; icon: ReactNode; label: string; value: ReactNode; tone?: 'bad' | 'warn' | 'good'; sub?: string }) {
  return (
    <Link to={to} className="card group px-4 py-3.5 transition-all hover:-translate-y-0.5 hover:border-stone-300">
      <div className="flex items-center justify-between text-xs text-stone-500">
        <span className="flex items-center gap-1.5">
          <span className={cn(tone === 'bad' ? 'text-rose-600' : tone === 'warn' ? 'text-amber-600' : tone === 'good' ? 'text-emerald-600' : 'text-stone-400')}>{icon}</span>
          {label}
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-stone-300 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className={cn('mt-1.5 font-display text-[26px] font-bold leading-none', tone === 'bad' && value !== 0 ? 'text-rose-700' : 'text-stone-900')}>{value}</div>
      {sub && <div className="mt-1 text-[11px] text-stone-500">{sub}</div>}
    </Link>
  );
}
