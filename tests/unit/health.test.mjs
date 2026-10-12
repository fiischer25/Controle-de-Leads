// Saúde do escritório (src/lib/health.ts): situação de cada indicador (bom / atenção / crítico),
// nota por área e geral, e o que melhorar primeiro.
// Rodar: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'airos-health-'));
const out = join(dir, 'health.mjs');
await build({ entryPoints: [new URL('../../src/lib/health.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { officeHealth } = await import(out);
rmSync(dir, { recursive: true, force: true });

const T = '2026-10-12';
const base = {
  today: T, finance: false, commercial: false, accounts: [], categories: [], entries: [], memberCosts: [], clients: [],
  leads: [], stages: [], projects: [], tasks: [], timeEntries: [], profiles: [],
};
let n = 0;
const entry = (o) => ({ id: `e${++n}`, kind: 'receita', description: '', amount: 0, due_date: T, paid_at: null, account_id: 'b', to_account_id: null, category_id: null, client_id: null, project_id: null, series_id: null, installment: null, installments: null, document: null, notes: null, created_by: null, created_at: T, updated_at: T, ...o });
const byId = (h) => Object.fromEntries(h.areas.flatMap((a) => a.indicators).map((i) => [i.id, i.status]));

test('financeiro: sobra, fôlego, atrasados, receita à frente e dependência de cliente', () => {
  const entries = [
    ...['2026-07-10', '2026-08-10', '2026-09-10'].map((d, i) => entry({ amount: 20000, due_date: d, paid_at: d, client_id: i < 2 ? 'c1' : 'c2' })),
    ...['2026-07-05', '2026-08-05', '2026-09-05'].map((d) => entry({ kind: 'despesa', amount: 15000, due_date: d, paid_at: d })),
    // Distribuição de lucros: sai do caixa, mas não é custo da operação
    entry({ kind: 'despesa', amount: 10000, due_date: '2026-09-30', paid_at: '2026-09-30', category_id: 'd' }),
    entry({ amount: 3000, due_date: '2026-10-01' }),
    entry({ amount: 25000, due_date: '2026-11-10' }),
  ];
  const h = officeHealth({
    ...base,
    finance: true,
    accounts: [{ id: 'b', name: 'Banco', kind: 'banco', opening_balance: 10000, color: '', active: true, position: 0, created_at: T }],
    categories: [{ id: 'd', name: 'Distribuição de lucros', kind: 'despesa', color: '', active: true, position: 0, created_at: T }],
    clients: [{ id: 'c1', name: 'Cliente Um' }, { id: 'c2', name: 'Cliente Dois' }],
    entries,
  });
  // 25% de sobra · 15.000 ÷ 15.000 = 1 mês · 3.000 = 15% de um mês · 25.000 ÷ 45.000 · 66% de um cliente
  assert.deepEqual(byId(h), { margem: 'bom', folego: 'atencao', atrasados: 'atencao', previsao: 'atencao', concentracao: 'critico' });
  const fin = h.areas.find((a) => a.id === 'financeiro');
  assert.equal(fin.score, 60);
  assert.equal(h.score, 60);
  assert.equal(h.status, 'atencao');
  assert.equal(h.priorities[0].id, 'concentracao');
  assert.deepEqual(h.strengths.map((i) => i.id), ['margem']);
  assert.deepEqual(h.areas.map((a) => a.id), ['financeiro', 'producao', 'equipe']);
});

test('comercial, prazos e equipe', () => {
  const stages = [{ id: 'o', kind: 'open' }, { id: 'w', kind: 'won' }, { id: 'l', kind: 'lost' }];
  const lead = (o) => ({ id: `l${++n}`, stage_id: 'o', created_at: '2026-01-01T12:00:00Z', closed_at: null, next_contact_date: null, ...o });
  const leads = [
    lead({ stage_id: 'w', closed_at: '2026-09-01T12:00:00Z' }),
    ...[1, 2, 3].map(() => lead({ stage_id: 'l', closed_at: '2026-08-01T12:00:00Z' })),
    lead({ created_at: '2026-10-01T12:00:00Z', next_contact_date: '2026-10-20' }),
    lead({ created_at: '2026-08-20T12:00:00Z' }),
    ...Array.from({ length: 9 }, () => lead({ stage_id: 'l', created_at: '2026-07-01T12:00:00Z', closed_at: '2026-01-01T12:00:00Z' })),
  ];
  const project = (o) => ({ id: `p${++n}`, name: o.name, status: 'em_andamento', due_date: null, completed_at: null, start_date: '2026-01-01', ...o });
  const projects = [
    project({ name: 'CASA A', due_date: '2026-09-01' }),
    project({ name: 'CASA B', due_date: '2026-12-01' }),
    project({ name: 'CASA C', status: 'concluido', due_date: '2026-06-01', completed_at: '2026-06-10T12:00:00Z' }),
    project({ name: 'CASA D', status: 'concluido', due_date: '2026-05-10', completed_at: '2026-05-01T12:00:00Z' }),
  ];
  const task = (o) => ({ id: `t${++n}`, status: 'todo', assignee_id: 'a', due_date: '2026-11-01', project_id: null, ...o });
  const tasks = [task({ due_date: '2026-10-01' }), task({}), task({}), task({ assignee_id: 'b' })];
  const profiles = [{ id: 'a', name: 'Ana Ribeiro', active: true }, { id: 'b', name: 'Bruno Lima', active: true }];
  const timeEntries = [{ id: 'x', task_id: tasks[0].id, user_id: 'a', started_at: '2026-10-05T12:00:00Z', ended_at: '2026-10-05T13:00:00Z', minutes: 2400 }];
  const h = officeHealth({ ...base, commercial: true, stages, leads, projects, tasks, profiles, timeEntries });
  assert.deepEqual(byId(h), {
    conversao: 'atencao', // 1 ganho de 4 = 25%
    entrada: 'atencao', // 1 em 30 dias × média de 2 por mês
    retornos: 'critico', // 1 de 2 sem retorno
    projetos_atrasados: 'critico', // 1 de 2
    tarefas_atrasadas: 'atencao', // 25%
    entregas_prazo: 'critico', // 50%
    horas: 'critico', // 40 h de 320 h
    carga: 'bom',
  });
  assert.equal(h.areas.find((a) => a.id === 'comercial').score, 47);
  assert.equal(h.priorities[0].id, 'retornos');
});

test('com algum crítico, a situação não fica "bom" mesmo com nota alta', () => {
  const task = (o) => ({ id: `t${++n}`, status: 'todo', assignee_id: 'a', due_date: '2026-11-01', project_id: null, ...o });
  const profiles = [{ id: 'a', name: 'Ana Ribeiro', active: true }];
  const project = (o) => ({ id: `p${++n}`, name: 'CASA', status: 'em_andamento', due_date: '2026-12-01', completed_at: null, start_date: '2026-01-01', ...o });
  // Prazos: 3 bons; Equipe: carga boa e horas críticas (sem lançamentos)
  const h = officeHealth({
    ...base,
    profiles,
    tasks: [task({})],
    projects: [project({}), project({ status: 'concluido', due_date: '2026-09-01', completed_at: '2026-08-20T12:00:00Z' })],
  });
  assert.equal(h.areas.find((a) => a.id === 'producao').status, 'bom');
  const equipe = h.areas.find((a) => a.id === 'equipe');
  assert.deepEqual([equipe.score, equipe.status], [60, 'atencao']);
  // Nota 80 (100 e 60), mas com um crítico: atenção
  assert.deepEqual([h.score, h.status], [80, 'atencao']);
});

test('sem dados: nada a avaliar', () => {
  const h = officeHealth(base);
  assert.equal(h.score, null);
  assert.equal(h.status, 'sem_dados');
  assert.deepEqual(h.priorities, []);
});
