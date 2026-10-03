import { useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { useProjectSummaries, type ProjectSummary } from '../projects/useProjectSummaries';
import { projectRail, templatePhasesByType } from '../projects/rail';
import { isProjectActive, totalMinutes } from '../../lib/domain';
import { stageColor } from '../../lib/status';
import type { Lead, LeadStage, Profile, Task } from '../../lib/types';
import {
  addDays,
  byPosition,
  diffDays,
  formatCurrency,
  formatDateShort,
  isoToLocalTime,
  startOfWeek,
  today,
  toDateKey,
  weekdayDate,
} from '../../lib/utils';

// ---------------------------------------------------------------- Fila "Pede sua atenção"
export type AttentionKind = 'task' | 'followup' | 'deadline' | 'stale_leads' | 'pending_client';
export type AttentionGroup = 'overdue' | 'today' | 'week';
export type AttentionCategory = 'tarefas' | 'comercial' | 'projetos';
export type AttentionDot = 'danger' | 'warning' | 'neutral' | 'brand';

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  group: AttentionGroup;
  category: AttentionCategory;
  title: string;
  /** "{tipo} · {contexto}" */
  context: string;
  /** Texto à direita: "venceu 1 out", "hoje", "qui, 8 out", "há +7 dias". */
  meta: string;
  dot: AttentionDot;
  /** Data de referência para ordenar (mais atrasado primeiro). */
  date: string;
  assigneeId: string | null;
  taskId?: string;
  leadId?: string;
  projectId?: string;
  phone?: string;
  action: string;
}

export const GROUP_ORDER: AttentionGroup[] = ['overdue', 'today', 'week'];
export const GROUP_LABEL: Record<AttentionGroup, string> = { overdue: 'Atrasado', today: 'Hoje', week: 'Nesta semana' };

// ---------------------------------------------------------------- Agenda
export interface AgendaItem {
  id: string;
  date: string;
  /** Horário "HH:MM" (reuniões); vazio = dia todo / "hoje". */
  time: string | null;
  title: string;
  context: string;
  /** Prazo de projeto: contexto em warning. */
  deadline?: boolean;
  /** Já passou (reunião encerrada). */
  past?: boolean;
  href?: string;
  taskId?: string;
  leadId?: string;
}

export interface HomeProject {
  summary: ProjectSummary;
  phases: string[];
  /** Índice da etapa atual em `phases` (-1 = sem tarefas, phases.length = concluído). */
  current: number;
}

export interface FunnelRow {
  stage: LeadStage;
  count: number;
  value: number;
  color: string;
}

export interface TeamRow {
  user: Profile;
  minutes: number;
  open: number;
  overdue: number;
}

function firstName(p: Profile | undefined) {
  return p?.name.split(' ')[0] ?? '';
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Dados das telas iniciais. `scope = 'me'` (padrão): agenda com as entregas dos meus projetos;
 * `'office'`: entregas de todos os projetos (dashboard do escritório).
 */
export function useHomeData(scope: 'me' | 'office' = 'me') {
  const { db, maps, me, settings, can } = useData();
  const canProjects = can('projetos');
  const canCommercial = can('comercial');
  const summaries = useProjectSummaries();

  return useMemo(() => {
    const t = today();
    const soonDays = settings.due_soon_days || 7;
    const staleDays = settings.lead_stale_days || 7;
    const stageKind = (id: string) => maps.stages[id]?.kind;

    const activeSummaries = summaries.filter((s) => isProjectActive(s.project));
    const openTasks: Task[] = db.tasks.filter((x) => {
      if (x.status === 'done') return false;
      if (!x.project_id) return true;
      const p = maps.projects[x.project_id];
      return !!p && isProjectActive(p);
    });
    const openLeads: Lead[] = db.leads.filter((l) => stageKind(l.stage_id) === 'open');

    // Meus projetos: sou responsável, faço parte da equipe ou tenho tarefa aberta nele.
    const myProjectIds = new Set<string>();
    for (const s of activeSummaries) {
      if (s.project.manager_id === me.id || s.project.member_ids.includes(me.id)) myProjectIds.add(s.project.id);
    }
    for (const x of openTasks) if (x.assignee_id === me.id && x.project_id) myProjectIds.add(x.project_id);

    // ------------------------------------------------------------ fila de atenção
    const items: AttentionItem[] = [];

    for (const x of openTasks) {
      if (!x.due_date || x.due_date > t) continue;
      const project = x.project_id ? maps.projects[x.project_id] : null;
      const assignee = x.assignee_id ? maps.profiles[x.assignee_id] : undefined;
      const overdue = x.due_date < t;
      const ctx = ['Tarefa', project ? project.name : 'Avulsa', x.phase, assignee && assignee.id !== me.id ? firstName(assignee) : null];
      items.push({
        id: `task-${x.id}`,
        kind: 'task',
        group: overdue ? 'overdue' : 'today',
        category: 'tarefas',
        title: x.title,
        context: ctx.filter(Boolean).join(' · '),
        meta: overdue ? (diffDays(x.due_date, t) === 1 ? 'venceu ontem' : `venceu ${formatDateShort(x.due_date)}`) : 'hoje',
        dot: overdue ? 'danger' : 'warning',
        date: x.due_date,
        assigneeId: x.assignee_id,
        taskId: x.id,
        projectId: x.project_id ?? undefined,
        action: 'Abrir tarefa',
      });
    }

    const followUpIds = new Set<string>();
    for (const l of openLeads) {
      if (!l.next_contact_date || l.next_contact_date > t) continue;
      followUpIds.add(l.id);
      const overdue = l.next_contact_date < t;
      const tail = l.proposal_value ? formatCurrency(l.proposal_value) : l.area_m2 ? `${l.area_m2} m²` : null;
      items.push({
        id: `followup-${l.id}`,
        kind: 'followup',
        group: overdue ? 'overdue' : 'today',
        category: 'comercial',
        title: l.name,
        context: ['Retorno', maps.stages[l.stage_id]?.name, l.city, tail].filter(Boolean).join(' · '),
        meta: overdue ? `desde ${formatDateShort(l.next_contact_date)}` : 'hoje',
        dot: overdue ? 'danger' : 'warning',
        date: l.next_contact_date,
        assigneeId: l.owner_id,
        leadId: l.id,
        phone: l.phone,
        action: 'Registrar contato',
      });
    }

    for (const s of activeSummaries) {
      const due = s.project.due_date;
      if (!due || due > addDays(t, soonDays)) continue;
      const d = diffDays(t, due);
      const group: AttentionGroup = d < 0 ? 'overdue' : d === 0 ? 'today' : 'week';
      items.push({
        id: `deadline-${s.project.id}`,
        kind: 'deadline',
        group,
        category: 'projetos',
        title: `${s.project.name} · ${d < 0 ? 'entrega vencida' : d === 0 ? 'entrega hoje' : d === 1 ? 'entrega amanhã' : `entrega em ${d} dias`}`,
        context: `Prazo · ${plural(s.openTasks, 'tarefa aberta', 'tarefas abertas')}${s.openTasks ? ` em ${s.phase}` : ''}`,
        meta: d < 0 ? `venceu ${formatDateShort(due)}` : d === 0 ? 'hoje' : weekdayDate(due),
        dot: d < 0 ? 'danger' : d === 0 ? 'warning' : 'neutral',
        date: due,
        assigneeId: s.project.manager_id,
        projectId: s.project.id,
        action: 'Ver projeto',
      });
    }

    // Leads parados: dias na mesma etapa acima do limite (e sem retorno vencido, já listado acima).
    const staleByStage: Record<string, Array<{ lead: Lead; days: number }>> = {};
    for (const l of openLeads) {
      if (followUpIds.has(l.id)) continue;
      const days = diffDays(toDateKey(new Date(l.stage_changed_at)), t);
      if (days > staleDays) (staleByStage[l.stage_id] ||= []).push({ lead: l, days });
    }
    for (const [stageId, list] of Object.entries(staleByStage)) {
      list.sort((a, b) => b.days - a.days);
      const stage = maps.stages[stageId]?.name ?? 'etapa';
      const names = list.slice(0, 2).map((x) => `${x.lead.name} (${x.days} dias)`);
      if (list.length > 2) names.push(`+${list.length - 2}`);
      const single = list.length === 1 ? list[0].lead : null;
      items.push({
        id: `stale-${stageId}`,
        kind: 'stale_leads',
        group: 'week',
        category: 'comercial',
        title: single ? `${single.name} parado em ${stage}` : `${list.length} leads parados em ${stage}`,
        context: ['Comercial', ...names].join(' · '),
        meta: `há +${staleDays} dias`,
        dot: 'neutral',
        date: '9999-12-30',
        assigneeId: single?.owner_id ?? null,
        leadId: single?.id,
        action: 'Ver no funil',
      });
    }

    for (const l of db.leads) {
      if (stageKind(l.stage_id) !== 'won' || l.client_id) continue;
      items.push({
        id: `pending-${l.id}`,
        kind: 'pending_client',
        group: 'week',
        category: 'comercial',
        title: `${l.name} aguarda cadastro`,
        context: 'Comercial · Oportunidade fechada · completar dados para virar cliente',
        meta: l.closed_at ? `fechada ${formatDateShort(l.closed_at.slice(0, 10))}` : '',
        dot: 'brand',
        date: '9999-12-31',
        assigneeId: l.owner_id,
        leadId: l.id,
        phone: l.phone,
        action: 'Completar',
      });
    }

    // Só o que a pessoa pode acessar: sem "Projetos", apenas as próprias tarefas; comercial só com "Comercial".
    const allowed = items.filter((i) => {
      if (i.kind === 'task') return canProjects || i.assigneeId === me.id || maps.tasks[i.taskId ?? '']?.created_by === me.id;
      if (i.kind === 'deadline') return canProjects;
      return canCommercial;
    });
    items.length = 0;
    items.push(...allowed);

    // Por grupo, depois do mais atrasado (data mais antiga) para o mais recente.
    items.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

    // ------------------------------------------------------------ agenda (hoje e próximos dias)
    const now = Date.now();
    const agenda: AgendaItem[] = [];
    for (const ev of db.events) {
      if (!ev.participant_ids.includes(me.id) && ev.created_by !== me.id) continue;
      const day = toDateKey(new Date(ev.starts_at));
      if (day < t || day > addDays(t, 30)) continue;
      const end = ev.ends_at ? new Date(ev.ends_at).getTime() : new Date(ev.starts_at).getTime() + 3_600_000;
      const project = ev.project_id ? maps.projects[ev.project_id] : null;
      agenda.push({
        id: `ev-${ev.id}`,
        date: day,
        time: ev.all_day ? null : isoToLocalTime(ev.starts_at),
        title: ev.title,
        context: ev.location || project?.name || plural(ev.participant_ids.length, 'participante', 'participantes'),
        past: !ev.all_day && end < now,
        href: `/?aba=agenda&evento=${ev.id}`,
      });
    }
    for (const s of activeSummaries) {
      const due = s.project.due_date;
      if (!due || due < t || due > addDays(t, 30)) continue;
      if (scope === 'me' && !myProjectIds.has(s.project.id)) continue;
      agenda.push({
        id: `due-${s.project.id}`,
        date: due,
        time: null,
        title: `Entrega · ${s.project.name}`,
        context: s.client?.name ? `Prazo do projeto · ${s.client.name}` : 'Prazo do projeto',
        deadline: true,
        href: `/projetos/${s.project.id}`,
      });
    }
    for (const l of openLeads) {
      if (!l.next_contact_date || l.next_contact_date <= t || l.next_contact_date > addDays(t, 30)) continue;
      if (l.owner_id && l.owner_id !== me.id) continue;
      agenda.push({ id: `ret-${l.id}`, date: l.next_contact_date, time: null, title: `Retorno · ${l.name}`, context: maps.stages[l.stage_id]?.name ?? 'Oportunidade', leadId: l.id });
    }
    for (const x of openTasks) {
      if (x.assignee_id !== me.id || !x.due_date || x.due_date <= t || x.due_date > addDays(t, 30)) continue;
      const project = x.project_id ? maps.projects[x.project_id] : null;
      agenda.push({ id: `tk-${x.id}`, date: x.due_date, time: null, title: x.title, context: project ? `Tarefa · ${project.name}` : 'Tarefa avulsa', taskId: x.id });
    }
    agenda.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
    const todayEvents = agenda.filter((a) => a.date === t);
    const upcomingEvents = agenda.filter((a) => a.date > t).slice(0, 5);

    // ------------------------------------------------------------ números
    const since = addDays(t, -90);
    const closed90 = db.leads.filter((l) => (l.closed_at ?? '').slice(0, 10) >= since);
    const won90 = closed90.filter((l) => stageKind(l.stage_id) === 'won').length;
    const lost90 = closed90.filter((l) => stageKind(l.stage_id) === 'lost').length;
    const kpis = {
      activeProjects: activeSummaries.length,
      overdueProjects: activeSummaries.filter((s) => s.deadline === 'overdue').length,
      dueSoon: activeSummaries.filter((s) => s.deadline === 'soon' || s.deadline === 'today').length,
      overdueTasks: openTasks.filter((x) => x.due_date && x.due_date < t).length,
      openLeads: openLeads.length,
      conversion: won90 + lost90 ? Math.round((won90 / (won90 + lost90)) * 100) : null,
      won90,
      lost90,
    };

    // ------------------------------------------------------------ projetos (por urgência)
    const templatesByType = templatePhasesByType(db.task_templates);
    const urgency = (s: ProjectSummary) => (s.deadline === 'overdue' || s.overdueTasks > 0 ? 0 : 1);
    const projects: HomeProject[] = [...activeSummaries]
      .sort((a, b) => urgency(a) - urgency(b) || (a.project.due_date ?? '9999').localeCompare(b.project.due_date ?? '9999'))
      .map((summary) => ({ summary, ...projectRail(summary, templatesByType[summary.project.project_type_id]) }));

    // ------------------------------------------------------------ funil
    const stagesSorted = [...db.lead_stages].sort(byPosition);
    const funnel: FunnelRow[] = stagesSorted
      .filter((s) => s.kind === 'open')
      .map((stage) => {
        const leads = openLeads.filter((l) => l.stage_id === stage.id);
        return {
          stage,
          count: leads.length,
          value: leads.reduce((acc, l) => acc + (l.proposal_value ?? 0), 0),
          color: stageColor(stage, db.lead_stages),
        };
      });
    const funnelTotal = funnel.reduce((acc, f) => acc + f.value, 0);

    // ------------------------------------------------------------ equipe na semana
    const ws = startOfWeek(t);
    const team: TeamRow[] = db.profiles
      .filter((p) => p.active)
      .map((p) => {
        const mine = openTasks.filter((x) => x.assignee_id === p.id);
        return {
          user: p,
          open: mine.length,
          overdue: mine.filter((x) => x.due_date && x.due_date < t).length,
          minutes: totalMinutes(db.time_entries.filter((e) => e.user_id === p.id && toDateKey(new Date(e.started_at)) >= ws)),
        };
      })
      .sort((a, b) => b.minutes - a.minutes || b.open - a.open || a.user.name.localeCompare(b.user.name));

    const myProjects = projects.filter((p) => myProjectIds.has(p.summary.project.id));

    return { items, todayEvents, upcomingEvents, kpis, projects, myProjects, funnel, funnelTotal, team, soonDays };
  }, [summaries, db, maps, me.id, settings.due_soon_days, settings.lead_stale_days, canProjects, canCommercial, scope]);
}
