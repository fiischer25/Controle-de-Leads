// Aguardando retorno do cliente (src/lib/clientWait.ts): período em aberto, dias com o cliente,
// abrir e fechar períodos e o tempo de cada etapa.
// Rodar: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'airos-wait-'));
const out = join(dir, 'clientWait.mjs');
await build({ entryPoints: [new URL('../../src/lib/clientWait.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const w = await import(out);
rmSync(dir, { recursive: true, force: true });

test('abrir e fechar o período com o cliente', () => {
  let waits = w.startWait([], 'EP - Estudo Preliminar', '2026-10-01');
  assert.deepEqual(w.openWait(waits), { phase: 'EP - Estudo Preliminar', started_at: '2026-10-01', ended_at: null });
  assert.equal(w.waitDays(w.openWait(waits), '2026-10-13'), 12);
  waits = w.endWaits(waits, '2026-10-09');
  assert.equal(w.openWait(waits), null);
  assert.equal(w.waitDays(waits[0], '2026-11-30'), 8, 'fechado não cresce mais');
  // Nova espera fecha a anterior que tenha ficado aberta
  waits = w.startWait(w.startWait(waits, 'AP - Anteprojeto', '2026-10-20'), 'AP - Anteprojeto', '2026-10-25');
  assert.deepEqual(waits.map((x) => x.ended_at), ['2026-10-09', '2026-10-25', null]);
});

test('tempo com o cliente por etapa e no projeto', () => {
  const waits = [
    { phase: 'EP', started_at: '2026-09-01', ended_at: '2026-09-11' },
    { phase: 'EP', started_at: '2026-09-20', ended_at: '2026-09-25' },
    { phase: 'AP', started_at: '2026-10-28', ended_at: null },
  ];
  const by = w.waitsByPhase(waits, '2026-11-03');
  assert.deepEqual(by.EP, { days: 15, times: 2, open: false, openDays: 0 });
  assert.deepEqual(by.AP, { days: 6, times: 1, open: true, openDays: 6 });
  assert.equal(w.totalWaitDays(waits, '2026-11-03'), 21);
  assert.equal(w.totalWaitDays(undefined, '2026-11-03'), 0);
});

test('textos de dias', () => {
  assert.equal(w.sinceLabel(0), 'desde hoje');
  assert.equal(w.sinceLabel(1), 'há 1 dia');
  assert.equal(w.sinceLabel(9), 'há 9 dias');
  assert.equal(w.daysLabel(0), 'menos de 1 dia');
  assert.equal(w.daysLabel(1), '1 dia');
  assert.equal(w.daysLabel(15), '15 dias');
});
