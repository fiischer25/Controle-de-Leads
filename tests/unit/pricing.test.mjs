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
const { pricingResult, newPricingData, fixedCostsFromFinance, recurringFixedCosts, teamAverageRate, roundPrice, hourlyFromMonthly, monthlyFromHourly, scopeOf, hasInteriores, packageData, packagesResult, chosenPrice } = await import(out);
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
  // Salários vêm marcados: saem do custo do dia quando a equipe está nas etapas
  assert.deepEqual(rows, [['Salários e pró-labore', 4000, true], ['Aluguel e condomínio', 3000, false]]);
});

test('custo de quem faz cada etapa: dias × horas por dia × custo/hora', () => {
  const p = casa({
    fixed: [{ id: 'b', label: 'Aluguel', value: 4200 }],
    hours_per_day: 8,
    stages: [
      { id: '1', label: 'Estudo preliminar', days: 10, assignee_id: 'ana', rate: 85 },
      { id: '2', label: 'Executivo', days: 5, assignee_id: null, rate: 70 },
      { id: '3', label: 'Antiga', days: 2 },
    ],
  });
  const r = pricingResult(p);
  // Escritório: 4200 ÷ 21 = 200/dia × 17 dias = 3400; equipe: 10×8×85 + 5×8×70 + 0 = 9600
  assert.equal(r.daysCost, 3400);
  assert.deepEqual(r.stageLabor, [6800, 2800, 0]);
  assert.equal(r.labor, 9600);
  assert.equal(r.cost, 3400 + 9600 + 5600);
  // Sem horas por dia (precificação antiga): 8 horas
  assert.equal(pricingResult(casa({ hours_per_day: undefined, stages: [{ id: '1', label: 'x', days: 1, rate: 100 }] })).labor, 800);
});

test('custo/hora médio da equipe', () => {
  assert.equal(teamAverageRate([{ hourly_cost: 120 }, { hourly_cost: 85 }, { hourly_cost: 0 }, { hourly_cost: 70 }]), 91.67);
  assert.equal(teamAverageRate([]), null);
});

test('custos fixos do Financeiro: despesas que repetem todo mês', () => {
  const cat = { a: 'Aluguel e condomínio', s: 'Salários e pró-labore', i: 'Impostos', m: 'Marketing', e: 'Energia, internet e telefone', o: 'Outras despesas' };
  const e = (description, category_id, amount, due_date, extra = {}) => ({ kind: 'despesa', description, amount, due_date, category_id, ...extra });
  const entries = [
    // "Todo mês" (série): vale o valor do mês atual
    ...['2026-08-05', '2026-09-05', '2026-10-05', '2026-11-05'].map((d) => e('Aluguel da sala', 'a', 3800, d, { series_id: 'S1' })),
    ...['2026-09-05', '2026-10-05'].map((d) => e('Folha de pagamento', 's', 18500, d, { series_id: 'S2' })),
    ...['2026-09-20', '2026-10-20'].map((d) => e('Simples Nacional', 'i', 2400, d, { series_id: 'S3' })),
    // Lançada à mão em 2 dos 3 últimos meses: último valor
    e('Energia e internet', 'e', 450, '2026-08-12'),
    e('Energia e internet', 'e', 495, '2026-09-12'),
    // Uma vez só, ou de projeto: fora
    e('Impulsionamento', 'm', 600, '2026-09-18'),
    e('Plotagem CASA X', 'o', 300, '2026-09-02', { project_id: 'P' }),
    e('Plotagem CASA X', 'o', 300, '2026-08-02', { project_id: 'P' }),
  ];
  const name = (id) => cat[id] ?? 'Sem categoria';
  assert.deepEqual(recurringFixedCosts(entries, name, '2026-10-12'), [
    ['Folha de pagamento', 18500, true],
    ['Aluguel da sala', 3800, false],
    ['Energia e internet', 495, false],
  ]);
});

test('sem duplicidade: com a equipe nas etapas, salários saem do custo do dia', () => {
  const fixed = [
    { id: 'a', label: 'Folha de pagamento', value: 18500, labor: true },
    { id: 'b', label: 'Pró-labore Matheus', value: 6000 }, // precificação antiga: reconhecido pelo nome
    { id: 'c', label: 'Ana (arquiteta)', value: 5000, labor: true }, // marcado à mão
    { id: 'd', label: 'Aluguel', value: 4200, labor: false },
  ];
  const withTeam = pricingResult(casa({ fixed, stages: [{ id: '1', label: 'Estudo', days: 10, assignee_id: 'ana', rate: 85 }] }));
  // Só o aluguel no custo do dia: 4.200 ÷ 21 = 200; a Ana entra pelo custo dela: 10 × 8 h × 85
  assert.deepEqual([withTeam.usesTeam, withTeam.fixedExcluded, withTeam.fixedMonthly, withTeam.dayCost], [true, 29500, 4200, 200]);
  assert.equal(withTeam.labor, 6800);
  assert.equal(withTeam.cost, 10 * 200 + 6800 + 5600);
  // Sem custo da equipe nas etapas, os salários continuam no custo do dia
  const noTeam = pricingResult(casa({ fixed, stages: [{ id: '1', label: 'Estudo', days: 10 }] }));
  assert.deepEqual([noTeam.usesTeam, noTeam.fixedExcluded, noTeam.fixedMonthly], [false, 0, 33700]);
  // Linha marcada como "não é salário" fica, mesmo com nome parecido
  const unmarked = pricingResult(casa({ fixed: [{ id: 'x', label: 'Folha de pagamento', value: 1000, labor: false }], stages: [{ id: '1', label: 'E', days: 1, rate: 50 }] }));
  assert.equal(unmarked.fixedMonthly, 1000);
});

test('precificação nova: linha padrão de salários já vem marcada', () => {
  const d = newPricingData();
  assert.deepEqual(d.fixed.filter((f) => f.labor).map((f) => f.label), ['Salários e pró-labore']);
  const fromFinance = newPricingData({ fixed: [['Folha de pagamento', 18500, true], ['Aluguel', 3800, false]] });
  assert.deepEqual(fromFinance.fixed.map((f) => [f.label, f.labor]), [['Folha de pagamento', true], ['Aluguel', false]]);
});

test('custo da pessoa por mês: R$ 500 ÷ 21 dias = R$ 23,81 por dia', () => {
  const hourly = hourlyFromMonthly(500);
  assert.equal(Math.round(hourly * 8 * 100) / 100, 23.81);
  assert.equal(monthlyFromHourly(hourly), 500);
  // 1 dia do estagiário na etapa custa um dia do mês dele, não o mês inteiro
  const r = pricingResult(casa({ fixed: [], stages: [{ id: '1', label: 'Levantamento', days: 1, assignee_id: 'g', rate: hourly }] }));
  assert.equal(r.labor, 23.81);
});

test('pacotes: Basic é só arquitetura, Premium soma interiores', () => {
  assert.equal(scopeOf({ label: 'PI - Projeto de Interiores' }), 'interiores');
  assert.equal(scopeOf({ label: 'PEI - Projeto Executivo de Interiores' }), 'interiores');
  assert.equal(scopeOf({ label: 'VL - Visita em Lojas' }), 'interiores');
  assert.equal(scopeOf({ label: 'EP - Estudo Preliminar' }), 'arquitetura');
  assert.equal(scopeOf({ label: 'Pré-projeto', scope: 'interiores' }), 'interiores');
  const p = casa({
    fixed: [{ id: 'a', label: 'Aluguel', value: 2100, labor: false }],
    stages: [
      { id: '1', label: 'Estudo preliminar', days: 10 },
      { id: '2', label: 'PI - Projeto de Interiores', days: 5 },
    ],
    extras: [
      { id: 'v', label: 'Visitas', qty: 2, unit: 100 },
      { id: 'l', label: 'Visita em lojas (combustível)', qty: 1, unit: 300, scope: 'interiores' },
    ],
    indirect: [], margin: 20, final_price: null,
  });
  assert.equal(hasInteriores(p.data), true);
  // Escritório: 2.100 ÷ 21 = 100/dia. Basic: 10 dias + R$ 200 de visitas = 1.200 ÷ 0,8 = 1.500
  const { basic, premium, interiores } = packagesResult(p);
  assert.deepEqual([basic.days, basic.cost, basic.suggested], [10, 1200, 1500]);
  // Premium: 15 dias + R$ 500 de adicionais = 2.000 ÷ 0,8 = 2.500; interiores somam 1.000
  assert.deepEqual([premium.days, premium.cost, premium.suggested], [15, 2000, 2500]);
  assert.deepEqual([interiores.suggested, interiores.days], [1000, 5]);
  // Valor da proposta de cada pacote; o escolhido vai para a oportunidade
  const withFinal = { ...p, data: { ...p.data, final_price: 2600, final_price_basic: 1600 } };
  assert.equal(packageData(withFinal.data, 'basic').final_price, 1600);
  assert.equal(chosenPrice(withFinal), 2600);
  assert.equal(chosenPrice({ ...withFinal, data: { ...withFinal.data, package: 'basic' } }), 1600);
  // Sem interiores: um preço só (o Premium é o próprio projeto)
  assert.equal(hasInteriores(casa().data), false);
  assert.equal(chosenPrice({ ...casa(), data: { ...casa().data, package: 'basic' } }), pricingResult(casa()).price);
});
