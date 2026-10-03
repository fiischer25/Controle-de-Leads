// Testes do assistente: `deno test supabase/functions/_shared/agent/agent.test.ts`
// Usam um banco em memória e um cliente do Claude simulado (não chamam APIs externas).
import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1';
import type { Filter, ListOptions, Store } from './store.ts';
import { executeTool, toolsFor, type Profile, type ToolContext } from './tools.ts';
import { runAgent } from './run.ts';
import { zonedToIso, isoToZoned } from './time.ts';
import { phoneKey, samePhone } from '../phone.ts';

class MemoryStore implements Store {
  tables: Record<string, Record<string, unknown>[]> = {};
  constructor(seed: Record<string, Record<string, unknown>[]>) {
    for (const [k, v] of Object.entries(seed)) this.tables[k] = v.map((r) => ({ ...r }));
  }
  private rows(t: string) {
    return (this.tables[t] ??= []);
  }
  list<T>(table: string, filters: Filter[] = [], opts: ListOptions = {}): Promise<T[]> {
    let rows = this.rows(table).filter((r) =>
      filters.every((f) => {
        const v = r[f.col] as string | number | null;
        switch (f.op) {
          case 'eq': return v === f.value;
          case 'neq': return v !== f.value;
          case 'gte': return v != null && v >= (f.value as string);
          case 'lte': return v != null && v <= (f.value as string);
          case 'in': return (f.value as unknown[]).includes(v);
          case 'is': return v === f.value;
        }
      }),
    );
    if (opts.limit) rows = rows.slice(0, opts.limit);
    return Promise.resolve(rows.map((r) => ({ ...r })) as T[]);
  }
  insert<T>(table: string, row: Record<string, unknown>): Promise<T> {
    this.rows(table).push({ ...row });
    return Promise.resolve({ ...row } as T);
  }
  update<T>(table: string, id: string, patch: Record<string, unknown>): Promise<T> {
    const row = this.rows(table).find((r) => r.id === id);
    if (!row) throw new Error('not found');
    Object.assign(row, patch);
    return Promise.resolve({ ...row } as T);
  }
  remove(table: string, id: string): Promise<void> {
    this.tables[table] = this.rows(table).filter((r) => r.id !== id);
    return Promise.resolve();
  }
}

const TZ = 'America/Sao_Paulo';
const NOW = new Date('2026-09-30T13:00:00Z'); // quarta, 10:00 em Brasília
const ADMIN: Profile = { id: 'u-admin', name: 'Matheus Fischer', email: 'm@x.com', role: 'admin', job_title: 'Sócio', phone: '(41) 99999-0001', active: true };
const ANA: Profile = { id: 'u-ana', name: 'Ana Ribeiro', email: 'a@x.com', role: 'member', job_title: 'Arquiteta', phone: '(41) 98888-0002', active: true };
const BRUNO: Profile = { id: 'u-bruno', name: 'Bruno Carvalho', email: 'b@x.com', role: 'member', job_title: 'Designer', phone: null, active: true };

function seed() {
  return new MemoryStore({
    profiles: [ADMIN, ANA, BRUNO] as unknown as Record<string, unknown>[],
    projects: [{ id: 'p1', code: 'AIR-2026-001', name: 'CASA J.D.', client_id: 'c1', status: 'nao_iniciado', manager_id: 'u-ana', member_ids: ['u-ana'], due_date: '2026-10-20' }],
    clients: [{ id: 'c1', name: 'João Dias', city: 'Curitiba', phone: '41 3333-0000' }],
    lead_stages: [
      { id: 's1', name: 'Novo lead', kind: 'open', position: 0 },
      { id: 's2', name: 'Fechado', kind: 'won', position: 1 },
    ],
    lead_sources: [{ id: 'src1', name: 'Tráfego pago (Meta Ads)' }, { id: 'src2', name: 'Indicação' }],
    project_types: [{ id: 't1', name: 'Arquitetura' }, { id: 't2', name: 'Interiores' }],
    tasks: [
      { id: 't-late', project_id: 'p1', phase: 'Levantamento', title: 'Levantamento métrico', assignee_id: 'u-ana', status: 'todo', priority: 'media', start_date: '2026-09-20', due_date: '2026-09-28', position: 0, created_by: 'u-admin', completed_at: null },
      { id: 't-ok', project_id: 'p1', phase: 'Estudo Preliminar', title: 'Programa de necessidades', assignee_id: 'u-ana', status: 'todo', priority: 'media', start_date: '2026-10-01', due_date: '2026-10-05', position: 1, created_by: 'u-admin', completed_at: null },
    ],
    leads: [{ id: 'l1', name: 'Rodrigo Tavares', phone: '41 97777-0000', city: 'Curitiba', stage_id: 's1', owner_id: 'u-admin', position: 0, next_contact_date: '2026-10-01' }],
    events: [],
    notifications: [],
    activity_log: [],
    time_entries: [],
    task_comments: [],
    lead_interactions: [],
  });
}

function ctxFor(store: MemoryStore, me: Profile, pings: string[] = []): ToolContext {
  return {
    store, me, tz: TZ, now: NOW, appUrl: 'https://gestao.airos.com.br', calendar: null,
    pingWhatsApp: (to, text) => {
      pings.push(`${to.name}: ${text}`);
      return Promise.resolve();
    },
  };
}

Deno.test('telefones do WhatsApp batem com o cadastro (com e sem o 9º dígito)', () => {
  assert(samePhone('(41) 98888-0002', '5541988880002'));
  assert(samePhone('(41) 98888-0002', '554188880002'));
  assert(!samePhone('(41) 98888-0002', '5541988880003'));
  assertEquals(phoneKey('123'), null);
});

Deno.test('conversão de horários no fuso de Brasília', () => {
  assertEquals(zonedToIso('2026-10-02', '14:00', TZ), '2026-10-02T17:00:00.000Z');
  assertEquals(isoToZoned('2026-10-02T17:00:00.000Z', TZ), { date: '2026-10-02', time: '14:00' });
});

Deno.test('create_task designa para outra pessoa, notifica e avisa no WhatsApp', async () => {
  const store = seed();
  const pings: string[] = [];
  const r = await executeTool('create_task', { title: 'Revisar planta do 2º pavimento', assignee_id: 'u-ana', project_id: 'p1', due_date: '2026-10-03', priority: 'alta' }, ctxFor(store, ADMIN, pings));
  assert(r.ok, r.result);
  const task = store.tables.tasks.find((t) => t.title === 'Revisar planta do 2º pavimento')!;
  assertEquals(task.assignee_id, 'u-ana');
  assertEquals(task.created_by, 'u-admin');
  assertEquals(task.position, 2);
  assertEquals(store.tables.notifications.length, 1);
  assertEquals(store.tables.notifications[0].user_id, 'u-ana');
  assertEquals(pings.length, 1);
  assertMatch(pings[0], /Revisar planta/);
});

Deno.test('create_task sem responsável fica com quem pediu e não notifica ninguém', async () => {
  const store = seed();
  const r = await executeTool('create_task', { title: 'Ligar para o marceneiro' }, ctxFor(store, ANA));
  assert(r.ok);
  assertEquals(store.tables.tasks.at(-1)!.assignee_id, 'u-ana');
  assertEquals(store.tables.notifications.length, 0);
});

Deno.test('list_tasks filtra atrasadas de quem está falando', async () => {
  const store = seed();
  const r = await executeTool('list_tasks', { scope: 'overdue' }, ctxFor(store, ANA));
  const out = JSON.parse(r.result);
  assertEquals(out.total, 1);
  assertEquals(out.tarefas[0].id, 't-late');
  assertEquals(out.tarefas[0].prazo, '28/09/2026');
});

Deno.test('update_task conclui, comenta e inicia o projeto', async () => {
  const store = seed();
  const r = await executeTool('update_task', { task_id: 't-late', status: 'done', comment: 'Medidas conferidas na obra.' }, ctxFor(store, ANA));
  assert(r.ok, r.result);
  const t = store.tables.tasks.find((x) => x.id === 't-late')!;
  assertEquals(t.status, 'done');
  assert(t.completed_at);
  assertEquals(store.tables.task_comments.length, 1);
  assertEquals(store.tables.projects[0].status, 'em_andamento');
});

Deno.test('update_task troca responsável e avisa a nova pessoa', async () => {
  const store = seed();
  const pings: string[] = [];
  await executeTool('update_task', { task_id: 't-ok', assignee_id: 'u-bruno', due_date: '2026-10-08' }, ctxFor(store, ADMIN, pings));
  const t = store.tables.tasks.find((x) => x.id === 't-ok')!;
  assertEquals(t.assignee_id, 'u-bruno');
  assertEquals(t.due_date, '2026-10-08');
  assertEquals(store.tables.notifications[0].user_id, 'u-bruno');
  assertEquals(pings.length, 1);
});

Deno.test('pessoa inexistente gera erro claro, sem gravar nada', async () => {
  const store = seed();
  const r = await executeTool('create_task', { title: 'X', assignee_id: 'u-fantasma' }, ctxFor(store, ADMIN));
  assert(!r.ok);
  assertMatch(r.result, /Pessoa não encontrada/);
  assertEquals(store.tables.tasks.length, 2);
});

Deno.test('create_meeting agenda no fuso certo, inclui quem pediu e gera link do Google', async () => {
  const store = seed();
  const r = await executeTool('create_meeting', { title: 'Apresentação do estudo', date: '2026-10-02', start_time: '14:00', participant_ids: ['u-ana'], location: 'Google Meet', project_id: 'p1' }, ctxFor(store, ADMIN));
  assert(r.ok, r.result);
  const ev = store.tables.events[0];
  assertEquals(ev.starts_at, '2026-10-02T17:00:00.000Z');
  assertEquals(ev.ends_at, '2026-10-02T18:00:00.000Z');
  assertEquals(ev.participant_ids, ['u-admin', 'u-ana']);
  const out = JSON.parse(r.result);
  assertMatch(out.link_adicionar_google_agenda, /calendar\.google\.com.*20261002T170000Z/);
  assertEquals(store.tables.notifications.map((n) => n.user_id), ['u-ana']);
});

Deno.test('só quem criou (ou admin) cancela a reunião', async () => {
  const store = seed();
  await executeTool('create_meeting', { title: 'Obra', date: '2026-10-02', start_time: '09:00', participant_ids: ['u-ana'] }, ctxFor(store, ADMIN));
  const id = store.tables.events[0].id as string;
  const denied = await executeTool('update_meeting', { event_id: id, cancel: true }, ctxFor(store, ANA));
  assert(!denied.ok);
  assertEquals(store.tables.events.length, 1);
  const ok = await executeTool('update_meeting', { event_id: id, cancel: true }, ctxFor(store, ADMIN));
  assert(ok.ok);
  assertEquals(store.tables.events.length, 0);
});

Deno.test('update_meeting remarca mantendo a duração', async () => {
  const store = seed();
  await executeTool('create_meeting', { title: 'Cliente', date: '2026-10-02', start_time: '09:00', end_time: '10:30' }, ctxFor(store, ADMIN));
  const id = store.tables.events[0].id as string;
  const r = await executeTool('update_meeting', { event_id: id, date: '2026-10-05', start_time: '15:00' }, ctxFor(store, ADMIN));
  assert(r.ok, r.result);
  assertEquals(store.tables.events[0].starts_at, '2026-10-05T18:00:00.000Z');
  assertEquals(store.tables.events[0].ends_at, '2026-10-05T19:30:00.000Z');
});

Deno.test('list_agenda junta reuniões, prazos e retornos do período', async () => {
  const store = seed();
  await executeTool('create_meeting', { title: 'Reunião semanal', date: '2026-10-01', start_time: '09:00' }, ctxFor(store, ADMIN));
  const r = await executeTool('list_agenda', { start_date: '2026-10-01', end_date: '2026-10-05', person_id: 'all' }, ctxFor(store, ADMIN));
  const out = JSON.parse(r.result);
  assertEquals(out.reunioes.length, 1);
  assertEquals(out.reunioes[0].horario, '09:00–10:00');
  assertEquals(out.prazos_de_tarefas.length, 1);
  assertEquals(out.retornos_de_clientes.length, 1);
});

Deno.test('log_time lança horas e coloca a tarefa em andamento', async () => {
  const store = seed();
  const r = await executeTool('log_time', { task_id: 't-ok', minutes: 90, note: 'Reunião com cliente' }, ctxFor(store, ANA));
  assert(r.ok, r.result);
  assertEquals(store.tables.time_entries[0].minutes, 90);
  assertEquals(store.tables.time_entries[0].user_id, 'u-ana');
  assertEquals(store.tables.tasks.find((t) => t.id === 't-ok')!.status, 'doing');
});

Deno.test('create_lead entra na primeira etapa e reconhece tipo e origem', async () => {
  const store = seed();
  const r = await executeTool('create_lead', { name: 'Paula Souza', phone: '41 91234-5678', city: 'Pinhais', project_type: 'interiores', source: 'tráfego pago' }, ctxFor(store, ANA));
  assert(r.ok, r.result);
  const lead = store.tables.leads.at(-1)!;
  assertEquals(lead.stage_id, 's1');
  assertEquals(lead.project_type_id, 't2');
  assertEquals(lead.source_id, 'src1');
  assertEquals(lead.owner_id, 'u-ana');
});

Deno.test('acessos por módulo: sem Comercial e sem Projetos, só as próprias tarefas', async () => {
  const store = seed();
  const bruno: Profile = { ...BRUNO, permissions: ['relatorios'] };
  const names = toolsFor(bruno).map((t) => t.name);
  assert(!names.includes('create_lead') && !names.includes('add_lead_note'));
  assert(toolsFor(ADMIN).some((t) => t.name === 'create_lead'));

  const lead = await executeTool('create_lead', { name: 'X', phone: '41 90000-0000', city: 'Curitiba' }, ctxFor(store, bruno));
  assertEquals(lead.ok, false);
  assertEquals(store.tables.leads.length, 1);

  const all = JSON.parse((await executeTool('list_tasks', { assignee_id: 'all' }, ctxFor(store, bruno))).result);
  assertEquals(all.total, 0);
  const upd = await executeTool('update_task', { task_id: 't-late', status: 'done' }, ctxFor(store, bruno));
  assertEquals(upd.ok, false);
  assertEquals(store.tables.tasks.find((t) => t.id === 't-late')?.status, 'todo');

  const found = JSON.parse((await executeTool('search', { query: 'Rodrigo' }, ctxFor(store, bruno))).result);
  assertEquals(found.oportunidades.length, 0);
  const foundAdmin = JSON.parse((await executeTool('search', { query: 'Rodrigo' }, ctxFor(store, ADMIN))).result);
  assertEquals(foundAdmin.oportunidades.length, 1);
});

Deno.test('runAgent executa as ferramentas pedidas pelo modelo e devolve a resposta final', async () => {
  const store = seed();
  const calls: Array<Record<string, unknown>> = [];
  const scripted = [
    {
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tu1', name: 'create_task', input: { title: 'Enviar orçamento', assignee_id: 'u-bruno', due_date: '2026-10-02' } }],
    },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Pronto! Tarefa *Enviar orçamento* criada para o Bruno, prazo 02/10.' }] },
  ];
  const fake = {
    beta: {
      messages: {
        create: (params: Record<string, unknown>) => {
          calls.push(structuredClone(params));
          return Promise.resolve(scripted[calls.length - 1]);
        },
      },
    },
  };
  const result = await runAgent({
    anthropic: fake as never,
    ctx: ctxFor(store, ADMIN),
    officeName: 'AIROS Arquitetura',
    history: [{ role: 'assistant', content: 'mensagem órfã' }, { role: 'user', content: 'oi' }, { role: 'assistant', content: 'Olá!' }],
    text: 'passa pro Bruno enviar o orçamento até sexta',
  });
  assertEquals(result.reply, 'Pronto! Tarefa *Enviar orçamento* criada para o Bruno, prazo 02/10.');
  assertEquals(result.actions, [{ tool: 'create_task', ok: true }]);
  assertEquals(store.tables.tasks.at(-1)!.assignee_id, 'u-bruno');
  // Parâmetros do pedido: modelo, fallback, esforço e histórico válido (começa com "user")
  const first = calls[0];
  assertEquals(first.model, 'claude-opus-5-5');
  assertEquals(first.fallbacks, 'default');
  assertEquals((first.messages as Array<{ role: string }>).map((m) => m.role), ['user', 'assistant', 'user']);
  const lastUser = (first.messages as Array<{ content: string }>)[2].content;
  assertMatch(lastUser, /<contexto>[\s\S]*u-bruno · Bruno Carvalho[\s\S]*<\/contexto>/);
  assertMatch(lastUser, /quarta-feira, 30\/09\/2026/);
  // Segunda chamada leva o resultado da ferramenta de volta
  const second = calls[1].messages as Array<{ role: string; content: unknown }>;
  const toolResult = (second.at(-1)!.content as Array<{ type: string; is_error: boolean }>)[0];
  assertEquals(toolResult.type, 'tool_result');
  assertEquals(toolResult.is_error, false);
});

Deno.test('runAgent responde com educação quando o modelo recusa', async () => {
  const fake = { beta: { messages: { create: () => Promise.resolve({ stop_reason: 'refusal', content: [] }) } } };
  const result = await runAgent({ anthropic: fake as never, ctx: ctxFor(seed(), ADMIN), officeName: 'AIROS', history: [], text: '...' });
  assertMatch(result.reply, /não consigo ajudar/);
});
