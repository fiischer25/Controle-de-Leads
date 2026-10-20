// Orçamentos e Obras (src/lib/obras.ts): total do orçamento com BDI e desconto distribuído pelas partes,
// banco de preços, etapas da obra a partir do orçamento, avanço físico, situação das etapas e dinheiro da obra.
// Rodar: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'airos-obras-'));
const out = join(dir, 'obras.mjs');
await build({ entryPoints: [new URL('../../src/lib/obras.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const o = await import(out);
rmSync(dir, { recursive: true, force: true });

const item = (qty, material, labor, description = 'x', unit = 'm²') => ({ id: Math.random().toString(36), description, unit, qty, material, labor });
const data = (over = {}) => ({
  ...o.newBudgetData(),
  sections: [
    { id: 'a', name: 'Pintura', days: 5, items: [item(100, 8, 12)] },
    { id: 'b', name: 'Elétrica', days: 3, items: [item(10, 50, 50)] },
  ],
  ...over,
});

test('total: custo + BDI − desconto, com material e mão de obra separados', () => {
  const t = o.budgetTotals(data({ bdi: 10, discount: 300 }), 50);
  assert.equal(t.material, 1300);
  assert.equal(t.labor, 1700);
  assert.equal(t.cost, 3000);
  assert.equal(t.bdiValue, 300);
  assert.equal(t.subtotal, 3300);
  assert.equal(t.total, 3000);
  assert.equal(t.perM2, 60);
  assert.equal(t.days, 8);
  assert.equal(t.items, 2);
});

test('desconto distribuído pelas partes soma exatamente o total (sem sobra de centavos)', () => {
  const d = data({ bdi: 13.7, discount: 123.45 });
  d.sections.push({ id: 'c', name: 'Gesso', days: 0, items: [item(33.3, 17.77, 9.91)] });
  const t = o.budgetTotals(d);
  const sum = Math.round(t.sections.reduce((a, s) => a + s.net, 0) * 100) / 100;
  assert.equal(sum, t.total);
  assert.ok(Math.abs(t.sections.reduce((a, s) => a + s.share, 0) - 1) < 1e-9);
});

test('desconto nunca passa do subtotal; orçamento vazio dá zero', () => {
  assert.equal(o.budgetTotals(data({ discount: 999999 })).total, 0);
  const empty = o.budgetTotals(o.newBudgetData());
  assert.equal(empty.total, 0);
  assert.equal(empty.perM2, null);
});

test('preço unitário de venda inclui o BDI', () => {
  assert.equal(o.salePrice(100, 12.5), 112.5);
  assert.equal(o.salePrice(100, 0), 100);
});

test('códigos sequenciais por ano', () => {
  assert.equal(o.nextCode('ORC', [], 2026), 'ORC-2026-001');
  assert.equal(o.nextCode('ORC', ['ORC-2026-001', 'ORC-2026-007', 'ORC-2025-030'], 2026), 'ORC-2026-008');
});

test('banco de preços: item mais recente vence, sem itens zerados', () => {
  const old = { id: '1', code: 'ORC-1', updated_at: '2026-01-01', data: { sections: [{ name: 'Pintura', items: [item(1, 5, 5, 'Massa corrida')] }] } };
  const neu = { id: '2', code: 'ORC-2', updated_at: '2026-02-01', data: { sections: [{ name: 'Pintura', items: [item(1, 7, 6, 'massa corrida '), item(1, 0, 0, 'Sem preço')] }] } };
  const s = o.itemSuggestions([old, neu]);
  assert.equal(s.length, 1);
  assert.equal(s[0].material, 7);
  assert.equal(s[0].from, 'ORC-2');
  assert.equal(o.itemSuggestions([old, neu], '2')[0].from, 'ORC-1');
});

test('etapas da obra a partir do orçamento: valores, itens e datas em dias úteis', () => {
  const b = { data: data({ bdi: 10, discount: 300 }), area_m2: 50 };
  // 2026-10-19 é segunda-feira
  const st = o.stagesFromBudget(b, 'obra', '2026-10-19', 'now');
  assert.deepEqual(st.map((s) => s.budget), [2000, 1000]);
  assert.deepEqual(st.map((s) => [s.start_date, s.due_date]), [['2026-10-19', '2026-10-23'], ['2026-10-26', '2026-10-28']]);
  assert.equal(st[0].items.length, 1);
  assert.ok(st.every((s) => s.obra_id === 'obra' && s.progress === 0));
  // Parte sem prazo fica sem datas
  const d = data();
  d.sections[0].days = null;
  const st2 = o.stagesFromBudget({ data: d, area_m2: null }, 'obra', '2026-10-17', 'now');
  assert.deepEqual([st2[0].start_date, st2[1].start_date], [null, '2026-10-19']);
});

test('avanço físico pesado pelo valor das etapas', () => {
  assert.equal(o.obraProgress([{ progress: 100, budget: 1000 }, { progress: 0, budget: 3000 }]), 25);
  assert.equal(o.obraProgress([{ progress: 100, budget: 0 }, { progress: 0, budget: 0 }]), 50);
  assert.equal(o.obraProgress([]), 0);
});

test('avanço previsto pelas datas e situação da etapa', () => {
  const s = { start_date: '2026-10-01', due_date: '2026-10-10', progress: 50, budget: 1 };
  assert.equal(o.expectedStageProgress(s, '2026-09-30'), 0);
  assert.equal(o.expectedStageProgress(s, '2026-10-05'), 50);
  assert.equal(o.expectedStageProgress(s, '2026-10-11'), 100);
  assert.equal(o.stageState(s, '2026-10-05'), 'em_andamento');
  assert.equal(o.stageState({ ...s, progress: 30 }, '2026-10-05'), 'atrasada');
  assert.equal(o.stageState(s, '2026-10-11'), 'atrasada');
  assert.equal(o.stageState({ ...s, progress: 100 }, '2026-10-11'), 'concluida');
  assert.equal(o.stageState({ ...s, progress: 0 }, '2026-09-20'), 'a_iniciar');
  assert.equal(o.stageState({ start_date: null, due_date: null, progress: 0 }, '2026-10-01'), 'sem_datas');
});

test('dinheiro da obra: aditivos aprovados, pago, a pagar, vencido, aguardando e por etapa', () => {
  const stages = [{ id: 'e1', budget: 2000 }, { id: 'e2', budget: 1000 }];
  const p = (amount, extra) => ({ amount, due_date: '2026-10-10', paid_at: null, approval: 'nao_requer', stage_id: 'e1', ...extra });
  const payments = [
    p(500, { paid_at: '2026-10-01' }),
    p(300, { due_date: '2026-10-01' }), // vencido
    p(200, { approval: 'pendente', due_date: '2026-10-30', stage_id: 'e2' }),
    p(999, { approval: 'recusado' }), // não conta
    p(50, { stage_id: null }),
  ];
  const approvals = [
    { kind: 'aditivo', status: 'aprovado', amount: 400 },
    { kind: 'aditivo', status: 'pendente', amount: 1000 },
  ];
  const m = o.obraMoney({ contract_value: 3000 }, stages, payments, approvals, '2026-10-05');
  assert.equal(m.additives, 400);
  assert.equal(m.contracted, 3400);
  assert.equal(m.paid, 500);
  assert.equal(m.open, 550);
  assert.equal(m.overdue, 300);
  assert.equal(m.awaiting, 200);
  assert.equal(m.awaitingCount, 1);
  assert.equal(m.balance, 3400 - 1050);
  assert.deepEqual(m.byStage.e1, { planned: 2000, paid: 500, open: 300 });
  assert.deepEqual(m.byStage.e2, { planned: 1000, paid: 0, open: 200 });
  assert.equal(m.byStage[''].open, 50);
});

test('situação do pagamento', () => {
  const t = '2026-10-05';
  assert.equal(o.paymentState({ paid_at: '2026-10-01', approval: 'pendente', due_date: t }, t), 'pago');
  assert.equal(o.paymentState({ paid_at: null, approval: 'recusado', due_date: t }, t), 'recusado');
  assert.equal(o.paymentState({ paid_at: null, approval: 'pendente', due_date: '2026-01-01' }, t), 'aguardando');
  assert.equal(o.paymentState({ paid_at: null, approval: 'aprovado', due_date: '2026-10-01' }, t), 'vencido');
  assert.equal(o.paymentState({ paid_at: null, approval: 'nao_requer', due_date: t }, t), 'a_pagar');
});

test('link e mensagem de aprovação', () => {
  const token = o.approvalToken();
  assert.match(token, /^[A-Za-z0-9]{32}$/);
  assert.notEqual(token, o.approvalToken());
  assert.equal(o.approvalUrl('abc', 'https://x.app'), 'https://x.app/aprovacao/abc');
  assert.equal(o.whatsappLink('(41) 99999-1234', 'oi'), 'https://wa.me/5541999991234?text=oi');
  assert.equal(o.whatsappLink(null, 'a b'), 'https://wa.me/?text=a%20b');
});

test('resumo do orçamento para o cliente: partes com BDI, itens e total', () => {
  const b = { code: 'ORC-1', name: 'X', address: 'Rua A', city: 'Curitiba', area_m2: 50, data: data({ bdi: 10, discount: 300, payment_terms: '50/50', exclusions: 'Móveis' }) };
  const snap = o.budgetSnapshot(b, true);
  assert.deepEqual(snap.lines.map((l) => [l.label, l.value]), [['Pintura', 2200], ['Elétrica', 1100]]);
  assert.equal(snap.lines[0].items[0].total, 2200);
  assert.equal(snap.total, 3000);
  assert.match(snap.notes, /Não incluso: Móveis/);
  assert.ok(snap.facts.some((f) => f.label === 'Pagamento' && f.value === '50/50'));
  assert.equal(o.budgetSnapshot(b, false).lines[0].items, undefined);
});
