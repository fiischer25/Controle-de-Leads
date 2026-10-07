// Resumo diário no WhatsApp: tarefas atrasadas e que vencem, prazos dos projetos e retornos de
// leads do dia, enviado a cada membro com telefone no horário escolhido em
// Configurações → Resumo diário.
//
// Arquivo único de propósito: pode ser publicado colando este código no painel do Supabase
// (Edge Functions → Deploy a new function → Via Editor, nome "whatsapp-alerts") ou pela CLI:
//   npx supabase functions deploy whatsapp-alerts --no-verify-jwt
//
// Segredos (Edge Functions → Secrets):
//   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID  os mesmos do assistente do WhatsApp
//   ALERTS_CRON_SECRET            frase secreta enviada pelo agendamento no cabeçalho x-cron-secret
//   WHATSAPP_ALERT_TEMPLATE       opcional, nome do modelo aprovado na Meta (padrão resumo_diario)
//   WHATSAPP_ALERT_TEMPLATE_LANG  opcional, idioma do modelo (padrão pt_BR)
//   APP_URL, AGENT_TIMEZONE       opcionais (link do sistema; fuso, padrão America/Sao_Paulo)
//
// Regra da Meta: texto livre só chega a quem escreveu para o número nas últimas 24 horas.
// Para os demais, vai o modelo aprovado com o resumo em uma linha; ao responder, a pessoa
// abre a conversa e pode pedir os detalhes ao assistente.
//
// O agendamento (Integrations → Cron) chama esta função de hora em hora com
// { "action": "run" } e o cabeçalho x-cron-secret. O registro diário evita mensagens repetidas.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, x-retry-count, x-region, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const TIMEZONE = Deno.env.get('AGENT_TIMEZONE') || 'America/Sao_Paulo';
const GRAPH = 'https://graph.facebook.com/v21.0';

// --------------------------------------------------------------------------- tipos
type ModuleKey = 'projetos' | 'comercial' | 'relatorios' | 'equipe' | 'configuracoes' | 'financeiro';

export interface AlertProfile {
  id: string;
  name: string;
  role: 'admin' | 'member';
  phone: string | null;
  active: boolean;
  permissions?: ModuleKey[] | null;
  wa_alerts?: boolean | null;
}

export interface AlertSettings {
  due_soon_days?: number | null;
  wa_alerts_enabled?: boolean | null;
  wa_alerts_hour?: number | null;
  wa_alerts_tasks?: boolean | null;
  wa_alerts_projects?: boolean | null;
  wa_alerts_leads?: boolean | null;
  wa_alerts_weekends?: boolean | null;
}

export interface AlertTask {
  id: string;
  title: string;
  project_id: string | null;
  assignee_id: string | null;
  status: string;
  due_date: string | null;
}
export interface AlertProject {
  id: string;
  name: string;
  status: string;
  manager_id: string | null;
  member_ids: string[] | null;
  due_date: string | null;
}
export interface AlertLead {
  id: string;
  name: string;
  phone: string | null;
  owner_id: string | null;
  stage_id: string;
  next_contact_date: string | null;
}
export interface AlertData {
  tasks: AlertTask[];
  projects: AlertProject[];
  leads: AlertLead[];
  stages: Array<{ id: string; kind: string }>;
}

export interface Digest {
  /** Mensagem completa (texto livre do WhatsApp, com *negrito*). */
  text: string;
  /** Uma linha, sem quebras: vai como parâmetro do modelo aprovado pela Meta. */
  summary: string;
  /** Nada para avisar: não envia mensagem. */
  empty: boolean;
}

// --------------------------------------------------------------------------- datas no fuso
function zonedParts(date: Date, tz: string) {
  const out: Record<string, string> = {};
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' });
  for (const p of dtf.formatToParts(date)) out[p.type] = p.value;
  return out;
}

/** Dia (AAAA-MM-DD) e hora local no fuso do escritório. */
export function localClock(now: Date, tz: string): { day: string; hour: number } {
  const p = zonedParts(now, tz);
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function weekday(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

function short(key: string): string {
  const [, m, d] = key.split('-');
  return `${d}/${m}`;
}

// --------------------------------------------------------------------------- regras
const DEFAULT_MODULES: ModuleKey[] = ['projetos', 'comercial', 'relatorios', 'equipe'];
const ACTIVE = new Set(['nao_iniciado', 'em_andamento', 'obra', 'pausado']);
/** Itens por seção antes do "e mais N". */
const LIMIT = 6;

function hasModule(me: AlertProfile, module: ModuleKey): boolean {
  return me.role === 'admin' || (me.permissions ?? DEFAULT_MODULES).includes(module);
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function joinPt(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

function section(title: string, lines: string[]): string[] {
  if (lines.length === 0) return [];
  const shown = lines.slice(0, LIMIT).map((l) => `• ${l}`);
  if (lines.length > LIMIT) shown.push(`• e mais ${lines.length - LIMIT}`);
  return [`*${title}*`, ...shown, ''];
}

/**
 * O agendamento roda de hora em hora. Envia a partir do horário escolhido, com até 4 horas de
 * tolerância caso uma execução falhe; o registro diário impede mensagens repetidas.
 */
export function shouldSendNow(settings: AlertSettings, now: Date, tz: string): { send: boolean; reason: string } {
  if (!settings.wa_alerts_enabled) return { send: false, reason: 'Resumo diário desligado em Configurações.' };
  const { day, hour } = localClock(now, tz);
  const target = settings.wa_alerts_hour ?? 8;
  const wd = weekday(day);
  if (!settings.wa_alerts_weekends && (wd === 0 || wd === 6)) return { send: false, reason: 'Fim de semana.' };
  if (hour < target || hour >= target + 4) return { send: false, reason: `Fora do horário (${String(target).padStart(2, '0')}h).` };
  return { send: true, reason: 'ok' };
}

/** Monta o resumo do dia de uma pessoa. Administradores recebem também os números do escritório. */
export function buildDigest(opts: { me: AlertProfile; data: AlertData; settings: AlertSettings; day: string; hour: number; appUrl?: string | null }): Digest {
  const { me, data, settings, day, hour } = opts;
  const tomorrow = addDaysKey(day, 1);
  const soonLimit = addDaysKey(day, settings.due_soon_days || 7);
  const projects = new Map(data.projects.map((p) => [p.id, p]));
  const openStage = new Set(data.stages.filter((s) => s.kind === 'open').map((s) => s.id));
  const wantTasks = settings.wa_alerts_tasks !== false;
  const wantProjects = settings.wa_alerts_projects !== false;
  const wantLeads = settings.wa_alerts_leads !== false && hasModule(me, 'comercial');

  // Tarefas abertas (avulsas ou de projetos ativos)
  const openTasks = data.tasks.filter((t) => {
    if (t.status === 'done') return false;
    if (!t.project_id) return true;
    const p = projects.get(t.project_id);
    return !!p && ACTIVE.has(p.status);
  });
  const byDue = (a: AlertTask, b: AlertTask) => (a.due_date ?? '').localeCompare(b.due_date ?? '') || a.title.localeCompare(b.title);
  const mine = wantTasks ? openTasks.filter((t) => t.assignee_id === me.id && t.due_date) : [];
  const overdue = mine.filter((t) => t.due_date! < day).sort(byDue);
  const dueToday = mine.filter((t) => t.due_date === day).sort(byDue);
  const dueTomorrow = mine.filter((t) => t.due_date === tomorrow).sort(byDue);
  const taskLine = (t: AlertTask, late: boolean) => {
    const p = t.project_id ? projects.get(t.project_id) : null;
    return [t.title, p?.name ?? 'avulsa', late ? `venceu ${short(t.due_date!)}` : ''].filter(Boolean).join(' · ');
  };

  // Projetos em que a pessoa está (responsável ou equipe) com prazo vencido ou dentro do alerta
  const myProjects = wantProjects
    ? data.projects
        .filter((p) => ACTIVE.has(p.status) && p.due_date && p.due_date <= soonLimit)
        .filter((p) => p.manager_id === me.id || (p.member_ids ?? []).includes(me.id))
        .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
    : [];
  const projectLine = (p: AlertProject) => {
    const due = p.due_date!;
    if (due < day) return `${p.name} · prazo vencido em ${short(due)}`;
    if (due === day) return `${p.name} · entrega hoje`;
    if (due === tomorrow) return `${p.name} · entrega amanhã`;
    const days = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000);
    return `${p.name} · entrega em ${days} dias (${short(due)})`;
  };

  // Retornos de leads da pessoa (atrasados e de hoje)
  const followups = wantLeads
    ? data.leads
        .filter((l) => l.owner_id === me.id && openStage.has(l.stage_id) && l.next_contact_date && l.next_contact_date <= day)
        .sort((a, b) => (a.next_contact_date ?? '').localeCompare(b.next_contact_date ?? ''))
    : [];
  const leadLine = (l: AlertLead) =>
    [l.name, l.phone, l.next_contact_date! < day ? `pendente desde ${short(l.next_contact_date!)}` : ''].filter(Boolean).join(' · ');

  // Escritório (administradores)
  const office: string[] = [];
  if (me.role === 'admin') {
    const teamOverdue = openTasks.filter((t) => t.due_date && t.due_date < day).length;
    const lateProjects = data.projects.filter((p) => ACTIVE.has(p.status) && p.due_date && p.due_date < day).length;
    const pending = data.leads.filter((l) => openStage.has(l.stage_id) && l.next_contact_date && l.next_contact_date <= day).length;
    if (teamOverdue) office.push(plural(teamOverdue, 'tarefa atrasada na equipe', 'tarefas atrasadas na equipe'));
    if (lateProjects) office.push(plural(lateProjects, 'projeto com prazo vencido', 'projetos com prazo vencido'));
    if (pending) office.push(plural(pending, 'retorno de lead pendente', 'retornos de leads pendentes'));
  }

  const summary: string[] = [];
  if (overdue.length) summary.push(plural(overdue.length, 'tarefa atrasada', 'tarefas atrasadas'));
  if (dueToday.length) summary.push(plural(dueToday.length, 'tarefa vence hoje', 'tarefas vencem hoje'));
  if (dueTomorrow.length) summary.push(plural(dueTomorrow.length, 'vence amanhã', 'vencem amanhã'));
  if (myProjects.length) summary.push(plural(myProjects.length, 'projeto com prazo próximo', 'projetos com prazo próximo'));
  if (followups.length) summary.push(plural(followups.length, 'retorno de lead', 'retornos de leads'));
  if (office.length) summary.push(`no escritório, ${office.join(', ')}`);

  const empty = summary.length === 0;
  const hello = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const lines = [
    `${hello}, ${me.name.split(' ')[0]}! Seu resumo de ${WEEKDAYS[weekday(day)]}, ${short(day)}:`,
    '',
    ...section(`Tarefas atrasadas (${overdue.length})`, overdue.map((t) => taskLine(t, true))),
    ...section(`Vencem hoje (${dueToday.length})`, dueToday.map((t) => taskLine(t, false))),
    ...section(`Vencem amanhã (${dueTomorrow.length})`, dueTomorrow.map((t) => taskLine(t, false))),
    ...section('Prazos dos seus projetos', myProjects.map(projectLine)),
    ...section(`Retornos de leads (${followups.length})`, followups.map(leadLine)),
    ...(office.length ? ['*Escritório*', office.join(' · '), ''] : []),
  ];
  if (empty) lines.push('Nada atrasado nem vencendo hoje. Bom trabalho!', '');
  if (opts.appUrl) lines.push(`Abrir o sistema: ${opts.appUrl.replace(/\/$/, '')}`);
  lines.push('Responda aqui para falar com o assistente.');

  return {
    text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    summary: empty ? 'nada atrasado nem vencendo hoje' : joinPt(summary),
    empty,
  };
}

// --------------------------------------------------------------------------- WhatsApp (Meta)
interface WhatsAppConfig {
  token: string;
  phoneNumberId: string;
}

/** Número no formato internacional (somente dígitos, com 55). */
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  const d = (raw ?? '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return d.startsWith('55') && d.length >= 12 ? d : `55${d}`;
}

async function post(cfg: WhatsAppConfig, body: Record<string, unknown>) {
  const res = await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...body }),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${await res.text()}`);
}

async function sendText(cfg: WhatsAppConfig, to: string, text: string) {
  await post(cfg, { to, type: 'text', text: { body: text.slice(0, 4000), preview_url: true } });
}

/** Modelo aprovado: os parâmetros não podem ter quebras de linha nem mais de 4 espaços seguidos. */
async function sendTemplate(cfg: WhatsAppConfig, to: string, name: string, language: string, params: string[]) {
  const clean = params.map((p) => p.replace(/[\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim() || '-');
  await post(cfg, {
    to,
    type: 'template',
    template: { name, language: { code: language }, components: [{ type: 'body', parameters: clean.map((text) => ({ type: 'text', text })) }] },
  });
}

/** A pessoa escreveu para o número nas últimas 24 horas (com margem)? */
async function conversationOpen(db: SupabaseClient, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - 23 * 3_600_000).toISOString();
  const { data, error } = await db
    .from('agent_messages')
    .select('id')
    .eq('user_id', userId)
    .eq('channel', 'whatsapp')
    .eq('role', 'user')
    .gte('created_at', since)
    .limit(1);
  return !error && (data?.length ?? 0) > 0;
}

async function deliver(db: SupabaseClient, wa: WhatsAppConfig, me: AlertProfile, digest: Digest): Promise<{ status: 'enviado' | 'modelo'; detail: string | null }> {
  const to = toWhatsAppNumber(me.phone);
  if (!to) throw new Error('Telefone inválido no cadastro.');
  if (await conversationOpen(db, me.id)) {
    await sendText(wa, to, digest.text);
    return { status: 'enviado', detail: null };
  }
  const template = Deno.env.get('WHATSAPP_ALERT_TEMPLATE') || 'resumo_diario';
  const language = Deno.env.get('WHATSAPP_ALERT_TEMPLATE_LANG') || 'pt_BR';
  await sendTemplate(wa, to, template, language, [me.name.split(' ')[0], digest.summary]);
  return { status: 'modelo', detail: `modelo ${template}` };
}

// --------------------------------------------------------------------------- dados
async function loadData(db: SupabaseClient, day: string) {
  const tomorrow = addDaysKey(day, 1);
  const [settings, profiles, tasks, projects, leads, stages] = await Promise.all([
    db.from('app_settings').select('*').eq('id', 'office').maybeSingle(),
    db.from('profiles').select('*').eq('active', true),
    db.from('tasks').select('id, title, project_id, assignee_id, status, due_date').neq('status', 'done').lte('due_date', tomorrow),
    db.from('projects').select('id, name, status, manager_id, member_ids, due_date').in('status', [...ACTIVE]),
    db.from('leads').select('id, name, phone, owner_id, stage_id, next_contact_date').lte('next_contact_date', day),
    db.from('lead_stages').select('id, kind'),
  ]);
  for (const r of [profiles, tasks, projects, leads, stages]) if (r.error) throw new Error(r.error.message);
  return {
    settings: (settings.data ?? {}) as AlertSettings,
    profiles: (profiles.data ?? []) as AlertProfile[],
    data: {
      tasks: (tasks.data ?? []) as AlertTask[],
      projects: (projects.data ?? []) as AlertProject[],
      leads: (leads.data ?? []) as AlertLead[],
      stages: (stages.data ?? []) as AlertData['stages'],
    },
  };
}

function whatsappConfig(): WhatsAppConfig | null {
  const token = Deno.env.get('WHATSAPP_TOKEN');
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  return token && phoneNumberId ? { token, phoneNumberId } : null;
}

const MIGRATION_HINT = 'Execute no SQL Editor a migração 20261005000000_whatsapp_alerts.sql.';

/** Execução agendada: envia o resumo do dia para cada pessoa (uma vez por dia). */
async function runAll(db: SupabaseClient) {
  const now = new Date();
  const { day, hour } = localClock(now, TIMEZONE);
  const { settings, profiles, data } = await loadData(db, day);
  if (!('wa_alerts_enabled' in settings)) return { error: `Banco sem as colunas do resumo diário. ${MIGRATION_HINT}` };
  const check = shouldSendNow(settings, now, TIMEZONE);
  if (!check.send) return { skipped: check.reason };
  const wa = whatsappConfig();
  if (!wa) return { error: 'WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID não configurados.' };

  const appUrl = Deno.env.get('APP_URL');
  const counts: Record<string, number> = {};
  for (const me of profiles) {
    if (me.wa_alerts === false || !toWhatsAppNumber(me.phone)) continue;
    // Reserva o envio do dia; se já existe, outra execução já cuidou desta pessoa.
    const { error: claim } = await db.from('whatsapp_alert_log').insert({ user_id: me.id, day });
    if (claim) {
      if (claim.code === '23505') continue;
      throw new Error(`${claim.message}. ${MIGRATION_HINT}`);
    }
    const digest = buildDigest({ me, data, settings, day, hour, appUrl });
    let status = 'sem_novidades';
    let detail: string | null = null;
    if (!digest.empty) {
      try {
        ({ status, detail } = await deliver(db, wa, me, digest));
      } catch (e) {
        status = 'erro';
        detail = e instanceof Error ? e.message.slice(0, 500) : String(e);
      }
    }
    await db.from('whatsapp_alert_log').update({ status, detail }).eq('user_id', me.id).eq('day', day);
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return { ok: true, day, counts };
}

// --------------------------------------------------------------------------- servidor
async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? 'run');
  const url = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    if (action === 'run') {
      const secret = Deno.env.get('ALERTS_CRON_SECRET');
      if (!secret) return json({ error: 'Defina o segredo ALERTS_CRON_SECRET.' }, 500);
      if (req.headers.get('x-cron-secret') !== secret) return json({ error: 'Chamada não autorizada.' }, 401);
      return json(await runAll(db));
    }

    // Ações do sistema: exigem usuário logado e ativo.
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: auth } = await caller.auth.getUser();
    if (!auth.user) return json({ error: 'Sessão expirada. Entre novamente.' }, 401);
    const { data: me } = await db.from('profiles').select('*').eq('id', auth.user.id).single<AlertProfile>();
    if (!me?.active) return json({ error: 'Usuário desativado.' }, 403);

    if (action === 'log') {
      if (me.role !== 'admin') return json({ error: 'Apenas administradores.' }, 403);
      const since = addDaysKey(localClock(new Date(), TIMEZONE).day, -14);
      const { data, error } = await db
        .from('whatsapp_alert_log')
        .select('user_id, day, status, detail, created_at')
        .gte('day', since)
        .order('day', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) return json({ error: `${error.message}. ${MIGRATION_HINT}` }, 500);
      return json({ log: data });
    }

    if (action === 'preview' || action === 'test') {
      const now = new Date();
      const { day, hour } = localClock(now, TIMEZONE);
      const { settings, data } = await loadData(db, day);
      const digest = buildDigest({ me, data, settings, day, hour, appUrl: Deno.env.get('APP_URL') });
      if (action === 'preview') return json({ text: digest.text, summary: digest.summary, empty: digest.empty });
      if (me.role !== 'admin') return json({ error: 'Apenas administradores.' }, 403);
      const wa = whatsappConfig();
      if (!wa) return json({ error: 'Configure WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID nos segredos do Supabase.' }, 400);
      if (!toWhatsAppNumber(me.phone)) return json({ error: 'Cadastre o seu telefone em Meu perfil.' }, 400);
      const result = await deliver(db, wa, me, digest);
      return json({ ok: true, ...result, text: digest.text, summary: digest.summary });
    }

    return json({ error: 'Ação desconhecida.' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : 'Falha ao processar.' }, 500);
  }
}

// Nos testes (AIROS_NO_SERVE=1) só as funções puras são usadas.
if (Deno.env.get('AIROS_NO_SERVE') !== '1') Deno.serve(handle);
