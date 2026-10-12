// Categorias sugeridas do Financeiro (src/lib/categoryPresets.ts): cadastra as que faltam
// (projeto, acompanhamento, consultoria…) e deixa "Outras…" no fim, sem repetir as existentes.
// Rodar: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'airos-cat-'));
const out = join(dir, 'cat.mjs');
await build({ entryPoints: [new URL('../../src/lib/categoryPresets.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { presetCategoryPlan } = await import(out);
rmSync(dir, { recursive: true, force: true });

const presets = [
  ['Honorários de projeto', 'receita', '#1'],
  ['Acompanhamento de obra', 'receita', '#2'],
  ['Consultoria e laudos', 'receita', '#3'],
  ['Outras receitas', 'receita', '#4'],
  ['Aluguel e condomínio', 'despesa', '#5'],
  ['Outras despesas', 'despesa', '#6'],
];

test('cadastra as que faltam e deixa "Outras" no fim', () => {
  const cats = [
    { id: 'h', name: 'Honorários de projeto', kind: 'receita', position: 0 },
    { id: 'rt', name: 'Reserva técnica (RT)', kind: 'receita', position: 1 },
    { id: 'a', name: 'acompanhamento de obra', kind: 'receita', position: 2 },
    { id: 'o', name: 'Outras receitas', kind: 'receita', position: 3 },
    { id: 'al', name: 'Aluguel e condomínio', kind: 'despesa', position: 0 },
    { id: 'od', name: 'Outras despesas', kind: 'despesa', position: 1 },
  ];
  const plan = presetCategoryPlan(cats, presets);
  assert.deepEqual(plan.insert, [{ name: 'Consultoria e laudos', kind: 'receita', color: '#3', position: 2 }]);
  // Honorários 0, Acompanhamento 1, Consultoria 2, RT (do escritório) 3, Outras 4
  assert.deepEqual(plan.reorder, [
    { id: 'a', position: 1 },
    { id: 'rt', position: 3 },
    { id: 'o', position: 4 },
  ]);
});

test('nada a fazer quando todas existem', () => {
  const cats = presets.map(([name, kind], i) => ({ id: String(i), name, kind, position: i }));
  assert.deepEqual(presetCategoryPlan(cats, presets), { insert: [], reorder: [] });
});

test('escritório sem categorias recebe todas, em ordem', () => {
  const plan = presetCategoryPlan([], presets);
  assert.deepEqual(plan.insert.map((c) => [c.name, c.position]), [
    ['Honorários de projeto', 0], ['Acompanhamento de obra', 1], ['Consultoria e laudos', 2], ['Outras receitas', 3],
    ['Aluguel e condomínio', 0], ['Outras despesas', 1],
  ]);
});
