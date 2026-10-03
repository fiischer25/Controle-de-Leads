// Testes do resumo diário: `AIROS_NO_SERVE=1 deno test --allow-env supabase/functions/whatsapp-alerts`
import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1';
import { buildDigest, localClock, shouldSendNow, toWhatsAppNumber, type AlertData, type AlertProfile } from './index.ts';

const TZ = 'America/Sao_Paulo';
const DAY = '2026-09-30'; // quarta-feira

const ADMIN: AlertProfile = { id: 'u-admin', name: 'Matheus Fischer', role: 'admin', phone: '(41) 99999-0001', active: true };
const ANA: AlertProfile = { id: 'u-ana', name: 'Ana Ribeiro', role: 'member', phone: '(41) 98888-0002', active: true };

function data(): AlertData {
  return {
    projects: [
      { id: 'p1', name: 'CASA J.D.', status: 'em_andamento', manager_id: 'u-ana', member_ids: ['u-ana'], due_date: '2026-10-05' },
      { id: 'p2', name: 'APTO B.F.', status: 'em_andamento', manager_id: 'u-admin', member_ids: [], due_date: '2026-09-28' },
      { id: 'p3', name: 'CASA L.M.', status: 'em_andamento', manager_id: 'u-ana', member_ids: [], due_date: '2027-02-01' },
      { id: 'p4', name: 'Cancelado', status: 'cancelado', manager_id: 'u-ana', member_ids: [], due_date: '2026-09-01' },
    ],
    tasks: [
      { id: 't1', title: 'Levantamento métrico', project_id: 'p1', assignee_id: 'u-ana', status: 'todo', due_date: '2026-09-28' },
      { id: 't2', title: 'Programa de necessidades', project_id: 'p1', assignee_id: 'u-ana', status: 'doing', due_date: DAY },
      { id: 't3', title: 'Revisar marcenaria', project_id: null, assignee_id: 'u-ana', status: 'todo', due_date: '2026-10-01' },
      { id: 't4', title: 'Já concluída', project_id: 'p1', assignee_id: 'u-ana', status: 'done', due_date: '2026-09-20' },
      { id: 't5', title: 'De projeto cancelado', project_id: 'p4', assignee_id: 'u-ana', status: 'todo', due_date: '2026-09-20' },
      { id: 't6', title: 'Tarefa do Bruno', project_id: 'p2', assignee_id: 'u-bruno', status: 'todo', due_date: '2026-09-29' },
    ],
    leads: [
      { id: 'l1', name: 'Rodrigo Tavares', phone: '41 97777-0000', owner_id: 'u-ana', stage_id: 's1', next_contact_date: DAY },
      { id: 'l2', name: 'Patrícia Lemos', phone: null, owner_id: 'u-ana', stage_id: 's1', next_contact_date: '2026-09-27' },
      { id: 'l3', name: 'Fechado', phone: null, owner_id: 'u-ana', stage_id: 's2', next_contact_date: DAY },
    ],
    stages: [{ id: 's1', kind: 'open' }, { id: 's2', kind: 'won' }],
  };
}

Deno.test('resumo da pessoa: atrasadas, hoje, amanhã, prazos e retornos', () => {
  const d = buildDigest({ me: ANA, data: data(), settings: { due_soon_days: 7 }, day: DAY, hour: 8, appUrl: 'https://app.test/' });
  assertEquals(d.empty, false);
  assertMatch(d.text, /^Bom dia, Ana! Seu resumo de quarta-feira, 30\/09:/);
  assertMatch(d.text, /\*Tarefas atrasadas \(1\)\*\n• Levantamento métrico · CASA J\.D\. · venceu 28\/09/);
  assertMatch(d.text, /\*Vencem hoje \(1\)\*\n• Programa de necessidades · CASA J\.D\./);
  assertMatch(d.text, /\*Vencem amanhã \(1\)\*\n• Revisar marcenaria · avulsa/);
  assertMatch(d.text, /CASA J\.D\. · entrega em 5 dias \(05\/10\)/);
  assert(!d.text.includes('CASA L.M.'), 'prazo distante não entra');
  assert(!d.text.includes('Já concluída') && !d.text.includes('cancelado'));
  assertMatch(d.text, /\*Retornos de leads \(2\)\*\n• Patrícia Lemos · pendente desde 27\/09\n• Rodrigo Tavares · 41 97777-0000/);
  assert(!d.text.includes('*Escritório*'), 'membro não recebe números do escritório');
  assertMatch(d.text, /Abrir o sistema: https:\/\/app\.test\n/);
  assertEquals(
    d.summary,
    '1 tarefa atrasada, 1 tarefa vence hoje, 1 vence amanhã, 1 projeto com prazo próximo e 2 retornos de leads',
  );
  assert(!d.summary.includes('\n'));
});

Deno.test('respeita módulos e o que foi desligado nas configurações', () => {
  const semComercial = { ...ANA, permissions: ['projetos' as const] };
  const d = buildDigest({ me: semComercial, data: data(), settings: { wa_alerts_projects: false }, day: DAY, hour: 14 });
  assertMatch(d.text, /^Boa tarde, Ana!/);
  assert(!d.text.includes('Retornos'), 'sem módulo comercial, sem leads');
  assert(!d.text.includes('Prazos dos seus projetos'));
  assertMatch(d.text, /Tarefas atrasadas/);
});

Deno.test('administrador recebe os números do escritório', () => {
  const d = buildDigest({ me: ADMIN, data: data(), settings: {}, day: DAY, hour: 8 });
  assertMatch(d.text, /APTO B\.F\. · prazo vencido em 28\/09/);
  assertMatch(d.text, /\*Escritório\*\n2 tarefas atrasadas na equipe · 1 projeto com prazo vencido · 2 retornos de leads pendentes/);
});

Deno.test('sem novidades: não envia', () => {
  const d = buildDigest({ me: { ...ANA, id: 'u-ninguem' }, data: data(), settings: {}, day: DAY, hour: 8 });
  assertEquals(d.empty, true);
});

Deno.test('horário de envio, fim de semana e desligado', () => {
  const at = (iso: string) => new Date(iso);
  const on = { wa_alerts_enabled: true, wa_alerts_hour: 8 };
  assertEquals(shouldSendNow({ ...on, wa_alerts_enabled: false }, at('2026-09-30T11:00:00Z'), TZ).send, false);
  assertEquals(shouldSendNow(on, at('2026-09-30T10:00:00Z'), TZ).send, false); // 07h em Brasília
  assertEquals(shouldSendNow(on, at('2026-09-30T11:05:00Z'), TZ).send, true); // 08h
  assertEquals(shouldSendNow(on, at('2026-09-30T14:00:00Z'), TZ).send, true); // 11h (tolerância)
  assertEquals(shouldSendNow(on, at('2026-09-30T15:00:00Z'), TZ).send, false); // 12h
  assertEquals(shouldSendNow(on, at('2026-10-03T11:00:00Z'), TZ).send, false); // sábado
  assertEquals(shouldSendNow({ ...on, wa_alerts_weekends: true }, at('2026-10-03T11:00:00Z'), TZ).send, true);
  assertEquals(localClock(at('2026-10-01T02:30:00Z'), TZ), { day: '2026-09-30', hour: 23 });
});

Deno.test('telefone no formato do WhatsApp', () => {
  assertEquals(toWhatsAppNumber('(41) 98888-0002'), '5541988880002');
  assertEquals(toWhatsAppNumber('+55 41 98888-0002'), '5541988880002');
  assertEquals(toWhatsAppNumber('123'), null);
});
