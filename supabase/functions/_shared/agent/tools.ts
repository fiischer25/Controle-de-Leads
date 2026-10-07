// Ferramentas que o assistente pode usar para agir no sistema da AIROS.
// Cada ferramenta valida a entrada, respeita as permissões de quem pediu e
// devolve um resumo curto em JSON para o modelo.

import type Anthropic from 'npm:@anthropic-ai/sdk@0.129.0';
import { eq, gte, lte, type Store } from './store.ts';
import { addDaysKey, formatBr, isDateKey, isoToZoned, isTime, todayIn, zonedToIso } from './time.ts';

// --------------------------------------------------------------------------- tipos mínimos
export interface Profile {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  job_title: string | null;
  phone: string | null;
  active: boolean;
  /** Módulos liberados pelo administrador (null/ausente: padrão dos membros). */
  permissions?: ModuleKey[] | null;
}

// --------------------------------------------------------------------------- acessos por módulo
// Espelha src/lib/permissions.ts: o assistente usa a chave de serviço (ignora o RLS),
// então as ferramentas conferem os módulos de quem está falando.
export type ModuleKey = 'projetos' | 'comercial' | 'relatorios' | 'equipe' | 'configuracoes' | 'financeiro';
const DEFAULT_MODULES: ModuleKey[] = ['projetos', 'comercial', 'relatorios', 'equipe'];

export function hasModule(me: Profile, module: ModuleKey): boolean {
  return me.role === 'admin' || (me.permissions ?? DEFAULT_MODULES).includes(module);
}

/** Sem o módulo Projetos, a pessoa só vê e altera as tarefas dela (designadas ou criadas por ela). */
function canTouchTask(me: Profile, t: Pick<Task, 'assignee_id' | 'created_by'>): boolean {
  return hasModule(me, 'projetos') || t.assignee_id === me.id || t.created_by === me.id;
}

const COMMERCIAL_TOOLS = new Set(['create_lead', 'add_lead_note']);

/** Ferramentas oferecidas ao modelo para esta pessoa. */
export function toolsFor(me: Profile): Anthropic.Beta.BetaTool[] {
  return TOOLS.filter((t) => !COMMERCIAL_TOOLS.has(t.name) || hasModule(me, 'comercial'));
}

interface Project {
  id: string;
  code: string;
  name: string;
  client_id: string;
  status: string;
  manager_id: string | null;
  member_ids: string[];
  due_date: string | null;
}
interface Task {
  id: string;
  project_id: string | null;
  phase: string | null;
  title: string;
  assignee_id: string | null;
  status: 'todo' | 'doing' | 'review' | 'paused' | 'done';
  priority: 'baixa' | 'media' | 'alta' | 'urgente';
  start_date: string | null;
  due_date: string | null;
  position: number;
  created_by: string | null;
  completed_at: string | null;
}
interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  participant_ids: string[];
  project_id: string | null;
  lead_id: string | null;
  google_event_id: string | null;
  created_by: string | null;
}
interface Lead {
  id: string;
  name: string;
  phone: string;
  city: string;
  stage_id: string;
  owner_id: string | null;
  position: number;
  next_contact_date: string | null;
}
interface Stage {
  id: string;
  name: string;
  kind: 'open' | 'won' | 'lost';
  position: number;
}

/** Sincronização opcional com o Google Agenda do escritório. */
export interface CalendarSync {
  upsert(ev: CalendarEvent, participants: Profile[]): Promise<string | null>;
  remove(googleEventId: string): Promise<void>;
}

export interface ToolContext {
  store: Store;
  me: Profile;
  tz: string;
  now: Date;
  /** URL pública do sistema, para links nas respostas. */
  appUrl?: string | null;
  calendar?: CalendarSync | null;
  /** Aviso por WhatsApp (melhor esforço) para quem recebeu uma tarefa/reunião. */
  pingWhatsApp?: (to: Profile, text: string) => Promise<void>;
}

class ToolError extends Error {}

const STATUS_LABEL: Record<Task['status'], string> = {
  todo: 'a fazer',
  doing: 'em andamento',
  review: 'em revisão',
  paused: 'pausada',
  done: 'concluída',
};
const PRIORITIES = ['baixa', 'media', 'alta', 'urgente'] as const;
const STATUSES = ['todo', 'doing', 'review', 'paused', 'done'] as const;

const uuid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

function normalize(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function str(input: Record<string, unknown>, key: string, required = false): string | null {
  const v = input[key];
  if (v == null || v === '') {
    if (required) throw new ToolError(`O campo "${key}" é obrigatório.`);
    return null;
  }
  if (typeof v !== 'string') throw new ToolError(`O campo "${key}" deve ser texto.`);
  return v.trim();
}

function dateField(input: Record<string, unknown>, key: string, required = false): string | null {
  const v = str(input, key, required);
  if (v && !isDateKey(v)) throw new ToolError(`"${key}" deve estar no formato AAAA-MM-DD.`);
  return v;
}

// --------------------------------------------------------------------------- cache por execução
class Lookup {
  private profiles?: Profile[];
  private projects?: Project[];
  private stages?: Stage[];
  constructor(private store: Store) {}

  async team(): Promise<Profile[]> {
    this.profiles ??= await this.store.list<Profile>('profiles');
    return this.profiles;
  }
  async projectList(): Promise<Project[]> {
    this.projects ??= await this.store.list<Project>('projects');
    return this.projects;
  }
  async stageList(): Promise<Stage[]> {
    this.stages ??= (await this.store.list<Stage>('lead_stages')).sort((a, b) => a.position - b.position);
    return this.stages;
  }
  async person(id: string | null): Promise<Profile | null> {
    if (!id) return null;
    const p = (await this.team()).find((x) => x.id === id);
    if (!p) throw new ToolError(`Pessoa não encontrada (id ${id}). Use os ids da lista de equipe.`);
    if (!p.active) throw new ToolError(`${p.name} está desativado(a) no sistema.`);
    return p;
  }
  async project(id: string | null): Promise<Project | null> {
    if (!id) return null;
    const p = (await this.projectList()).find((x) => x.id === id);
    if (!p) throw new ToolError(`Projeto não encontrado (id ${id}).`);
    return p;
  }
  async nameOf(id: string | null): Promise<string | null> {
    if (!id) return null;
    return (await this.team()).find((x) => x.id === id)?.name ?? null;
  }
}

// --------------------------------------------------------------------------- definições
export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'list_tasks',
    description:
      'Lista tarefas do sistema. Use para "minhas tarefas", "o que está atrasado", "tarefas da Ana", "tarefas do projeto X". ' +
      'Retorna id, título, projeto, responsável, prazo e status — use o id para concluir ou alterar depois.',
    input_schema: {
      type: 'object',
      properties: {
        assignee_id: { type: 'string', description: 'Id do responsável. Omitir = quem está falando. Use "all" para toda a equipe.' },
        scope: {
          type: 'string',
          enum: ['open', 'overdue', 'today', 'week', 'done_recent'],
          description: 'open = todas em aberto (padrão); overdue = atrasadas; today = vencem hoje; week = vencem nos próximos 7 dias; done_recent = concluídas nos últimos 7 dias.',
        },
        project_id: { type: 'string', description: 'Filtra por projeto.' },
        query: { type: 'string', description: 'Trecho do título para buscar.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'create_task',
    description:
      'Cria uma tarefa e designa a um membro da equipe (ele recebe notificação). Pode ser avulsa ou dentro de um projeto.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'O que precisa ser feito.' },
        assignee_id: { type: 'string', description: 'Id do responsável. Omitir = quem está pedindo.' },
        project_id: { type: 'string', description: 'Id do projeto, se a tarefa for de um projeto.' },
        phase: { type: 'string', description: 'Etapa do projeto (ex.: Anteprojeto), se fizer sentido.' },
        due_date: { type: 'string', description: 'Prazo AAAA-MM-DD.' },
        start_date: { type: 'string', description: 'Início AAAA-MM-DD (padrão: hoje).' },
        priority: { type: 'string', enum: [...PRIORITIES] },
        description: { type: 'string' },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_task',
    description:
      'Altera uma tarefa existente: concluir (status "done"), reabrir, mudar status, trocar responsável, mudar prazo/prioridade/título ou adicionar um comentário.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        status: { type: 'string', enum: [...STATUSES], description: 'todo, doing, review, paused ou done (concluída).' },
        assignee_id: { type: 'string', description: 'Novo responsável.' },
        due_date: { type: 'string', description: 'Novo prazo AAAA-MM-DD.' },
        start_date: { type: 'string' },
        priority: { type: 'string', enum: [...PRIORITIES] },
        title: { type: 'string' },
        comment: { type: 'string', description: 'Comentário a registrar na tarefa.' },
      },
      required: ['task_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'log_time',
    description: 'Lança horas trabalhadas em uma tarefa para quem está falando.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        minutes: { type: 'integer', description: 'Tempo em minutos (ex.: 90 para 1h30).' },
        date: { type: 'string', description: 'Dia do trabalho AAAA-MM-DD (padrão: hoje).' },
        note: { type: 'string' },
      },
      required: ['task_id', 'minutes'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_agenda',
    description:
      'Mostra a agenda num período: reuniões, prazos de tarefas, entregas de projetos e retornos de clientes.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'AAAA-MM-DD' },
        end_date: { type: 'string', description: 'AAAA-MM-DD (padrão: igual ao início).' },
        person_id: { type: 'string', description: 'Filtra por pessoa. Omitir = quem está falando. "all" = escritório todo.' },
      },
      required: ['start_date'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_meeting',
    description:
      'Agenda uma reunião/compromisso na agenda do escritório (e no Google Agenda, se integrado). Os participantes são notificados.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        date: { type: 'string', description: 'AAAA-MM-DD' },
        start_time: { type: 'string', description: 'HH:MM (24h). Omitir junto com all_day=true para dia inteiro.' },
        end_time: { type: 'string', description: 'HH:MM (padrão: 1 hora após o início).' },
        all_day: { type: 'boolean' },
        participant_ids: { type: 'array', items: { type: 'string' }, description: 'Ids da equipe. Quem pediu entra automaticamente.' },
        location: { type: 'string', description: 'Local ou link da chamada.' },
        project_id: { type: 'string' },
        lead_id: { type: 'string' },
        description: { type: 'string', description: 'Pauta / observações.' },
      },
      required: ['title', 'date'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_meeting',
    description: 'Remarca, altera participantes/local ou cancela (cancel=true) uma reunião existente.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string' },
        cancel: { type: 'boolean' },
        title: { type: 'string' },
        date: { type: 'string' },
        start_time: { type: 'string' },
        end_time: { type: 'string' },
        participant_ids: { type: 'array', items: { type: 'string' } },
        location: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['event_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'search',
    description:
      'Busca por nome em oportunidades (leads), clientes, projetos, tarefas e reuniões. Use para descobrir ids antes de agir.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_lead',
    description: 'Cadastra uma nova oportunidade (lead) no funil comercial, na primeira etapa.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: 'string' },
        city: { type: 'string', description: 'Cidade do projeto.' },
        project_type: { type: 'string', description: 'Ex.: Arquitetura, Interiores.' },
        source: { type: 'string', description: 'Como chegou: tráfego pago, indicação, Instagram…' },
        area_m2: { type: 'number' },
        proposal_value: { type: 'number' },
        owner_id: { type: 'string', description: 'Responsável comercial (padrão: quem pediu).' },
        notes: { type: 'string' },
      },
      required: ['name', 'phone', 'city'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_lead_note',
    description: 'Registra um contato/anotação no histórico de uma oportunidade e, opcionalmente, agenda o próximo retorno.',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string' },
        text: { type: 'string' },
        type: { type: 'string', enum: ['nota', 'ligacao', 'whatsapp', 'email', 'reuniao', 'visita', 'proposta'] },
        next_contact_date: { type: 'string', description: 'AAAA-MM-DD' },
      },
      required: ['lead_id', 'text'],
      additionalProperties: false,
    },
  },
];

// --------------------------------------------------------------------------- execução
export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<{ ok: boolean; result: string }> {
  const input = (rawInput && typeof rawInput === 'object' ? rawInput : {}) as Record<string, unknown>;
  const lookup = new Lookup(ctx.store);
  try {
    const handler = HANDLERS[name];
    if (!handler) throw new ToolError(`Ferramenta desconhecida: ${name}`);
    if (COMMERCIAL_TOOLS.has(name) && !hasModule(ctx.me, 'comercial')) {
      throw new ToolError('Você não tem acesso a Oportunidades e clientes. Peça ao administrador para liberar.');
    }
    const result = await handler(input, ctx, lookup);
    return { ok: true, result: JSON.stringify(result) };
  } catch (e) {
    const message = e instanceof ToolError ? e.message : `Erro ao executar: ${e instanceof Error ? e.message : String(e)}`;
    return { ok: false, result: message };
  }
}

type Handler = (input: Record<string, unknown>, ctx: ToolContext, lookup: Lookup) => Promise<unknown>;

async function log(ctx: ToolContext, entity: string, entityId: string | null, action: string, description: string) {
  try {
    await ctx.store.insert('activity_log', {
      id: uuid(), user_id: ctx.me.id, entity, entity_id: entityId, action, description, created_at: nowIso(),
    });
  } catch {
    /* auditoria nunca bloqueia a ação */
  }
}

async function notify(ctx: ToolContext, target: Profile | null, title: string, body: string, link: string, whatsappText?: string) {
  if (!target || target.id === ctx.me.id) return;
  try {
    await ctx.store.insert('notifications', {
      id: uuid(), user_id: target.id, title, body, link, read: false, created_at: nowIso(),
    });
  } catch {
    /* ignora */
  }
  if (whatsappText && ctx.pingWhatsApp) await ctx.pingWhatsApp(target, whatsappText).catch(() => undefined);
}

function link(ctx: ToolContext, path: string): string | null {
  return ctx.appUrl ? `${ctx.appUrl.replace(/\/$/, '')}${path}` : null;
}

async function taskSummary(t: Task, lookup: Lookup) {
  const project = t.project_id ? (await lookup.projectList()).find((p) => p.id === t.project_id) : null;
  return {
    id: t.id,
    titulo: t.title,
    projeto: project?.name ?? 'avulsa',
    etapa: t.phase,
    responsavel: (await lookup.nameOf(t.assignee_id)) ?? 'sem responsável',
    prazo: t.due_date ? formatBr(t.due_date) : 'sem prazo',
    status: STATUS_LABEL[t.status],
    prioridade: t.priority,
  };
}

const HANDLERS: Record<string, Handler> = {
  async list_tasks(input, ctx, lookup) {
    const assignee = str(input, 'assignee_id');
    const scope = (str(input, 'scope') ?? 'open') as 'open' | 'overdue' | 'today' | 'week' | 'done_recent';
    const projectId = str(input, 'project_id');
    const query = str(input, 'query');
    const filters = [];
    if (assignee !== 'all') filters.push(eq('assignee_id', assignee ?? ctx.me.id));
    if (projectId) filters.push(eq('project_id', projectId));
    const today = todayIn(ctx.tz, ctx.now);
    let tasks = await ctx.store.list<Task>('tasks', filters);
    const projects = await lookup.projectList();
    const dead = new Set(projects.filter((p) => p.status === 'cancelado').map((p) => p.id));
    tasks = tasks.filter((t) => (!t.project_id || !dead.has(t.project_id)) && canTouchTask(ctx.me, t));
    if (query) tasks = tasks.filter((t) => normalize(t.title).includes(normalize(query)));
    if (scope === 'done_recent') {
      const since = addDaysKey(today, -7);
      tasks = tasks.filter((t) => t.status === 'done' && (t.completed_at ?? '').slice(0, 10) >= since);
    } else {
      tasks = tasks.filter((t) => t.status !== 'done');
      if (scope === 'overdue') tasks = tasks.filter((t) => t.due_date && t.due_date < today);
      if (scope === 'today') tasks = tasks.filter((t) => t.due_date === today);
      if (scope === 'week') tasks = tasks.filter((t) => t.due_date && t.due_date >= today && t.due_date <= addDaysKey(today, 7));
    }
    tasks.sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
    const total = tasks.length;
    const shown = await Promise.all(tasks.slice(0, 25).map((t) => taskSummary(t, lookup)));
    return { total, mostrando: shown.length, tarefas: shown };
  },

  async create_task(input, ctx, lookup) {
    const title = str(input, 'title', true)!;
    const assignee = (await lookup.person(str(input, 'assignee_id'))) ?? ctx.me;
    const project = await lookup.project(str(input, 'project_id'));
    const due = dateField(input, 'due_date');
    const start = dateField(input, 'start_date') ?? todayIn(ctx.tz, ctx.now);
    const priority = (str(input, 'priority') ?? 'media') as Task['priority'];
    if (!PRIORITIES.includes(priority)) throw new ToolError('Prioridade inválida.');
    if (due && due < start) throw new ToolError('O prazo não pode ser antes do início.');
    const siblings = await ctx.store.list<Task>('tasks', project ? [eq('project_id', project.id)] : []);
    const now = nowIso();
    const task = await ctx.store.insert<Task>('tasks', {
      id: uuid(),
      project_id: project?.id ?? null,
      phase: str(input, 'phase'),
      title,
      description: str(input, 'description'),
      assignee_id: assignee.id,
      status: 'todo',
      priority,
      start_date: start,
      due_date: due,
      estimated_hours: null,
      position: siblings.length ? Math.max(...siblings.map((t) => t.position)) + 1 : 0,
      checklist: [],
      completed_at: null,
      created_by: ctx.me.id,
      created_at: now,
      updated_at: now,
    });
    await log(ctx, 'task', task.id, 'created', `criou a tarefa "${title}" pelo assistente`);
    await notify(
      ctx,
      assignee,
      'Nova tarefa para você',
      `${ctx.me.name} designou "${title}"${project ? ` (${project.name})` : ''}.`,
      `/tarefas?tarefa=${task.id}`,
      `📌 ${ctx.me.name} te passou uma tarefa: *${title}*${project ? ` (${project.name})` : ''}${due ? ` — prazo ${formatBr(due)}` : ''}.`,
    );
    return { criada: await taskSummary(task, lookup), link: link(ctx, `/tarefas?tarefa=${task.id}`) };
  },

  async update_task(input, ctx, lookup) {
    const id = str(input, 'task_id', true)!;
    const [task] = await ctx.store.list<Task>('tasks', [eq('id', id)]);
    if (!task) throw new ToolError('Tarefa não encontrada. Use list_tasks ou search para achar o id.');
    if (!canTouchTask(ctx.me, task)) throw new ToolError('Você só pode alterar as suas tarefas (sem acesso a Projetos e tarefas da equipe).');
    const patch: Record<string, unknown> = {};
    const status = str(input, 'status') as Task['status'] | null;
    if (status) {
      if (!STATUSES.includes(status)) throw new ToolError('Status inválido.');
      patch.status = status;
      patch.completed_at = status === 'done' ? (task.completed_at ?? nowIso()) : null;
    }
    const newAssignee = await lookup.person(str(input, 'assignee_id'));
    if (newAssignee) patch.assignee_id = newAssignee.id;
    const due = dateField(input, 'due_date');
    if (due) patch.due_date = due;
    const start = dateField(input, 'start_date');
    if (start) patch.start_date = start;
    const priority = str(input, 'priority');
    if (priority) {
      if (!PRIORITIES.includes(priority as Task['priority'])) throw new ToolError('Prioridade inválida.');
      patch.priority = priority;
    }
    const title = str(input, 'title');
    if (title) patch.title = title;
    const comment = str(input, 'comment');
    if (!Object.keys(patch).length && !comment) throw new ToolError('Nada para alterar.');

    let updated = task;
    if (Object.keys(patch).length) {
      patch.updated_at = nowIso();
      updated = await ctx.store.update<Task>('tasks', id, patch);
    }
    if (comment) {
      await ctx.store.insert('task_comments', { id: uuid(), task_id: id, user_id: ctx.me.id, body: comment, created_at: nowIso() });
    }
    if (status === 'done' && task.status !== 'done') {
      await log(ctx, 'task', id, 'done', `concluiu a tarefa "${task.title}" pelo assistente`);
      if (task.created_by && task.created_by !== ctx.me.id && !task.project_id) {
        const creator = (await lookup.team()).find((p) => p.id === task.created_by) ?? null;
        await notify(ctx, creator, 'Tarefa concluída', `${ctx.me.name} concluiu "${task.title}".`, `/tarefas?tarefa=${id}`);
      }
    }
    // O projeto começa automaticamente quando a primeira tarefa avança (status definido à mão fica)
    if (status && status !== 'todo' && task.project_id) {
      const project = (await lookup.projectList()).find((p) => p.id === task.project_id);
      if (project?.status === 'nao_iniciado' && !(project as { status_manual?: boolean }).status_manual) await ctx.store.update('projects', project.id, { status: 'em_andamento', updated_at: nowIso() });
    }
    if (newAssignee && newAssignee.id !== task.assignee_id) {
      await notify(
        ctx,
        newAssignee,
        'Tarefa designada a você',
        `${ctx.me.name} designou "${updated.title}" para você.`,
        `/tarefas?tarefa=${id}`,
        `📌 ${ctx.me.name} te passou a tarefa *${updated.title}*${updated.due_date ? ` — prazo ${formatBr(updated.due_date)}` : ''}.`,
      );
    }
    return { atualizada: await taskSummary(updated, lookup), comentario_registrado: !!comment };
  },

  async log_time(input, ctx, lookup) {
    const id = str(input, 'task_id', true)!;
    const minutes = Number(input.minutes);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 24 * 60) throw new ToolError('Informe os minutos (entre 1 e 1440).');
    const [task] = await ctx.store.list<Task>('tasks', [eq('id', id)]);
    if (!task) throw new ToolError('Tarefa não encontrada.');
    if (!canTouchTask(ctx.me, task)) throw new ToolError('Você só pode lançar horas nas suas tarefas.');
    const date = dateField(input, 'date') ?? todayIn(ctx.tz, ctx.now);
    const started = zonedToIso(date, '09:00', ctx.tz);
    await ctx.store.insert('time_entries', {
      id: uuid(),
      task_id: id,
      user_id: ctx.me.id,
      started_at: started,
      ended_at: new Date(new Date(started).getTime() + minutes * 60000).toISOString(),
      minutes: Math.round(minutes),
      note: str(input, 'note'),
      created_at: nowIso(),
    });
    if (task.status === 'todo') await ctx.store.update('tasks', id, { status: 'doing', updated_at: nowIso() });
    return { lancado: `${Math.floor(minutes / 60)}h${String(Math.round(minutes % 60)).padStart(2, '0')}`, tarefa: (await taskSummary(task, lookup)).titulo, dia: formatBr(date) };
  },

  async list_agenda(input, ctx, lookup) {
    const start = dateField(input, 'start_date', true)!;
    const end = dateField(input, 'end_date') ?? start;
    if (end < start) throw new ToolError('A data final deve ser depois da inicial.');
    const person = str(input, 'person_id');
    const who = person === 'all' ? null : (await lookup.person(person)) ?? ctx.me;
    const from = zonedToIso(start, '00:00', ctx.tz);
    const to = zonedToIso(addDaysKey(end, 1), '00:00', ctx.tz);
    const events = (await ctx.store.list<CalendarEvent>('events', [gte('starts_at', from), lte('starts_at', to)]))
      .filter((e) => !who || e.participant_ids.includes(who.id) || e.created_by === who.id)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const tasks = (await ctx.store.list<Task>('tasks', [gte('due_date', start), lte('due_date', end)]))
      .filter((t) => t.status !== 'done' && (!who || t.assignee_id === who.id));
    const projects = (await lookup.projectList()).filter(
      (p) => p.due_date && p.due_date >= start && p.due_date <= end && !['concluido', 'cancelado'].includes(p.status) &&
        (!who || p.manager_id === who.id || p.member_ids.includes(who.id)),
    );
    const leads = hasModule(ctx.me, 'comercial')
      ? (await ctx.store.list<Lead>('leads', [gte('next_contact_date', start), lte('next_contact_date', end)])).filter((l) => !who || l.owner_id === who.id)
      : [];
    const team = await lookup.team();
    return {
      periodo: `${formatBr(start)} a ${formatBr(end)}`,
      pessoa: who?.name ?? 'escritório todo',
      reunioes: events.map((e) => {
        const s = isoToZoned(e.starts_at, ctx.tz);
        return {
          id: e.id,
          titulo: e.title,
          dia: formatBr(s.date),
          horario: e.all_day ? 'dia inteiro' : `${s.time}${e.ends_at ? `–${isoToZoned(e.ends_at, ctx.tz).time}` : ''}`,
          local: e.location,
          participantes: e.participant_ids.map((id) => team.find((p) => p.id === id)?.name).filter(Boolean),
        };
      }),
      prazos_de_tarefas: await Promise.all(tasks.slice(0, 20).map((t) => taskSummary(t, lookup))),
      entregas_de_projetos: projects.map((p) => ({ projeto: p.name, entrega: formatBr(p.due_date) })),
      retornos_de_clientes: leads.map((l) => ({ id: l.id, lead: l.name, dia: formatBr(l.next_contact_date) })),
    };
  },

  async create_meeting(input, ctx, lookup) {
    const title = str(input, 'title', true)!;
    const date = dateField(input, 'date', true)!;
    const allDay = input.all_day === true || !input.start_time;
    const startTime = str(input, 'start_time');
    const endTime = str(input, 'end_time');
    if (!allDay && !isTime(startTime)) throw new ToolError('start_time deve estar no formato HH:MM.');
    if (endTime && !isTime(endTime)) throw new ToolError('end_time deve estar no formato HH:MM.');
    const ids = Array.isArray(input.participant_ids) ? (input.participant_ids as unknown[]).map(String) : [];
    const participants: Profile[] = [ctx.me];
    for (const id of ids) {
      const p = await lookup.person(id);
      if (p && !participants.some((x) => x.id === p.id)) participants.push(p);
    }
    const startsAt = zonedToIso(date, allDay ? '00:00' : startTime!, ctx.tz);
    let endsAt: string | null = null;
    if (!allDay) {
      endsAt = endTime ? zonedToIso(date, endTime, ctx.tz) : new Date(new Date(startsAt).getTime() + 3_600_000).toISOString();
      if (endsAt <= startsAt) throw new ToolError('O término deve ser depois do início.');
    }
    const project = await lookup.project(str(input, 'project_id'));
    const leadId = str(input, 'lead_id');
    if (leadId && !(await ctx.store.list('leads', [eq('id', leadId)])).length) throw new ToolError('Oportunidade não encontrada.');
    const now = nowIso();
    let ev = await ctx.store.insert<CalendarEvent>('events', {
      id: uuid(),
      title,
      description: str(input, 'description'),
      starts_at: startsAt,
      ends_at: endsAt,
      all_day: allDay,
      location: str(input, 'location'),
      participant_ids: participants.map((p) => p.id),
      project_id: project?.id ?? null,
      lead_id: leadId,
      google_event_id: null,
      created_by: ctx.me.id,
      created_at: now,
      updated_at: now,
    });
    let googleSynced = false;
    if (ctx.calendar) {
      try {
        const gid = await ctx.calendar.upsert(ev, participants);
        if (gid) {
          ev = await ctx.store.update<CalendarEvent>('events', ev.id, { google_event_id: gid });
          googleSynced = true;
        }
      } catch {
        /* segue sem o Google */
      }
    }
    await log(ctx, 'event', ev.id, 'created', `agendou "${title}" pelo assistente`);
    const when = allDay ? `${formatBr(date)} (dia inteiro)` : `${formatBr(date)} às ${startTime}`;
    for (const p of participants) {
      await notify(ctx, p, 'Nova reunião na sua agenda', `${ctx.me.name} agendou "${title}" · ${when}`, `/agenda?evento=${ev.id}`,
        `📅 ${ctx.me.name} agendou *${title}* — ${when}${ev.location ? ` · ${ev.location}` : ''}.`);
    }
    return {
      agendada: { id: ev.id, titulo: title, quando: when, participantes: participants.map((p) => p.name), local: ev.location },
      google_agenda: googleSynced ? 'adicionada à agenda do escritório' : 'não sincronizada automaticamente',
      link_adicionar_google_agenda: googleTemplateLink(ev),
    };
  },

  async update_meeting(input, ctx, lookup) {
    const id = str(input, 'event_id', true)!;
    const [ev] = await ctx.store.list<CalendarEvent>('events', [eq('id', id)]);
    if (!ev) throw new ToolError('Reunião não encontrada. Use list_agenda ou search para achar o id.');
    if (input.cancel === true) {
      if (ctx.me.role !== 'admin' && ev.created_by !== ctx.me.id) {
        throw new ToolError('Só quem criou a reunião ou um administrador pode cancelá-la.');
      }
      await ctx.store.remove('events', id);
      if (ev.google_event_id && ctx.calendar) await ctx.calendar.remove(ev.google_event_id).catch(() => undefined);
      await log(ctx, 'event', id, 'deleted', `cancelou "${ev.title}" pelo assistente`);
      const team = await lookup.team();
      for (const pid of ev.participant_ids) {
        await notify(ctx, team.find((p) => p.id === pid) ?? null, 'Reunião cancelada', `${ctx.me.name} cancelou "${ev.title}".`, '/agenda',
          `❌ ${ctx.me.name} cancelou *${ev.title}*.`);
      }
      return { cancelada: ev.title };
    }
    const cur = isoToZoned(ev.starts_at, ctx.tz);
    const date = dateField(input, 'date') ?? cur.date;
    const patch: Record<string, unknown> = { updated_at: nowIso() };
    const title = str(input, 'title');
    if (title) patch.title = title;
    const location = str(input, 'location');
    if (location) patch.location = location;
    const description = str(input, 'description');
    if (description) patch.description = description;
    const startTime = str(input, 'start_time');
    const endTime = str(input, 'end_time');
    if (startTime && !isTime(startTime)) throw new ToolError('start_time deve estar no formato HH:MM.');
    if (endTime && !isTime(endTime)) throw new ToolError('end_time deve estar no formato HH:MM.');
    if (input.date || startTime || endTime) {
      const duration = ev.ends_at ? new Date(ev.ends_at).getTime() - new Date(ev.starts_at).getTime() : 3_600_000;
      const st = startTime ?? (ev.all_day ? null : cur.time);
      if (st) {
        const startsAt = zonedToIso(date, st, ctx.tz);
        patch.starts_at = startsAt;
        patch.all_day = false;
        patch.ends_at = endTime ? zonedToIso(date, endTime, ctx.tz) : new Date(new Date(startsAt).getTime() + duration).toISOString();
        if ((patch.ends_at as string) <= startsAt) throw new ToolError('O término deve ser depois do início.');
      } else {
        patch.starts_at = zonedToIso(date, '00:00', ctx.tz);
      }
    }
    let added: Profile[] = [];
    if (Array.isArray(input.participant_ids)) {
      const people: Profile[] = [];
      for (const pid of (input.participant_ids as unknown[]).map(String)) {
        const p = await lookup.person(pid);
        if (p && !people.some((x) => x.id === p.id)) people.push(p);
      }
      patch.participant_ids = people.map((p) => p.id);
      added = people.filter((p) => !ev.participant_ids.includes(p.id));
    }
    let updated = await ctx.store.update<CalendarEvent>('events', id, patch);
    if (ctx.calendar) {
      try {
        const team = await lookup.team();
        const gid = await ctx.calendar.upsert(updated, team.filter((p) => updated.participant_ids.includes(p.id)));
        if (gid && gid !== updated.google_event_id) updated = await ctx.store.update<CalendarEvent>('events', id, { google_event_id: gid });
      } catch {
        /* segue sem o Google */
      }
    }
    const s = isoToZoned(updated.starts_at, ctx.tz);
    const when = updated.all_day ? `${formatBr(s.date)} (dia inteiro)` : `${formatBr(s.date)} às ${s.time}`;
    for (const p of added) {
      await notify(ctx, p, 'Nova reunião na sua agenda', `${ctx.me.name} incluiu você em "${updated.title}" · ${when}`, `/agenda?evento=${id}`,
        `📅 ${ctx.me.name} te incluiu em *${updated.title}* — ${when}.`);
    }
    return { atualizada: { id, titulo: updated.title, quando: when, local: updated.location } };
  },

  async search(input, ctx, lookup) {
    const q = normalize(str(input, 'query', true));
    const hit = (...fields: Array<string | null | undefined>) => fields.some((f) => normalize(f).includes(q));
    const commercial = hasModule(ctx.me, 'comercial');
    const seesClients = commercial || hasModule(ctx.me, 'projetos');
    const [leads, clients, tasks, events] = await Promise.all([
      commercial ? ctx.store.list<Lead & { email: string | null }>('leads') : [],
      seesClients ? ctx.store.list<{ id: string; name: string; city: string; phone: string }>('clients') : [],
      ctx.store.list<Task>('tasks'),
      ctx.store.list<CalendarEvent>('events', [gte('starts_at', zonedToIso(addDaysKey(todayIn(ctx.tz, ctx.now), -30), '00:00', ctx.tz))]),
    ]);
    const stages = await lookup.stageList();
    const projects = await lookup.projectList();
    return {
      oportunidades: leads.filter((l) => hit(l.name, l.phone, l.city)).slice(0, 5)
        .map((l) => ({ id: l.id, nome: l.name, cidade: l.city, etapa: stages.find((s) => s.id === l.stage_id)?.name })),
      clientes: clients.filter((c) => hit(c.name, c.phone, c.city)).slice(0, 5).map((c) => ({ id: c.id, nome: c.name, cidade: c.city })),
      projetos: projects.filter((p) => hit(p.name, p.code)).slice(0, 5).map((p) => ({ id: p.id, nome: p.name, codigo: p.code, status: p.status })),
      tarefas: await Promise.all(tasks.filter((t) => hit(t.title) && canTouchTask(ctx.me, t)).slice(0, 8).map((t) => taskSummary(t, lookup))),
      reunioes: events.filter((e) => hit(e.title)).slice(0, 5).map((e) => {
        const s = isoToZoned(e.starts_at, ctx.tz);
        return { id: e.id, titulo: e.title, dia: formatBr(s.date), horario: e.all_day ? 'dia inteiro' : s.time };
      }),
    };
  },

  async create_lead(input, ctx, lookup) {
    const name = str(input, 'name', true)!;
    const phone = str(input, 'phone', true)!;
    const city = str(input, 'city', true)!;
    const stage = (await lookup.stageList()).find((s) => s.kind === 'open');
    if (!stage) throw new ToolError('O funil não tem etapas configuradas.');
    const owner = (await lookup.person(str(input, 'owner_id'))) ?? ctx.me;
    const typeName = str(input, 'project_type');
    const sourceName = str(input, 'source');
    const types = typeName ? await ctx.store.list<{ id: string; name: string }>('project_types') : [];
    const sources = sourceName ? await ctx.store.list<{ id: string; name: string }>('lead_sources') : [];
    const type = typeName ? types.find((t) => normalize(t.name) === normalize(typeName)) ?? types.find((t) => normalize(t.name).includes(normalize(typeName))) : null;
    const source = sourceName ? sources.find((s) => normalize(s.name).includes(normalize(sourceName))) : null;
    const inStage = await ctx.store.list<Lead>('leads', [eq('stage_id', stage.id)]);
    const now = nowIso();
    const area = input.area_m2 == null ? null : Number(input.area_m2);
    const value = input.proposal_value == null ? null : Number(input.proposal_value);
    const lead = await ctx.store.insert<Lead>('leads', {
      id: uuid(), name, phone, email: null, city, state: null,
      area_m2: Number.isFinite(area) ? area : null, category: 'Residencial',
      project_type_id: type?.id ?? null, source_id: source?.id ?? null,
      referred_by: source ? null : sourceName, proposal_value: Number.isFinite(value) ? value : null,
      stage_id: stage.id, owner_id: owner.id,
      position: inStage.length ? Math.min(...inStage.map((l) => l.position)) - 1 : 0,
      next_contact_date: null, expected_close_date: null, lost_reason: null, notes: str(input, 'notes'),
      stage_changed_at: now, closed_at: null, client_id: null, converted_at: null,
      created_by: ctx.me.id, created_at: now, updated_at: now,
    });
    await log(ctx, 'lead', lead.id, 'created', `cadastrou a oportunidade ${name} pelo assistente`);
    await notify(ctx, owner, 'Nova oportunidade para você', `${ctx.me.name} atribuiu o lead ${name} a você.`, `/oportunidades?lead=${lead.id}`);
    return { criada: { id: lead.id, nome: name, etapa: stage.name, responsavel: owner.name, tipo: type?.name ?? null, origem: source?.name ?? sourceName }, link: link(ctx, `/oportunidades?lead=${lead.id}`) };
  },

  async add_lead_note(input, ctx) {
    const id = str(input, 'lead_id', true)!;
    const [lead] = await ctx.store.list<Lead>('leads', [eq('id', id)]);
    if (!lead) throw new ToolError('Oportunidade não encontrada.');
    const text = str(input, 'text', true)!;
    const type = str(input, 'type') ?? 'nota';
    const next = dateField(input, 'next_contact_date');
    await ctx.store.insert('lead_interactions', {
      id: uuid(), lead_id: id, user_id: ctx.me.id, type, description: text, happened_at: nowIso(), created_at: nowIso(),
    });
    await ctx.store.update('leads', id, { updated_at: nowIso(), ...(next ? { next_contact_date: next } : {}) });
    return { registrado_em: lead.name, proximo_contato: next ? formatBr(next) : null };
  },
};

/** Link "adicionar ao Google Agenda" (funciona sem integração). */
export function googleTemplateLink(ev: Pick<CalendarEvent, 'title' | 'starts_at' | 'ends_at' | 'all_day' | 'location' | 'description'>): string {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  let dates: string;
  if (ev.all_day) {
    const day = ev.starts_at.slice(0, 10);
    dates = `${day.replace(/-/g, '')}/${addDaysKey(day, 1).replace(/-/g, '')}`;
  } else {
    const end = ev.ends_at ?? new Date(new Date(ev.starts_at).getTime() + 3_600_000).toISOString();
    dates = `${stamp(ev.starts_at)}/${stamp(end)}`;
  }
  const params = new URLSearchParams({ action: 'TEMPLATE', text: ev.title, dates });
  if (ev.location) params.set('location', ev.location);
  if (ev.description) params.set('details', ev.description);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
