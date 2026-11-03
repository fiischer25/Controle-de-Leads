// Duração das tarefas e etapas (src/lib/domain.ts): dias corridos, com sábado e domingo,
// contando o início e o fim.
// Rodar: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'airos-dur-'));
const out = join(dir, 'domain.mjs');
await build({ entryPoints: [new URL('../../src/lib/domain.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { datesForDuration, durationDays } = await import(out);
rmSync(dir, { recursive: true, force: true });

test('20 dias corridos a partir de 01/10 terminam em 20/10 (fins de semana contam)', () => {
  assert.deepEqual(datesForDuration({ start_date: '2026-10-01', due_date: null }, 20), { start_date: '2026-10-01', due_date: '2026-10-20' });
  assert.equal(durationDays('2026-10-01', '2026-10-20'), 20);
});

test('segunda a domingo = 7 dias; mesmo dia = 1; fim antes do início = 0', () => {
  assert.equal(durationDays('2026-10-05', '2026-10-11'), 7);
  assert.equal(durationDays('2026-10-05', '2026-10-05'), 1);
  assert.equal(durationDays('2026-10-05', '2026-10-04'), 0);
});

test('começa no sábado ou só com o fim: conta para trás em dias corridos', () => {
  assert.deepEqual(datesForDuration({ start_date: '2026-10-03', due_date: null }, 2), { start_date: '2026-10-03', due_date: '2026-10-04' });
  assert.deepEqual(datesForDuration({ start_date: null, due_date: '2026-10-11' }, 7), { start_date: '2026-10-05', due_date: '2026-10-11' });
  // A duração editada mantém o início e recalcula o fim
  assert.deepEqual(datesForDuration({ start_date: '2026-10-05', due_date: '2026-10-30' }, 3), { start_date: '2026-10-05', due_date: '2026-10-07' });
});
