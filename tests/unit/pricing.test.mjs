// Precificação (src/lib/pricing.ts): dias × custo do dia, adicionais, indiretos em % e em R$,
// lucro sobre o preço, R$/m² e comparação com o m² de referência.
// Rodar: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'airos-pricing-'));
const out = join(dir, 'pricing.mjs');
await build({ entryPoints: [new URL('../../src/lib/pricing.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { pricingResult, newPricingData, fixedCostsFromFinance, roundPrice } = await import(out);
rmSync(dir, { recursive: true, force: true });

function casa(over = {}) {
  const data = newPricingData();
  data.fixed = [
    { id: 'a', label: 'Salários e pró-labore', value: 15000 },
    { id: 'b', label: 'Aluguel', value: 4000 },
    { id: 'c', label: 'Softwares', value: 2000 },
  ];
  data.work_days = 21;
  data.stages = [
    { id: '1', label: 'Estudo preliminar', days: 10 },
    { id: '2', label: 'Anteprojeto', days: 8 },
    { id: '3', label: 'Executivo', days: 12 },
  ];
  data.extras = [
    { id: 'v', label: 'Visitas', qty: 4, unit: 150 },
    { id: 't', label: 'Terceirização', qty: 1, unit: 5000 },
  ];
  data.indirect = [
    { id: 'i', label: 'Impostos', kind: 'percent', value: 6 },
    { id: 'r', label: 'Imprevistos', kind: 'percent', value: 5 },
  ];
  data.margin = 20;
  data.ref_m2 = 250;
  return { area_m2: 185, data: { ...data, ...over } };
}

test('preço pelos dias com custos fixos, adicionais, impostos e lucro', () => {
  const r = pricingResult(casa());
  assert.equal(r.days, 30);
  assert.equal(r.fixedMonthly, 21000);
  assert.equal(r.dayCost, 1000);
  assert.equal(r.daysCost, 30000);
  assert.equal(r.extras, 5600);
  assert.equal(r.cost, 35600);
  assert.equal(r.indirectPct, 11);
  // 35.600 ÷ (1 − 31%) = 51.594,20
  assert.equal(r.suggested, 51594.2);
  assert.equal(r.price, 51594.2);
  assert.equal(r.profitPct, 20);
  assert.equal(r.perM2, 278.89);
  assert.equal(r.perDay, 1719.81);
  assert.equal(r.refPrice, 46250);
  assert.equal(r.diff, 5344.2);
  assert.equal(r.diffPct, 11.6);
});

test('valor da proposta arredondado muda o lucro real', () => {
  const r = pricingResult(casa({ final_price: roundPrice(51594.2) }));
  assert.equal(r.price, 51600);
  // 51.600 − 35.600 − 11% de 51.600 (5.676) = 10.324
  assert.equal(r.profit, 10324);
  assert.equal(r.profitPct, 20);
});

test('custo indireto em R$ entra no custo', () => {
  const base = casa();
  base.data.indirect.push({ id: 'x', label: 'RRT', kind: 'valor', value: 400 });
  const r = pricingResult(base);
  assert.equal(r.indirectValue, 400);
  assert.equal(r.cost, 36000);
});

test('sem preço possível quando impostos + lucro chegam a 100%', () => {
  const r = pricingResult(casa({ margin: 89 }));
  assert.equal(r.suggested, null);
  assert.equal(r.perM2, null);
});

test('custos fixos pela média do Financeiro (sem impostos nem distribuição de lucros)', () => {
  const cat = { a: 'Aluguel e condomínio', s: 'Salários e pró-labore', i: 'Impostos', d: 'Distribuição de lucros' };
  const e = (category_id, amount, due_date) => ({ kind: 'despesa', amount, due_date, category_id });
  const rows = fixedCostsFromFinance(
    [e('a', 3000, '2026-07-05'), e('a', 3000, '2026-08-05'), e('a', 3000, '2026-09-05'), e('s', 12000, '2026-09-05'), e('i', 900, '2026-09-20'), e('d', 5000, '2026-09-30'), e('a', 3000, '2026-10-05')],
    (id) => cat[id] ?? 'Sem categoria',
    '2026-10-12',
  );
  assert.deepEqual(rows, [['Salários e pró-labore', 4000], ['Aluguel e condomínio', 3000]]);
});
