// Painel das Oportunidades (src/lib/leadDashboard.ts): conversão, valores em aberto, fechados e
// não fechados, origem, perfil, cidades (mesma cidade com grafias diferentes) e meses.
// Rodar: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'airos-leads-'));
const out = join(dir, 'leadDashboard.mjs');
await build({ entryPoints: [new URL('../../src/lib/leadDashboard.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { leadDashboard, topWithOthers, areaRange, lastMonths } = await import(out);
rmSync(dir, { recursive: true, force: true });

const T = '2026-10-20';
const stages = [
  { id: 'novo', name: 'Novo contato', kind: 'open', color: '', position: 0 },
  { id: 'prop', name: 'Proposta enviada', kind: 'open', color: '', position: 1 },
  { id: 'ganho', name: 'Ganhou', kind: 'won', color: '', position: 2 },
  { id: 'perdido', name: 'Não ganhou', kind: 'lost', color: '', position: 3 },
];
const sources = [
  { id: 'insta', name: 'Instagram', active: true, position: 0 },
  { id: 'ind', name: 'Indicação', active: true, position: 1 },
];
const types = [{ id: 'arq', name: 'Arquitetura', description: null, color: '', position: 0 }];
let n = 0;
const lead = (o) => ({
  id: `l${++n}`, name: `Lead ${n}`, phone: '', email: null, city: 'Campinas', state: 'SP', area_m2: null, category: null,
  project_type_id: null, source_id: null, referred_by: null, proposal_value: null, stage_id: 'novo', owner_id: null, position: n,
  next_contact_date: null, expected_close_date: null, lost_reason: null, notes: null, stage_changed_at: '2026-10-01T12:00:00Z',
  closed_at: null, client_id: null, converted_at: null, created_by: null, created_at: '2026-09-01T12:00:00Z', updated_at: '2026-09-01T12:00:00Z', ...o,
});

const leads = [
  lead({ stage_id: 'novo', proposal_value: 20000, source_id: 'insta', city: 'São Paulo', area_m2: 70, category: 'Residencial' }),
  lead({ stage_id: 'prop', proposal_value: null, source_id: 'insta', city: 'sao paulo', area_m2: 120 }),
  lead({ stage_id: 'ganho', proposal_value: 50000, source_id: 'ind', closed_at: '2026-10-11T12:00:00Z', project_type_id: 'arq', area_m2: 250, category: 'Residencial' }),
  lead({ stage_id: 'ganho', proposal_value: 30000, source_id: 'ind', closed_at: '2026-09-21T12:00:00Z', created_at: '2026-09-01T12:00:00Z' }),
  lead({ stage_id: 'perdido', proposal_value: 40000, source_id: 'insta', closed_at: '2026-10-05T12:00:00Z', lost_reason: 'Preço', city: 'Campinas', state: 'sp' }),
  lead({ stage_id: 'perdido', proposal_value: null, lost_reason: ' preço ', closed_at: '2026-10-06T12:00:00Z', created_at: '2026-10-02T12:00:00Z' }),
];

test('números do topo: conversão, em aberto, fechados e não fechados', () => {
  const d = leadDashboard({ leads, stages, sources, types, today: T });
  assert.equal(d.total, 6);
  assert.deepEqual([d.open, d.won, d.lost], [2, 2, 2]);
  assert.equal(d.conversion, 0.5);
  assert.equal(d.openValue, 20000);
  assert.equal(d.openNoValue, 1);
  assert.equal(d.wonValue, 80000);
  assert.equal(d.lostValue, 40000);
  assert.equal(d.avgTicket, 40000);
  // 40 dias e 20 dias da entrada ao fechamento
  assert.equal(d.avgDaysToClose, 30);
  assert.deepEqual(d.stages.map((s) => [s.name, s.count, s.value]), [['Novo contato', 1, 20000], ['Proposta enviada', 1, 0]]);
});

test('de onde vem: leads, ganhas, perdidas e conversão por origem', () => {
  const d = leadDashboard({ leads, stages, sources, types, today: T });
  const by = Object.fromEntries(d.sources.map((s) => [s.label, s]));
  assert.deepEqual([by.Instagram.total, by.Instagram.won, by.Instagram.lost, by.Instagram.conversion], [3, 0, 1, 0]);
  assert.deepEqual([by['Indicação'].won, by['Indicação'].wonValue, by['Indicação'].conversion], [2, 80000, 1]);
  assert.equal(by['Não informada'].total, 1);
});

test('perfil e localidades: mesma cidade com grafias diferentes, faixas de área, motivos de perda', () => {
  const d = leadDashboard({ leads, stages, sources, types, today: T });
  const sp = d.cities.find((c) => c.key === 'sao paulo');
  assert.equal(sp.total, 2);
  assert.match(sp.label, /S(ã|a)o Paulo · SP/);
  assert.equal(d.cities.find((c) => c.key === 'campinas').total, 4);
  assert.equal(d.states.find((s) => s.key === 'SP').total, 6);
  assert.deepEqual(d.areas.map((a) => [a.label, a.total]), [['Até 80 m²', 1], ['80 a 150 m²', 1], ['150 a 300 m²', 1], ['Área não informada', 3]]);
  assert.equal(d.categories.find((c) => c.key === 'Residencial').total, 2);
  assert.equal(d.types.find((t) => t.key === 'arq').won, 1);
  // "Preço" e " preço " são o mesmo motivo
  assert.deepEqual(d.lostReasons.map((r) => [r.reason, r.count, r.value]), [['Preço', 2, 40000]]);
});

test('meses: entradas pelo cadastro, ganhas e perdidas pelo mês da decisão', () => {
  const d = leadDashboard({ leads, stages, sources, types, today: T, months: 3 });
  assert.deepEqual(d.months.map((m) => m.key), ['2026-08', '2026-09', '2026-10']);
  const oct = d.months[2];
  assert.deepEqual([oct.entered, oct.won, oct.lost, oct.wonValue, oct.lostValue], [1, 1, 2, 50000, 40000]);
  assert.deepEqual([d.months[1].entered, d.months[1].won, d.months[1].wonValue], [5, 1, 30000]);
});

test('auxiliares: "Outras", faixa de área e meses na virada do ano', () => {
  const b = (label, total) => ({ key: label, label, total, open: total, won: 0, lost: 0, wonValue: 0, conversion: null });
  const top = topWithOthers([b('A', 5), b('B', 4), b('C', 3), b('D', 2)], 3);
  assert.deepEqual(top.map((x) => [x.label, x.total]), [['A', 5], ['B', 4], ['Outras (2)', 5]]);
  assert.equal(areaRange(0).key, 'none');
  assert.equal(areaRange(80).label, 'Até 80 m²');
  assert.equal(areaRange(301).label, 'Acima de 300 m²');
  assert.deepEqual(lastMonths('2026-02-10', 4), ['2025-11', '2025-12', '2026-01', '2026-02']);
});
