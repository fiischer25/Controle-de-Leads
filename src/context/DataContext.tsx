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
import { removeTeamFiles } from '../lib/teamFiles';
import { defaultFinanceAccount, defaultFinanceCategories, defaultProjectTypes, defaultSettings, defaultSources, defaultStages } from '../lib/defaults';
import { autoProjectStatus, buildProjectTasks, followsTasks, nextProjectCode, tasksToTemplates } from '../lib/domain';
import { SWATCHES } from '../lib/constants';
import {
  TABLES,
  type ActivityLog,
  type AppSettings,
  type CalendarEvent,
  type Client,
  type InteractionType,
  type Lead,
  type ModuleKey,
  type Profile,
  type Project,
  type ProjectType,
  type TableName,
  type Tables,
  type Task,
  type TimeEntry,
  type FinanceEntry,
  type LeadPaymentPlan,
} from '../lib/types';
import { byPosition, nowIso, uid } from '../lib/utils';
import { canAccess } from '../lib/permissions';
import { planAmounts } from '../lib/paymentPlan';
import { useToast } from './ToastContext';

export type Db = { [K in TableName]: Tables[K][] };

/** Tabelas com coluna updated_at. */
const STAMPED = new Set<TableName>(['leads', 'clients', 'projects', 'tasks', 'events', 'app_settings']);

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

export type EventInput = Omit<CalendarEvent, 'id' | 'google_event_id' | 'created_by' | 'created_at' | 'updated_at'>;

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
  /** Oportunidade do cliente (onde fica o contrato); cria uma já ganha se o cliente não tiver. */
  /**
   * Oportunidade (ganha) do cliente, para guardar o contrato. Com `newDeal`, um contrato novo: se a
   * oportunidade existente já tem forma de pagamento ou projeto, cria outra só para este contrato.
   */
  ensureClientLead(clientId: string, opts?: { newDeal?: boolean; projectTypeId?: string | null }): Promise<Lead>;
  updateLead(id: string, patch: Partial<Lead>): Promise<void>;
  moveLead(id: string, stageId: string, beforeLeadId?: string | null, extra?: Partial<Lead>): Promise<void>;
  deleteLead(id: string): Promise<void>;
  addInteraction(leadId: string, type: InteractionType, description: string, happenedAt: string): Promise<void>;
  convertLead(leadId: string, client: ClientInput, project: Omit<ProjectInput, 'client_id' | 'lead_id'>): Promise<Project>;
  /**
   * Fechamento: salva a forma de pagamento no lead e, com `launch`, lança as parcelas em contas a
   * receber (uma única vez por oportunidade). Devolve quantas parcelas foram criadas.
   */
  /** replace: substitui as parcelas já lançadas desta oportunidade (se nenhuma foi recebida). */
  /** `paidBefore`: parcelas com vencimento antes desta data entram já recebidas (na data de cada uma). */
  closeDeal(leadId: string, plan: LeadPaymentPlan, launch: boolean, replace?: boolean, paidBefore?: string): Promise<number>;

  // Clientes e projetos
  createClient(input: ClientInput): Promise<Client>;
  updateClient(id: string, patch: Partial<Client>): Promise<void>;
  deleteClient(id: string): Promise<void>;
  createProject(input: ProjectInput): Promise<Project>;
  updateProject(id: string, patch: Partial<Project>): Promise<void>;
  deleteProject(id: string): Promise<void>;
  applyTemplates(projectId: string, assigneeId: string | null): Promise<void>;
  /** Usa as tarefas do projeto como modelo: substitui as tarefas-modelo de um tipo ou cria um tipo novo. */
  saveProjectAsTemplate(projectId: string, target: { typeId: string } | { newTypeName: string }, keepAssignees: boolean): Promise<{ type: ProjectType; count: number }>;

  // Tarefas
  createTask(input: TaskInput): Promise<Task>;
  updateTask(id: string, patch: Partial<Task>): Promise<void>;
  /** Troca o responsável de várias tarefas (ex.: uma etapa inteira) com um só aviso para a pessoa. */
  assignTasks(ids: string[], assigneeId: string | null, what: string): Promise<number>;
  deleteTask(id: string): Promise<void>;
  addComment(taskId: string, body: string): Promise<void>;
  startTimer(taskId: string): Promise<void>;
  stopTimer(): Promise<void>;
  addTimeEntry(taskId: string, date: string, minutes: number, note: string | null): Promise<void>;
  deleteTimeEntry(id: string): Promise<void>;
  runningEntry: TimeEntry | null;

  // Reuniões
  createEvent(input: EventInput): Promise<CalendarEvent>;
  updateEvent(id: string, patch: Partial<CalendarEvent>): Promise<void>;
  deleteEvent(id: string): Promise<void>;

  // Notificações
  markNotificationsRead(ids: string[]): Promise<void>;

  // Equipe
  createUser(input: NewUserInput): Promise<void>;
  /** O usuário atual pode ver/usar este módulo? (administradores: sempre) */
  can(module: ModuleKey): boolean;
  updateUser(id: string, patch: Partial<Profile>, auth?: { email?: string; password?: string }): Promise<void>;
}

const DataContext = createContext<DataApi | null>(null);

const PAID_MESSAGE =
  'A forma de pagamento foi salva, mas as parcelas no Financeiro não foram alteradas: já há parcela recebida desta oportunidade. Ajuste as demais no Financeiro.';

export function DataProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const toast = useToast();
  const [db, setDb] = useState<Db>(emptyDb);
  const [loading, setLoading] = useState(true);
  const dbRef = useRef(db);
  dbRef.current = db;

  const loadTable = useCallback(async <T extends TableName>(table: T) => {
    const rows = await backend.list(table);
    setDb((prev) => ({ ...prev, [table]: rows }));
    return rows;
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
          else {
            // "Ganho" e "Não ganho" são fixos no funil: recria o que faltar
            const max = Math.max(...current.lead_stages.map((s) => s.position));
            const missing = defaultStages()
              .filter((s) => s.kind !== 'open' && !current.lead_stages.some((x) => x.kind === s.kind))
              .map((s, i) => ({ ...s, position: max + 1 + i }));
            if (missing.length) seeds.push(backend.insert('lead_stages', missing));
          }
          if (current.lead_sources.length === 0) seeds.push(backend.insert('lead_sources', defaultSources()));
          if (current.project_types.length === 0) {
            const { types, templates } = defaultProjectTypes();
            seeds.push(backend.insert('project_types', types).then(() => backend.insert('task_templates', templates)));
          }
          if (current.app_settings.length === 0) seeds.push(backend.insert('app_settings', [defaultSettings()]));
          // No Supabase, as categorias e a conta inicial do Financeiro vêm da migração.
          if (backend.mode === 'local' && current.finance_categories.length === 0) {
            seeds.push(backend.insert('finance_categories', defaultFinanceCategories()));
            if (current.finance_accounts.length === 0) seeds.push(backend.insert('finance_accounts', [defaultFinanceAccount()]));
          }
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
        color: '#57534e', active: true, calendar_embed_url: null, permissions: null, created_at: nowIso(),
      },
    [db.profiles, userId],
  );
  const isAdmin = me.role === 'admin';
  const can = useCallback((module: ModuleKey) => canAccess(me, module), [me]);
  const settings = db.app_settings[0] ?? defaultSettings();

  // O que a tela mostra segue os módulos da pessoa (no Supabase o banco já filtra pelo RLS;
  // no modo demonstração o filtro é só este).
  const canCommercial = can('comercial');
  const canClients = canCommercial || can('projetos');
  const canFinance = can('financeiro');
  const visibleDb = useMemo<Db>(
    () =>
      canCommercial && canClients && canFinance
        ? db
        : {
            ...db,
            leads: canCommercial ? db.leads : [],
            lead_interactions: canCommercial ? db.lead_interactions : [],
            clients: canClients ? db.clients : [],
            finance_accounts: canFinance ? db.finance_accounts : [],
            finance_categories: canFinance ? db.finance_categories : [],
            finance_entries: canFinance ? db.finance_entries : [],
            finance_member_costs: canFinance ? db.finance_member_costs : [],
          },
    [db, canCommercial, canClients, canFinance],
  );

  const maps = useMemo(
    () => ({
      profiles: index(visibleDb.profiles),
      stages: index(visibleDb.lead_stages),
      sources: index(visibleDb.lead_sources),
      types: index(visibleDb.project_types),
      clients: index(visibleDb.clients),
      projects: index(visibleDb.projects),
      leads: index(visibleDb.leads),
      tasks: index(visibleDb.tasks),
    }),
    [visibleDb],
  );

  const runningEntry = useMemo(
    () => db.time_entries.find((e) => e.user_id === userId && !e.ended_at) ?? null,
    [db.time_entries, userId],
  );

  // ------------------------------------------------------------------ genéricos
  const insertRows = useCallback(async <T extends TableName>(table: T, rows: Tables[T][]) => {
    if (rows.length === 0) return rows;
    const saved = await backend.insert(table, rows);
    const ids = new Set(saved.map((r) => (r as { id: string }).id));
    const merge = (prev: Db): Db => ({ ...prev, [table]: [...prev[table].filter((r) => !ids.has((r as { id: string }).id)), ...saved] });
    // Já disponível para a próxima ação da mesma operação (antes da nova renderização)
    dbRef.current = merge(dbRef.current);
    setDb(merge);
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

  const ensureClientLead = useCallback(
    async (clientId: string, opts: { newDeal?: boolean; projectTypeId?: string | null } = {}) => {
      const client = dbRef.current.clients.find((c) => c.id === clientId);
      if (!client) throw new Error('Cliente não encontrado.');
      const existing =
        (client.lead_id && dbRef.current.leads.find((l) => l.id === client.lead_id)) || dbRef.current.leads.find((l) => l.client_id === clientId);
      const taken = existing && (existing.payment_plan || dbRef.current.projects.some((p) => p.lead_id === existing.id));
      if (existing && !(opts.newDeal && taken)) {
        if (client.lead_id !== existing.id) await patch('clients', clientId, { lead_id: existing.id });
        return existing;
      }
      const stages = dbRef.current.lead_stages;
      const won = stages.find((s) => s.kind === 'won') ?? stages[0];
      if (!won) throw new Error('Cadastre as etapas do funil em Configurações.');
      const now = nowIso();
      // Contrato de um projeto novo: oportunidade fechada agora; senão, desde o cadastro do cliente
      const at = opts.newDeal ? now : client.created_at;
      const lead: Lead = {
        id: uid(),
        name: client.name,
        phone: client.phone,
        email: client.email || null,
        city: client.city,
        state: client.state,
        area_m2: null,
        category: null,
        project_type_id: opts.projectTypeId ?? dbRef.current.projects.find((p) => p.client_id === clientId)?.project_type_id ?? null,
        source_id: null,
        referred_by: null,
        proposal_value: null,
        stage_id: won.id,
        owner_id: userId,
        position: 0,
        next_contact_date: null,
        expected_close_date: null,
        lost_reason: null,
        notes: opts.newDeal ? 'Criada a partir do contrato do projeto.' : 'Criada a partir do cadastro do cliente para registrar o contrato.',
        stage_changed_at: at,
        closed_at: at,
        client_id: clientId,
        converted_at: at,
        created_by: userId,
        created_at: at,
        updated_at: now,
      };
      const [saved] = await insertRows('leads', [lead]);
      // O cliente continua apontando para o primeiro contrato (Editar cliente → Contrato)
      if (!existing) await patch('clients', clientId, { lead_id: saved.id });
      await log('lead', saved.id, 'created', `registrou o contrato de ${client.name}`);
      return saved;
    },
    [insertRows, patch, log, userId],
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

  const closeDeal = useCallback(
    async (leadId: string, plan: LeadPaymentPlan, launch: boolean, replace = false, paidBefore?: string) => {
      const lead = dbRef.current.leads.find((l) => l.id === leadId);
      if (!lead) throw new Error('Oportunidade não encontrada.');
      await patch('leads', leadId, { payment_plan: plan, proposal_value: plan.total });
      await log('lead', leadId, 'payment_plan', `definiu a forma de pagamento de ${lead.name}`);
      if (!launch) return 0;
      if (backend.mode === 'supabase') {
        // Função segura do banco: funciona também para quem só tem o módulo Comercial
        const created = Number(await backend.rpc('create_lead_receivables', { p_lead: leadId, p_replace: replace })) || 0;
        if (canAccess(dbRef.current.profiles.find((p) => p.id === userId), 'financeiro')) {
          const rows = (await loadTable('finance_entries')) as FinanceEntry[];
          // Parcelas de meses passados (projeto já em andamento): recebidas na data de cada uma
          if (paidBefore) {
            for (const e of rows.filter((x) => x.lead_id === leadId && !x.paid_at && x.due_date < paidBefore)) {
              await patch('finance_entries', e.id, { paid_at: e.due_date });
            }
          }
        }
        return created;
      }
      // Modo demonstração: mesmas regras da função do banco
      const existing = dbRef.current.finance_entries.filter((e) => e.lead_id === leadId);
      if (existing.length) {
        if (!replace) return 0;
        if (existing.some((e) => e.paid_at)) throw new Error(PAID_MESSAGE);
        await removeRows('finance_entries', existing.map((e) => e.id));
      }
      const amounts = planAmounts(plan.total, plan.rows);
      if (!amounts.length) return 0;
      const n = plan.rows.length;
      const series = n > 1 ? uid() : null;
      const now = nowIso();
      const category = [...dbRef.current.finance_categories]
        .sort(byPosition)
        .find((c) => c.kind === 'receita' && c.active && c.name.toLowerCase().startsWith('honor'));
      const project = dbRef.current.projects.find((p) => p.lead_id === leadId);
      const account = plan.account_id && dbRef.current.finance_accounts.some((a) => a.id === plan.account_id) ? plan.account_id : null;
      const rows: FinanceEntry[] = plan.rows.map((r, i) => ({
        id: uid(),
        kind: 'receita',
        description: `Honorários ${lead.name} · ${r.label.trim() || `Parcela ${i + 1}`}`,
        amount: amounts[i],
        due_date: r.due_date,
        paid_at: paidBefore && r.due_date < paidBefore ? r.due_date : null,
        account_id: account,
        to_account_id: null,
        category_id: category?.id ?? null,
        client_id: lead.client_id,
        project_id: project?.id ?? null,
        lead_id: leadId,
        series_id: series,
        installment: n > 1 ? i + 1 : null,
        installments: n > 1 ? n : null,
        document: null,
        notes: 'Forma de pagamento definida no fechamento da oportunidade',
        created_by: userId,
        created_at: now,
        updated_at: now,
      }));
      const valid = rows.filter((r) => r.amount > 0);
      await insertRows('finance_entries', valid);
      return valid.length;
    },
    [patch, log, insertRows, removeRows, loadTable, userId],
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
    async (projectId: string, assigneeId: string | null) => {
      const project = dbRef.current.projects.find((p) => p.id === projectId);
      if (!project) return;
      const templates = dbRef.current.task_templates.filter((t) => t.project_type_id === project.project_type_id);
      const existing = dbRef.current.tasks.filter((t) => t.project_id === projectId);
      const offset = existing.length ? Math.max(...existing.map((t) => t.position)) + 1 : 0;
      const activeUserIds = new Set(dbRef.current.profiles.filter((p) => p.active).map((p) => p.id));
      const tasks = buildProjectTasks({ templates, projectId, assigneeId, createdBy: userId, activeUserIds }).map((t) => ({
        ...t,
        position: t.position + offset,
      }));
      await insertRows('tasks', tasks);
      // Cada responsável recebe um aviso com quantas tarefas ficaram com ele
      const perPerson = new Map<string, number>();
      for (const t of tasks) if (t.assignee_id) perPerson.set(t.assignee_id, (perPerson.get(t.assignee_id) ?? 0) + 1);
      for (const [person, n] of perPerson) {
        await notify(person, 'Novas tarefas atribuídas', `${n} ${n === 1 ? 'tarefa' : 'tarefas'} do projeto ${project.name} ${n === 1 ? 'está' : 'estão'} com você.`, `/projetos/${projectId}`);
      }
    },
    [insertRows, notify, userId],
  );

  const saveProjectAsTemplate = useCallback(
    async (projectId: string, target: { typeId: string } | { newTypeName: string }, keepAssignees: boolean) => {
      const project = dbRef.current.projects.find((p) => p.id === projectId);
      if (!project) throw new Error('Projeto não encontrado.');
      const tasks = dbRef.current.tasks.filter((t) => t.project_id === projectId);
      if (!tasks.length) throw new Error('O projeto não tem tarefas para usar como modelo.');
      let type: ProjectType | undefined;
      if ('typeId' in target) {
        type = dbRef.current.project_types.find((t) => t.id === target.typeId);
        if (!type) throw new Error('Tipo de projeto não encontrado.');
      } else {
        const name = target.newTypeName.trim();
        if (!name) throw new Error('Informe o nome do novo tipo de projeto.');
        const types = dbRef.current.project_types;
        [type] = await insertRows('project_types', [
          {
            id: uid(),
            name,
            description: `Criado a partir do projeto ${project.name}`,
            color: SWATCHES[types.length % SWATCHES.length],
            active: true,
            position: types.length ? Math.max(...types.map((t) => t.position)) + 1 : 0,
          },
        ]);
      }
      const old = dbRef.current.task_templates.filter((t) => t.project_type_id === type.id).map((t) => t.id);
      const templates = tasksToTemplates(tasks, type.id, keepAssignees);
      // Grava as novas antes de apagar as antigas: se algo falhar, o modelo anterior continua lá
      await insertRows('task_templates', templates);
      if (old.length) await removeRows('task_templates', old);
      await log('project', projectId, 'template', `usou o projeto ${project.name} como modelo de “${type.name}” (${templates.length} tarefas)`);
      return { type, count: templates.length };
    },
    [insertRows, removeRows, log],
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
      const activeUserIds = new Set(dbRef.current.profiles.filter((p) => p.active).map((p) => p.id));
      const tasks = buildProjectTasks({ templates, projectId: saved.id, assigneeId: default_assignee_id, createdBy: userId, activeUserIds });
      await insertRows('tasks', tasks);
      await log('project', saved.id, 'created', `criou o projeto ${saved.name}`);
      const people = new Set([saved.manager_id, ...saved.member_ids, default_assignee_id, ...tasks.map((t) => t.assignee_id)].filter(Boolean) as string[]);
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
      const files = [
        ...(project?.attachments ?? []),
        ...dbRef.current.tasks.filter((t) => taskSet.has(t.id)).flatMap((t) => t.attachments ?? []),
      ].map((a) => a.path);
      await removeRows('tasks', taskIds);
      await removeRows('projects', [id]);
      // Documentos e arquivos das tarefas vão junto (falha aqui não desfaz a exclusão)
      if (files.length) await removeTeamFiles(files);
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
      // Parcelas do fechamento passam a apontar para o projeto (no Supabase, um gatilho do banco faz isso)
      if (backend.mode === 'local') {
        for (const e of dbRef.current.finance_entries.filter((x) => x.lead_id === leadId && !x.project_id)) {
          await patch('finance_entries', e.id, { project_id: project.id, client_id: e.client_id ?? client.id });
        }
      }
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
      // Status automático do projeto: em andamento quando alguma tarefa avança (definido à mão, fica)
      if (changes.status && changes.status !== before.status && before.project_id) {
        const project = dbRef.current.projects.find((p) => p.id === before.project_id);
        if (project && followsTasks(project)) {
          const tasks = dbRef.current.tasks.filter((t) => t.project_id === project.id).map((t) => (t.id === id ? { ...t, status: changes.status! } : t));
          const next = autoProjectStatus(tasks);
          if (next !== project.status) await patch('projects', project.id, { status: next });
        }
      }
    },
    [patch, notify, log, me.name, userId],
  );

  const assignTasks = useCallback(
    async (ids: string[], assigneeId: string | null, what: string) => {
      const changed = dbRef.current.tasks.filter((t) => ids.includes(t.id) && t.assignee_id !== assigneeId);
      for (const t of changed) await patch('tasks', t.id, { assignee_id: assigneeId });
      if (changed.length && assigneeId && assigneeId !== userId) {
        const n = changed.length;
        await notify(assigneeId, 'Tarefas designadas a você', `${me.name} designou ${n} ${n === 1 ? 'tarefa' : 'tarefas'} de ${what} para você.`, '/tarefas');
      }
      return changed.length;
    },
    [patch, notify, me.name, userId],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      await removeRows('time_entries', dbRef.current.time_entries.filter((e) => e.task_id === id).map((e) => e.id));
      await removeRows('task_comments', dbRef.current.task_comments.filter((c) => c.task_id === id).map((c) => c.id));
      const files = (dbRef.current.tasks.find((t) => t.id === id)?.attachments ?? []).map((a) => a.path);
      await removeRows('tasks', [id]);
      // Arquivos anexados vão junto (falha aqui não desfaz a exclusão)
      if (files.length) await removeTeamFiles(files);
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

  // ------------------------------------------------------------------ reuniões
  const syncCalendar = useCallback((action: 'upsert' | 'delete', ev: CalendarEvent) => {
    // Sincroniza com o Google Agenda do escritório quando a integração estiver configurada no servidor.
    if (backend.mode !== 'supabase') return;
    backend.invokeFunction('calendar-sync', { action, event_id: ev.id, google_event_id: ev.google_event_id }).catch(() => undefined);
  }, []);

  const createEvent = useCallback(
    async (input: EventInput) => {
      const now = nowIso();
      const [saved] = await insertRows('events', [
        { ...input, id: uid(), google_event_id: null, created_by: userId, created_at: now, updated_at: now },
      ]);
      await log('event', saved.id, 'created', `agendou "${saved.title}"`);
      const when = new Date(saved.starts_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: saved.all_day ? undefined : 'short' });
      for (const p of saved.participant_ids) {
        await notify(p, 'Nova reunião na sua agenda', `${me.name} agendou "${saved.title}" · ${when}`, `/agenda?evento=${saved.id}`);
      }
      syncCalendar('upsert', saved);
      return saved;
    },
    [insertRows, log, notify, syncCalendar, userId, me.name],
  );

  const updateEvent = useCallback(
    async (id: string, changes: Partial<CalendarEvent>) => {
      const before = dbRef.current.events.find((e) => e.id === id);
      await patch('events', id, changes);
      if (!before) return;
      const added = (changes.participant_ids ?? []).filter((p) => !before.participant_ids.includes(p));
      for (const p of added) {
        await notify(p, 'Nova reunião na sua agenda', `${me.name} incluiu você em "${changes.title ?? before.title}".`, `/agenda?evento=${id}`);
      }
      syncCalendar('upsert', { ...before, ...changes });
    },
    [patch, notify, syncCalendar, me.name],
  );

  const deleteEvent = useCallback(
    async (id: string) => {
      const ev = dbRef.current.events.find((e) => e.id === id);
      await removeRows('events', [id]);
      if (ev) {
        await log('event', id, 'deleted', `cancelou "${ev.title}"`);
        for (const p of ev.participant_ids) {
          await notify(p, 'Reunião cancelada', `${me.name} cancelou "${ev.title}".`, '/agenda');
        }
        syncCalendar('delete', ev);
      }
    },
    [removeRows, log, notify, syncCalendar, me.name],
  );

  const markNotificationsRead = useCallback(
    async (ids: string[]) => {
      for (const id of ids) await patch('notifications', id, { read: true });
    },
    [patch],
  );

  // ------------------------------------------------------------------ equipe
  const createUser = useCallback(
    async (input: NewUserInput) => {
      const profile = await backend.createUser(input);
      // A Edge Function pode ser de uma versão anterior aos acessos por módulo: garante aqui.
      if (input.role !== 'admin' && input.permissions) await backend.update('profiles', profile.id, { permissions: input.permissions });
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
    db: visibleDb, loading, me, isAdmin, settings, maps, refresh,
    insertRows, patch, removeRows, log, notify,
    createLead, ensureClientLead, updateLead, moveLead, deleteLead, addInteraction, convertLead, closeDeal,
    createClient: (input) => createClient(input), updateClient, deleteClient,
    createProject, updateProject, deleteProject, applyTemplates, saveProjectAsTemplate,
    createTask, updateTask, assignTasks, deleteTask, addComment, startTimer, stopTimer, addTimeEntry, deleteTimeEntry, runningEntry,
    createEvent, updateEvent, deleteEvent,
    markNotificationsRead, createUser, updateUser, can,
  };

  return <DataContext.Provider value={api}>{children}</DataContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData fora do DataProvider');
  return ctx;
}
