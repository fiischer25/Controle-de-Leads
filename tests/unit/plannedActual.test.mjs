// Previsto × realizado (src/lib/plannedActual.ts): horas e custo por etapa contra a precificação,
// projeção ao fim no ritmo atual, lucro projetado e histórico de dias por m² de cada etapa.
// Rodar: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'airos-pa-'));
const out = join(dir, 'pa.mjs');
await build({ entryPoints: [new URL('../../src/lib/plannedActual.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { plannedVsActual, pricingForProject, stageHistory, phaseKey } = await import(out);
rmSync(dir, { recursive: true, force: true });

const pricing = {
  id: 'pr', name: 'CASA', client_name: null, lead_id: 'L', project_type_id: 'X', area_m2: 150, total: 0,
  created_by: null, created_at: '2026-01-01', updated_at: '2026-01-01',
  data: {
    stages: [
      { id: 's1', label: 'EP - Estudo Preliminar', days: 5, rate: 100 },
      { id: 's2', label: 'Anteprojeto', days: 10, rate: 100 },
    ],
    fixed: [{ id: 'f', label: 'Aluguel', value: 4200 }],
    work_days: 21, hours_per_day: 8,
    indirect: [{ id: 'i', label: 'Impostos', kind: 'percent', value: 10 }],
    extras: [], margin: 20, ref_m2: null, final_price: null, notes: '',
  },
};
let n = 0;
const task = (phase, status) => ({ id: `t${++n}`, project_id: 'P', phase, status });
const tasks = [
  task('Estudo preliminar', 'done'), task('Estudo preliminar', 'done'),
  task('Anteprojeto', 'done'), task('Anteprojeto', 'todo'),
  task('Visita técnica', 'todo'),
];
const te = (t, user, minutes) => ({ id: `e${++n}`, task_id: t.id, user_id: user, started_at: '2026-09-01T12:00:00Z', ended_at: '2026-09-01T13:00:00Z', minutes });

test('nome da etapa sem código, acento nem maiúscula', () => {
  assert.equal(phaseKey('EP - Estudo Preliminar'), 'estudo preliminar');
  assert.equal(phaseKey('Pré-projeto'), 'pre-projeto');
  assert.equal(phaseKey('PEI: Executivo'), 'executivo');
});

test('horas e custo por etapa, projeção e lucro projetado', () => {
  const r = plannedVsActual({
    pricing,
    project: { id: 'P' },
    tasks,
    timeEntries: [te(tasks[0], 'a', 3000), te(tasks[2], 'a', 1800), te(tasks[4], 'b', 240)],
    costs: [{ id: 'c', user_id: 'a', hourly_cost: 100, updated_at: '' }],
    entries: [
      { id: 'r', kind: 'receita', amount: 20000, project_id: 'P' },
      { id: 'd', kind: 'despesa', amount: 500, project_id: 'P' },
    ],
  });
  const row = (label) => r.stages.find((s) => s.label === label);
  // Estudo: previsto 5 dias = 40 h; lançadas 50 h e concluída → 25% acima: atenção
  assert.deepEqual(
    [row('EP - Estudo Preliminar').plannedHours, row('EP - Estudo Preliminar').actualHours, row('EP - Estudo Preliminar').state],
    [40, 50, 'atencao'],
  );
  // 50 × R$ 100 + 50 h ÷ 8 × R$ 200 do escritório
  assert.equal(row('EP - Estudo Preliminar').actualCost, 6250);
  // Anteprojeto: 30 h com metade das tarefas feitas → 60 h no fim, de 80 previstas
  assert.deepEqual([row('Anteprojeto').projectedHours, row('Anteprojeto').state], [60, 'no_ritmo']);
  // Etapa sem previsão, com horas de quem não tem custo/hora
  assert.deepEqual([row('Visita técnica').state, row('Visita técnica').actualHours], ['sem_previsao', 4]);
  assert.deepEqual(r.missingCost, ['b']);
  assert.deepEqual([r.plannedHours, r.actualHours, r.projectedHours], [120, 84, 114]);
  assert.deepEqual([r.plannedCost, r.actualCost, r.projectedCost], [15000, 10100, 13850]);
  assert.equal(r.progress, 0.6);
  // Lucro previsto 4.285,71; projetado: 20.000 − 10% − 500 de despesas − 13.850
  assert.equal(r.plannedProfit, 4285.71);
  assert.equal(r.projectedProfit, 3650);
});

test('precificação do projeto: a vinculada ou a da oportunidade', () => {
  const a = { ...pricing, id: 'a', updated_at: '2026-02-01', data: { ...pricing.data } };
  const b = { ...pricing, id: 'b', updated_at: '2026-03-01', data: { ...pricing.data, project_id: 'OUTRO' } };
  const c = { ...pricing, id: 'c', lead_id: null, updated_at: '2026-01-01', data: { ...pricing.data, project_id: 'P' } };
  assert.equal(pricingForProject([a, b], { id: 'P', lead_id: 'L' }).id, 'a');
  assert.equal(pricingForProject([a, b, c], { id: 'P', lead_id: 'L' }).id, 'c');
  assert.equal(pricingForProject([a], { id: 'P', lead_id: null }), null);
});

test('histórico: dias por m² das etapas concluídas em projetos do mesmo tipo', () => {
  const t1 = { id: 'h1', project_id: 'p1', phase: 'Estudo', status: 'done' };
  const t2 = { id: 'h2', project_id: 'p2', phase: 'ESTUDO', status: 'done' };
  const t3 = { id: 'h3', project_id: 'p2', phase: 'Executivo', status: 'todo' };
  const t4 = { id: 'h4', project_id: 'p3', phase: 'Estudo', status: 'done' };
  const h = stageHistory({
    projects: [
      { id: 'p1', project_type_id: 'X', area_m2: 100 },
      { id: 'p2', project_type_id: 'X', area_m2: 200 },
      { id: 'p3', project_type_id: 'Y', area_m2: 100 },
    ],
    tasks: [t1, t2, t3, t4],
    timeEntries: [te(t1, 'a', 40 * 60), te(t2, 'a', 120 * 60), te(t3, 'a', 600), te(t4, 'a', 6000)],
    typeId: 'X',
    hoursPerDay: 8,
  });
  // 40 h ÷ 8 ÷ 100 = 0,05 e 120 h ÷ 8 ÷ 200 = 0,075 → média 0,0625; Executivo não concluído fica fora
  assert.deepEqual([...h.keys()], ['estudo']);
  assert.equal(h.get('estudo').daysPerM2, 0.0625);
  assert.equal(h.get('estudo').projects, 2);
});
