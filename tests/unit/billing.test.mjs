// Lembretes de cobrança (src/lib/billing.ts): régua antes / no dia / depois do vencimento, só em
// dias úteis, sem repetir, e a mensagem do modelo aprovado.
// Rodar: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'airos-billing-'));
const out = join(dir, 'billing.mjs');
await build({ entryPoints: [new URL('../../src/lib/billing.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const B = await import(out);
rmSync(dir, { recursive: true, force: true });

const S = { enabled: true, daysBefore: 3, onDue: true, daysAfter: 3, paymentInfo: '' };
const e = (o) => ({ id: 'e1', kind: 'receita', amount: 5000, due_date: '2026-10-15', paid_at: null, description: 'Honorários CASA J.D. · 2ª parcela', client_id: 'c', ...o });
const kinds = (list) => list.map((x) => x.kind);

test('régua: 3 dias antes, no dia e 3 dias depois (quinta, 15/10)', () => {
  // 12/10 (segunda) = 3 dias antes
  assert.deepEqual(kinds(B.dueReminders([e()], S, '2026-10-12', new Set())), ['antes']);
  assert.deepEqual(kinds(B.dueReminders([e()], S, '2026-10-13', new Set())), ['antes'], 'recupera no dia seguinte');
  assert.deepEqual(kinds(B.dueReminders([e()], S, '2026-10-15', new Set())), ['no_dia']);
  // 18/10 é domingo: o "depois" sai na segunda, 19/10
  assert.deepEqual(kinds(B.dueReminders([e()], S, '2026-10-18', new Set())), []);
  assert.deepEqual(kinds(B.dueReminders([e()], S, '2026-10-19', new Set())), ['depois']);
  assert.deepEqual(kinds(B.dueReminders([e()], S, '2026-10-22', new Set())), [], 'fora da janela de 2 dias');
});

test('não repete, não cobra o que foi pago e respeita o desligado', () => {
  const sent = new Set([B.reminderKey('e1', 'antes', '2026-10-15')]);
  assert.deepEqual(kinds(B.dueReminders([e()], S, '2026-10-12', sent)), []);
  // Vencimento remarcado: novo lembrete
  assert.deepEqual(kinds(B.dueReminders([e({ due_date: '2026-10-15' })], S, '2026-10-12', new Set([B.reminderKey('e1', 'antes', '2026-10-01')]))), ['antes']);
  assert.deepEqual(B.dueReminders([e({ paid_at: '2026-10-10' })], S, '2026-10-12', new Set()), []);
  assert.deepEqual(B.dueReminders([e({ kind: 'despesa' })], S, '2026-10-12', new Set()), []);
  assert.deepEqual(B.dueReminders([e()], { ...S, enabled: false }, '2026-10-12', new Set()), []);
  // Vencimento no sábado: sem "no dia"; o "antes" (quarta) e o "depois" (terça) saem
  const sat = e({ due_date: '2026-10-17' });
  assert.deepEqual(kinds(B.dueReminders([sat], S, '2026-10-14', new Set())), ['antes']);
  assert.deepEqual(kinds(B.dueReminders([sat], S, '2026-10-17', new Set())), []);
  assert.deepEqual(kinds(B.dueReminders([sat], S, '2026-10-20', new Set())), ['depois']);
});

test('próximos lembretes na data em que saem', () => {
  const list = B.upcomingReminders([e(), e({ id: 'e2', due_date: '2026-10-17' })], S, '2026-10-12', 14, new Set());
  assert.deepEqual(
    list.map((x) => [x.entry.id, x.kind, x.date]),
    [
      ['e1', 'antes', '2026-10-12'],
      ['e2', 'antes', '2026-10-14'],
      ['e1', 'no_dia', '2026-10-15'],
      ['e1', 'depois', '2026-10-19'],
      ['e2', 'depois', '2026-10-20'],
    ],
  );
});

test('mensagem do modelo e link do WhatsApp', () => {
  const msg = B.billingMessage({ clientName: 'Juliana Dias', amount: 5000, description: 'Honorários CASA J.D. · 2ª parcela', due: '2026-10-15', today: '2026-10-12', paymentInfo: 'PIX: 12.345.678/0001-90', officeName: 'Airos Arquitetura' });
  assert.match(msg, /^Olá, Juliana! Passando para lembrar da parcela de R\$\s5\.000,00 referente a Honorários CASA J\.D\. · 2ª parcela, que vence em 15\/10\. PIX: 12\.345\.678\/0001-90/);
  assert.match(msg, /Equipe Airos Arquitetura\.$/);
  assert.equal(B.duePhrase('2026-10-13', '2026-10-12'), 'vence amanhã (13/10)');
  assert.equal(B.duePhrase('2026-10-05', '2026-10-12'), 'venceu em 05/10');
  assert.match(B.templateParams({ clientName: '', amount: 1, description: '', due: '2026-10-12', today: '2026-10-12', paymentInfo: '', officeName: '' })[4], /desconsidere/);
  assert.equal(B.whatsappLink('(41) 99999-0001', 'oi'), 'https://wa.me/5541999990001?text=oi');
  assert.equal(B.whatsappLink('123', 'oi'), null);
});
