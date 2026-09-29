import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { backend, type NewUserInput } from '../lib/backend';
import { defaultProjectTypes, defaultSettings, defaultSources, defaultStages } from '../lib/defaults';
import { buildProjectTasks, nextProjectCode } from '../lib/domain';
import {
  TABLES,
  type ActivityLog,
  type AppSettings,
  type Client,
  type InteractionType,
  type Lead,
  type Profile,
  type Project,
  type TableName,
  type Tables,
  type Task,
  type TimeEntry,
} from '../lib/types';
import { byPosition, nowIso, uid } from '../lib/utils';
import { useToast } from './ToastContext';

export type Db = { [K in TableName]: Tables[K][] };

/** Tabelas com coluna updated_at. */
const STAMPED = new Set<TableName>(['leads', 'clients', 'projects', 'tasks', 'app_settings']);

const emptyDb = (): Db => Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Db;

type Indexed<T> = Record<string, T>;
function index<T extends { id: string }>(rows: T[]): Indexed<T> {
  const out: Indexed<T> = {};
  for (const r of rows) out[r.id] = r;
  return out;
}

export type ClientInput = Omit<Client, 'id' | 'lead_id' | 'created_by' | 'created_at' | 'updated_at'>;

export interface ProjectInput {
  name: string;
  client_id: string;
  project_type_id: string;
  manager_id: string | null;
  member_ids: string[];
  start_date: string;
  due_date: string | null;
  area_m2: number | null;
  site_address: string | null;
  site_city: string | null;
  description: string | null;
  /** Responsável padrão das tarefas geradas a partir do modelo. */
  default_assignee_id: string | null;
  lead_id?: string | null;
}

export type TaskInput = Pick<Task, 'title'> & Partial<Omit<Task, 'id' | 'created_at' | 'updated_at' | 'created_by'>>;

export type LeadInput = Omit<
  Lead,
  | 'id' | 'position' | 'stage_changed_at' | 'closed_at' | 'client_id' | 'converted_at'
  | 'created_by' | 'created_at' | 'updated_at'
>;

interface DataApi {
  db: Db;
  loading: boolean;
  me: Profile;
  isAdmin: boolean;
  settings: AppSettings;
  maps: {
    profiles: Indexed<Profile>;
    stages: Indexed<Tables['lead_stages']>;
    sources: Indexed<Tables['lead_sources']>;
    types: Indexed<Tables['project_types']>;
    clients: Indexed<Client>;
    projects: Indexed<Project>;
    leads: Indexed<Lead>;
    tasks: Indexed<Task>;
  };
  refresh(): Promise<void>;

  // Genéricos (usados principalmente em Configurações)
  insertRows<T extends TableName>(table: T, rows: Tables[T][]): Promise<Tables[T][]>;
  patch<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<void>;
  removeRows(table: TableName, ids: string[]): Promise<void>;
  log(entity: ActivityLog['entity'], entityId: string | null, action: string, description: string): Promise<void>;
  notify(userId: string | null, title: string, body: string | null, link: string | null): Promise<void>;

  // Leads
  createLead(input: LeadInput): Promise<Lead>;
  updateLead(id: string, patch: Partial<Lead>): Promise<void>;
  moveLead(id: string, stageId: string, beforeLeadId?: string | null, extra?: Partial<Lead>): Promise<void>;
  deleteLead(id: string): Promise<void>;
  addInteraction(leadId: string, type: InteractionType, description: string, happenedAt: string): Promise<void>;
  convertLead(leadId: string, client: ClientInput, project: Omit<ProjectInput, 'client_id' | 'lead_id'>): Promise<Project>;

  // Clientes e projetos
  createClient(input: ClientInput): Promise<Client>;
  updateClient(id: string, patch: Partial<Client>): Promise<void>;
  deleteClient(id: string): Promise<void>;
  createProject(input: ProjectInput): Promise<Project>;
  updateProject(id: string, patch: Partial<Project>): Promise<void>;
  deleteProject(id: string): Promise<void>;
  applyTemplates(projectId: string, startDate: string, assigneeId: string | null): Promise<void>;

  // Tarefas
  createTask(input: TaskInput): Promise<Task>;
  updateTask(id: string, patch: Partial<Task>): Promise<void>;
  deleteTask(id: string): Promise<void>;
  addComment(taskId: string, body: string): Promise<void>;
  startTimer(taskId: string): Promise<void>;
  stopTimer(): Promise<void>;
  addTimeEntry(taskId: string, date: string, minutes: number, note: string | null): Promise<void>;
  deleteTimeEntry(id: string): Promise<void>;
  runningEntry: TimeEntry | null;

  // Notificações
  markNotificationsRead(ids: string[]): Promise<void>;

  // Equipe
  createUser(input: NewUserInput): Promise<void>;
  updateUser(id: string, patch: Partial<Profile>, auth?: { email?: string; password?: string }): Promise<void>;
}

const DataContext = createContext<DataApi | null>(null);

export function DataProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const toast = useToast();
  const [db, setDb] = useState<Db>(emptyDb);
  const [loading, setLoading] = useState(true);
  const dbRef = useRef(db);
  dbRef.current = db;

  const loadTable = useCallback(async <T extends TableName>(table: T) => {
    const rows = await backend.list(table);
    setDb((prev) => ({ ...prev, [table]: rows }));
  }, []);

  const refresh = useCallback(async () => {
    const entries = await Promise.all(TABLES.map(async (t) => [t, await backend.list(t)] as const));
    setDb(Object.fromEntries(entries) as unknown as Db);
  }, []);

  // Carga inicial + configuração padrão no primeiro acesso do administrador
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
        const current = dbRef.current;
        const me = current.profiles.find((p) => p.id === userId);
        if (me?.role === 'admin') {
          const seeds: Array<Promise<unknown>> = [];
          if (current.lead_stages.length === 0) seeds.push(backend.insert('lead_stages', defaultStages()));
          if (current.lead_sources.length === 0) seeds.push(backend.insert('lead_sources', defaultSources()));
          if (current.project_types.length === 0) {
            const { types, templates } = defaultProjectTypes();
            seeds.push(backend.insert('project_types', types).then(() => backend.insert('task_templates', templates)));
          }
          if (current.app_settings.length === 0) seeds.push(backend.insert('app_settings', [defaultSettings()]));
          if (seeds.length) {
            await Promise.all(seeds);
            await refresh();
          }
        }
      } catch (e) {
        toast.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, userId, toast]);

  // Sincronização em tempo real (outros usuários / outras abas)
  useEffect(() => {
    const pending = new Set<TableName>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = backend.subscribe((table) => {
      if (!TABLES.includes(table)) return;
      pending.add(table);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const tables = [...pending];
        pending.clear();
        tables.forEach((t) => loadTable(t).catch(() => undefined));
      }, 250);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [loadTable]);

  const me = useMemo<Profile>(
    () =>
      db.profiles.find((p) => p.id === userId) ?? {
        id: userId, name: 'Usuário', email: '', role: 'member', job_title: null, phone: null,
        color: '#57534e', active: true, calendar_embed_url: null, created_at: nowIso(),
      },
    [db.profiles, userId],
  );
  const isAdmin = me.role === 'admin';
  const settings = db.app_settings[0] ?? defaultSettings();

  const maps = useMemo(
    () => ({
      profiles: index(db.profiles),
      stages: index(db.lead_stages),
      sources: index(db.lead_sources),
      types: index(db.project_types),
      clients: index(db.clients),
      projects: index(db.projects),
      leads: index(db.leads),
      tasks: index(db.tasks),
    }),
    [db.profiles, db.lead_stages, db.lead_sources, db.project_types, db.clients, db.projects, db.leads, db.tasks],
  );

  const runningEntry = useMemo(
    () => db.time_entries.find((e) => e.user_id === userId && !e.ended_at) ?? null,
    [db.time_entries, userId],
  );

  // ------------------------------------------------------------------ genéricos
  const insertRows = useCallback(async <T extends TableName>(table: T, rows: Tables[T][]) => {
    if (rows.length === 0) return rows;
    const saved = await backend.insert(table, rows);
    setDb((prev) => {
      const ids = new Set(saved.map((r) => (r as { id: string }).id));
      return { ...prev, [table]: [...prev[table].filter((r) => !ids.has((r as { id: string }).id)), ...saved] };
    });
    return saved;
  }, []);

  /** Atualização otimista: aplica localmente e desfaz se o servidor recusar. */
  const patch = useCallback(async <T extends TableName>(table: T, id: string, changes: Partial<Tables[T]>) => {
    const withStamp = STAMPED.has(table) ? { ...changes, updated_at: nowIso() } : changes;
    const before = dbRef.current[table];
    setDb((prev) => ({
      ...prev,
      [table]: prev[table].map((r) => ((r as { id: string }).id === id ? { ...r, ...withStamp } : r)),
    }));
    try {
      const saved = await backend.update(table, id, withStamp as Partial<Tables[T]>);
      setDb((prev) => ({
        ...prev,
        [table]: prev[table].map((r) => ((r as { id: string }).id === id ? saved : r)),
      }));
    } catch (e) {
      setDb((prev) => ({ ...prev, [table]: before }));
      throw e;
    }
  }, []);

  const removeRows = useCallback(async (table: TableName, ids: string[]) => {
    if (ids.length === 0) return;
    await backend.remove(table, ids);
    const set = new Set(ids);
    setDb((prev) => ({ ...prev, [table]: prev[table].filter((r) => !set.has((r as { id: string }).id)) }));
  }, []);

  const log = useCallback(
    async (entity: ActivityLog['entity'], entityId: string | null, action: string, description: string) => {
      try {
        await insertRows('activity_log', [
          { id: uid(), user_id: userId, entity, entity_id: entityId, action, description, created_at: nowIso() },
        ]);
      } catch {
        /* o log nunca deve bloquear a ação principal */
      }
    },
    [insertRows, userId],
  );

  const notify = useCallback(
    async (target: string | null, title: string, body: string | null, link: string | null) => {
      if (!target || target === userId) return;
      try {
        // Notificações de outros usuários não são visíveis para quem cria (RLS),
        // então gravamos direto no backend sem colocar no estado local.
        await backend.insert('notifications', [
          { id: uid(), user_id: target, title, body, link, read: false, created_at: nowIso() },
        ]);
      } catch {
        /* não bloqueia */
      }
    },
    [userId],
  );

  // ------------------------------------------------------------------ leads
  const createLead = useCallback(
    async (input: LeadInput) => {
      const now = nowIso();
      const inStage = dbRef.current.leads.filter((l) => l.stage_id === input.stage_id);
      const lead: Lead = {
        ...input,
        id: uid(),
        position: inStage.length ? Math.min(...inStage.map((l) => l.position)) - 1 : 0,
        stage_changed_at: now,
        closed_at: null,
        client_id: null,
        converted_at: null,
        created_by: userId,
        created_at: now,
        updated_at: now,
      };
      const [saved] = await insertRows('leads', [lead]);
      await log('lead', saved.id, 'created', `cadastrou a oportunidade ${saved.name}`);
      if (saved.owner_id) {
        await notify(saved.owner_id, 'Nova oportunidade para você', `${me.name} atribuiu o lead ${saved.name} a você.`, `/oportunidades?lead=${saved.id}`);
      }
      return saved;
    },
    [insertRows, log, notify, userId, me.name],
  );

  const updateLead = useCallback(
    async (id: string, changes: Partial<Lead>) => {
      const before = dbRef.current.leads.find((l) => l.id === id);
      await patch('leads', id, changes);
      if (before && changes.owner_id && changes.owner_id !== before.owner_id) {
        await notify(changes.owner_id, 'Oportunidade atribuída a você', `${me.name} passou o lead ${before.name} para você.`, `/oportunidades?lead=${id}`);
      }
    },
    [patch, notify, me.name],
  );

  const moveLead = useCallback(
    async (id: string, stageId: string, beforeLeadId?: string | null, extra: Partial<Lead> = {}) => {
      const lead = dbRef.current.leads.find((l) => l.id === id);
      if (!lead) return;
      const column = dbRef.current.leads
        .filter((l) => l.stage_id === stageId && l.id !== id)
        .sort(byPosition);
      let position: number;
      const idx = beforeLeadId ? column.findIndex((l) => l.id === beforeLeadId) : -1;
      if (idx === -1) position = column.length ? column[column.length - 1].position + 1 : 0;
      else if (idx === 0) position = column[0].position - 1;
      else position = (column[idx - 1].position + column[idx].position) / 2;

      const stage = dbRef.current.lead_stages.find((s) => s.id === stageId);
      const changes: Partial<Lead> = { stage_id: stageId, position, ...extra };
      if (lead.stage_id !== stageId) {
        changes.stage_changed_at = nowIso();
        changes.closed_at = stage && stage.kind !== 'open' ? nowIso() : null;
        if (stage?.kind !== 'lost') changes.lost_reason = extra.lost_reason ?? null;
      }
      await patch('leads', id, changes);
      if (lead.stage_id !== stageId && stage) {
        await log('lead', id, 'stage', `moveu ${lead.name} para "${stage.name}"`);
      }
    },
    [patch, log],
  );

  const deleteLead = useCallback(
    async (id: string) => {
      const lead = dbRef.current.leads.find((l) => l.id === id);
      await removeRows('lead_interactions', dbRef.current.lead_interactions.filter((i) => i.lead_id === id).map((i) => i.id));
      await removeRows('leads', [id]);
      if (lead) await log('lead', id, 'deleted', `excluiu a oportunidade ${lead.name}`);
    },
    [removeRows, log],
  );

  const addInteraction = useCallback(
    async (leadId: string, type: InteractionType, description: string, happenedAt: string) => {
      await insertRows('lead_interactions', [
        { id: uid(), lead_id: leadId, user_id: userId, type, description, happened_at: happenedAt, created_at: nowIso() },
      ]);
      await patch('leads', leadId, {});
    },
    [insertRows, patch, userId],
  );

  // ------------------------------------------------------------------ clientes
  const createClient = useCallback(
    async (input: ClientInput, leadId: string | null = null) => {
      const now = nowIso();
      const [saved] = await insertRows('clients', [
        { ...input, id: uid(), lead_id: leadId, created_by: userId, created_at: now, updated_at: now },
      ]);
      await log('client', saved.id, 'created', `cadastrou o cliente ${saved.name}`);
      return saved;
    },
    [insertRows, log, userId],
  );

  const updateClient = useCallback((id: string, changes: Partial<Client>) => patch('clients', id, changes), [patch]);

  const deleteClient = useCallback(
    async (id: string) => {
      if (dbRef.current.projects.some((p) => p.client_id === id)) {
        throw new Error('Este cliente possui projetos. Exclua ou transfira os projetos antes.');
      }
      const linked = dbRef.current.leads.filter((l) => l.client_id === id);
      for (const l of linked) await patch('leads', l.id, { client_id: null, converted_at: null });
      await removeRows('clients', [id]);
    },
    [patch, removeRows],
  );

  // ------------------------------------------------------------------ projetos
  const applyTemplates = useCallback(
    async (projectId: string, startDate: string, assigneeId: string | null) => {
      const project = dbRef.current.projects.find((p) => p.id === projectId);
      if (!project) return;
      const templates = dbRef.current.task_templates.filter((t) => t.project_type_id === project.project_type_id);
      const existing = dbRef.current.tasks.filter((t) => t.project_id === projectId);
      const offset = existing.length ? Math.max(...existing.map((t) => t.position)) + 1 : 0;
      const tasks = buildProjectTasks({ templates, projectId, startDate, assigneeId, createdBy: userId }).map((t) => ({
        ...t,
        position: t.position + offset,
      }));
      await insertRows('tasks', tasks);
      if (assigneeId && tasks.length) {
        await notify(assigneeId, 'Novas tarefas atribuídas', `${tasks.length} tarefas do projeto ${project.name} estão com você.`, `/projetos/${projectId}`);
      }
    },
    [insertRows, notify, userId],
  );

  const createProject = useCallback(
    async (input: ProjectInput) => {
      const now = nowIso();
      const { default_assignee_id, lead_id, ...rest } = input;
      const project: Project = {
        ...rest,
        id: uid(),
        code: nextProjectCode(dbRef.current.projects, settings.project_code_prefix),
        status: 'nao_iniciado',
        notes: null,
        links: [],
        lead_id: lead_id ?? null,
        completed_at: null,
        created_by: userId,
        created_at: now,
        updated_at: now,
      };
      const [saved] = await insertRows('projects', [project]);
      const templates = dbRef.current.task_templates.filter((t) => t.project_type_id === saved.project_type_id);
      const tasks = buildProjectTasks({ templates, projectId: saved.id, startDate: saved.start_date, assigneeId: default_assignee_id, createdBy: userId });
      await insertRows('tasks', tasks);
      await log('project', saved.id, 'created', `criou o projeto ${saved.name}`);
      const people = new Set([saved.manager_id, ...saved.member_ids, default_assignee_id].filter(Boolean) as string[]);
      for (const person of people) {
        await notify(person, 'Você está em um novo projeto', `${me.name} incluiu você no projeto ${saved.name}.`, `/projetos/${saved.id}`);
      }
      return saved;
    },
    [insertRows, log, notify, userId, me.name, settings.project_code_prefix],
  );

  const updateProject = useCallback(
    async (id: string, changes: Partial<Project>) => {
      const before = dbRef.current.projects.find((p) => p.id === id);
      const next = { ...changes };
      if (changes.status === 'concluido' && before?.status !== 'concluido') next.completed_at = nowIso();
      if (changes.status && changes.status !== 'concluido') next.completed_at = null;
      await patch('projects', id, next);
      if (before && changes.status && changes.status !== before.status) {
        await log('project', id, 'status', `alterou o status de ${before.name}`);
      }
      if (before && changes.member_ids) {
        const added = changes.member_ids.filter((m) => !before.member_ids.includes(m));
        for (const m of added) {
          await notify(m, 'Você está em um novo projeto', `${me.name} incluiu você no projeto ${before.name}.`, `/projetos/${id}`);
        }
      }
    },
    [patch, log, notify, me.name],
  );

  const deleteProject = useCallback(
    async (id: string) => {
      const project = dbRef.current.projects.find((p) => p.id === id);
      const taskIds = dbRef.current.tasks.filter((t) => t.project_id === id).map((t) => t.id);
      const taskSet = new Set(taskIds);
      await removeRows('time_entries', dbRef.current.time_entries.filter((e) => taskSet.has(e.task_id)).map((e) => e.id));
      await removeRows('task_comments', dbRef.current.task_comments.filter((c) => taskSet.has(c.task_id)).map((c) => c.id));
      await removeRows('tasks', taskIds);
      await removeRows('projects', [id]);
      if (project) await log('project', id, 'deleted', `excluiu o projeto ${project.name}`);
    },
    [removeRows, log],
  );

  const convertLead = useCallback(
    async (leadId: string, clientInput: ClientInput, projectInput: Omit<ProjectInput, 'client_id' | 'lead_id'>) => {
      const lead = dbRef.current.leads.find((l) => l.id === leadId);
      if (!lead) throw new Error('Oportunidade não encontrada.');
      const stage = dbRef.current.lead_stages.find((s) => s.id === lead.stage_id);
      if (stage?.kind !== 'won') throw new Error('Marque a oportunidade como fechada antes de convertê-la em cliente.');
      const client = await createClient(clientInput, leadId);
      const project = await createProject({ ...projectInput, client_id: client.id, lead_id: leadId });
      await patch('leads', leadId, { client_id: client.id, converted_at: nowIso() });
      await log('lead', leadId, 'converted', `converteu ${lead.name} em cliente`);
      return project;
    },
    [createClient, createProject, patch, log],
  );

  // ------------------------------------------------------------------ tarefas
  const createTask = useCallback(
    async (input: TaskInput) => {
      const now = nowIso();
      const siblings = dbRef.current.tasks.filter((t) => t.project_id === (input.project_id ?? null));
      const task: Task = {
        project_id: null,
        phase: null,
        description: null,
        assignee_id: null,
        status: 'todo',
        priority: 'media',
        start_date: null,
        due_date: null,
        estimated_hours: null,
        position: siblings.length ? Math.max(...siblings.map((t) => t.position)) + 1 : 0,
        checklist: [],
        completed_at: null,
        ...input,
        id: uid(),
        created_by: userId,
        created_at: now,
        updated_at: now,
      };
      const [saved] = await insertRows('tasks', [task]);
      const project = saved.project_id ? dbRef.current.projects.find((p) => p.id === saved.project_id) : null;
      await log('task', saved.id, 'created', `criou a tarefa "${saved.title}"${project ? ` em ${project.name}` : ''}`);
      await notify(
        saved.assignee_id,
        'Nova tarefa para você',
        `${me.name} designou "${saved.title}"${project ? ` (${project.name})` : ''}.`,
        `/tarefas?tarefa=${saved.id}`,
      );
      return saved;
    },
    [insertRows, log, notify, userId, me.name],
  );

  const updateTask = useCallback(
    async (id: string, changes: Partial<Task>) => {
      const before = dbRef.current.tasks.find((t) => t.id === id);
      const next = { ...changes };
      if (changes.status === 'done' && before?.status !== 'done') next.completed_at = nowIso();
      if (changes.status && changes.status !== 'done') next.completed_at = null;
      await patch('tasks', id, next);
      if (!before) return;
      if (changes.assignee_id && changes.assignee_id !== before.assignee_id) {
        await notify(changes.assignee_id, 'Tarefa designada a você', `${me.name} designou "${before.title}" para você.`, `/tarefas?tarefa=${id}`);
      }
      if (changes.status === 'done' && before.status !== 'done') {
        await log('task', id, 'done', `concluiu a tarefa "${before.title}"`);
        if (before.created_by && before.created_by !== userId && !before.project_id) {
          await notify(before.created_by, 'Tarefa concluída', `${me.name} concluiu "${before.title}".`, `/tarefas?tarefa=${id}`);
        }
      }
      // Projeto começa automaticamente quando a primeira tarefa avança
      if (changes.status && changes.status !== 'todo' && before.project_id) {
        const project = dbRef.current.projects.find((p) => p.id === before.project_id);
        if (project?.status === 'nao_iniciado') await patch('projects', project.id, { status: 'em_andamento' });
      }
    },
    [patch, notify, log, me.name, userId],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      await removeRows('time_entries', dbRef.current.time_entries.filter((e) => e.task_id === id).map((e) => e.id));
      await removeRows('task_comments', dbRef.current.task_comments.filter((c) => c.task_id === id).map((c) => c.id));
      await removeRows('tasks', [id]);
    },
    [removeRows],
  );

  const addComment = useCallback(
    async (taskId: string, body: string) => {
      await insertRows('task_comments', [{ id: uid(), task_id: taskId, user_id: userId, body, created_at: nowIso() }]);
      const task = dbRef.current.tasks.find((t) => t.id === taskId);
      if (task) {
        const targets = new Set([task.assignee_id, task.created_by].filter((x): x is string => !!x && x !== userId));
        for (const t of targets) {
          await notify(t, 'Novo comentário', `${me.name} comentou em "${task.title}": ${body.slice(0, 80)}`, `/tarefas?tarefa=${taskId}`);
        }
      }
    },
    [insertRows, notify, userId, me.name],
  );

  const stopTimer = useCallback(async () => {
    const running = dbRef.current.time_entries.find((e) => e.user_id === userId && !e.ended_at);
    if (!running) return;
    const ended = new Date();
    const minutes = Math.max(1, Math.round((ended.getTime() - new Date(running.started_at).getTime()) / 60000));
    await patch('time_entries', running.id, { ended_at: ended.toISOString(), minutes });
  }, [patch, userId]);

  const startTimer = useCallback(
    async (taskId: string) => {
      await stopTimer();
      await insertRows('time_entries', [
        { id: uid(), task_id: taskId, user_id: userId, started_at: nowIso(), ended_at: null, minutes: 0, note: null, created_at: nowIso() },
      ]);
      const task = dbRef.current.tasks.find((t) => t.id === taskId);
      if (task && task.status === 'todo') await updateTask(taskId, { status: 'doing' });
    },
    [stopTimer, insertRows, updateTask, userId],
  );

  const addTimeEntry = useCallback(
    async (taskId: string, date: string, minutes: number, note: string | null) => {
      const started = new Date(`${date}T09:00:00`);
      const ended = new Date(started.getTime() + minutes * 60000);
      await insertRows('time_entries', [
        { id: uid(), task_id: taskId, user_id: userId, started_at: started.toISOString(), ended_at: ended.toISOString(), minutes, note, created_at: nowIso() },
      ]);
    },
    [insertRows, userId],
  );

  const deleteTimeEntry = useCallback((id: string) => removeRows('time_entries', [id]), [removeRows]);

  const markNotificationsRead = useCallback(
    async (ids: string[]) => {
      for (const id of ids) await patch('notifications', id, { read: true });
    },
    [patch],
  );

  // ------------------------------------------------------------------ equipe
  const createUser = useCallback(
    async (input: NewUserInput) => {
      await backend.createUser(input);
      await loadTable('profiles');
      await log('user', null, 'created', `cadastrou o membro ${input.name}`);
    },
    [loadTable, log],
  );

  const updateUser = useCallback(
    async (id: string, changes: Partial<Profile>, auth?: { email?: string; password?: string }) => {
      const before = dbRef.current.profiles.find((p) => p.id === id);
      const needsAuth = auth?.password || (auth?.email && auth.email !== before?.email) || (changes.active !== undefined && changes.active !== before?.active);
      if (needsAuth) {
        await backend.updateUserAuth({
          userId: id,
          email: auth?.email && auth.email !== before?.email ? auth.email : undefined,
          password: auth?.password || undefined,
          active: changes.active,
        });
      }
      const rest = { ...changes };
      delete rest.email;
      delete rest.active;
      if (Object.keys(rest).length) await patch('profiles', id, rest);
      await loadTable('profiles');
    },
    [patch, loadTable],
  );

  const api: DataApi = {
    db, loading, me, isAdmin, settings, maps, refresh,
    insertRows, patch, removeRows, log, notify,
    createLead, updateLead, moveLead, deleteLead, addInteraction, convertLead,
    createClient: (input) => createClient(input), updateClient, deleteClient,
    createProject, updateProject, deleteProject, applyTemplates,
    createTask, updateTask, deleteTask, addComment, startTimer, stopTimer, addTimeEntry, deleteTimeEntry, runningEntry,
    markNotificationsRead, createUser, updateUser,
  };

  return <DataContext.Provider value={api}>{children}</DataContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData fora do DataProvider');
  return ctx;
}
