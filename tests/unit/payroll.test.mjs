// Folha de pagamento (src/lib/payroll.ts): salário do mês pago no dia escolhido do mês seguinte,
// situação de cada pessoa, totais e aviso de folha já lançada sem pessoa.
// Rodar: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'airos-folha-'));
const out = join(dir, 'payroll.mjs');
await build({ entryPoints: [new URL('../../src/lib/payroll.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const p = await import(out);
rmSync(dir, { recursive: true, force: true });

let n = 0;
const entry = (o) => ({ id: `e${++n}`, kind: 'despesa', description: 'Salário', amount: 0, due_date: '2026-10-05', paid_at: null, account_id: null, to_account_id: null, category_id: 'sal', client_id: null, project_id: null, series_id: null, installment: null, installments: null, document: null, notes: null, created_by: null, created_at: '', updated_at: '', ...o });

test('salário de setembro é pago no dia 5 de outubro (e dezembro vira janeiro)', () => {
  assert.equal(p.payDate('2026-09'), '2026-10-05');
  assert.equal(p.payDate('2026-12', 10), '2027-01-10');
  assert.equal(p.payDate('2026-01', 31), '2026-02-28', 'dia limitado a 28');
  assert.equal(p.prevMonth('2026-01'), '2025-12');
});

test('situação de cada pessoa na folha do mês', () => {
  const entries = [
    entry({ member_id: 'ana', reference_month: '2026-09', amount: 3000, paid_at: '2026-10-05' }),
    entry({ member_id: 'bia', reference_month: '2026-09', amount: 500, due_date: '2026-10-05' }),
    entry({ member_id: 'caio', reference_month: '2026-08', amount: 2000 }),
    entry({ member_id: 'davi', reference_month: '2026-09', amount: 1200, due_date: '2026-10-20' }),
  ];
  const members = [
    { id: 'ana', salary: 3000 },
    { id: 'bia', salary: 500 },
    { id: 'caio', salary: 2000 },
    { id: 'davi', salary: 0 },
    { id: 'eva', salary: 0 },
  ];
  const rows = p.payrollRows({ members, entries, ref: '2026-09', today: '2026-10-09' });
  assert.deepEqual(rows.map((r) => [r.memberId, r.status]), [['ana', 'pago'], ['bia', 'vencido'], ['caio', 'nao_lancado'], ['davi', 'a_pagar']], 'sem salário e sem lançamento fica de fora');
  assert.deepEqual(p.payrollTotals(rows), { total: 6700, paid: 3000, open: 1700, missing: 2000, people: 4 });
});

test('aviso: folha lançada sem pessoa no mês do pagamento', () => {
  const entries = [
    entry({ description: 'Folha de pagamento', amount: 18500, due_date: '2026-10-05' }),
    entry({ description: 'Aluguel', category_id: 'alu', amount: 3800, due_date: '2026-10-05' }),
    entry({ description: 'Salário Ana', member_id: 'ana', reference_month: '2026-09', amount: 3000 }),
    entry({ description: 'Folha de pagamento', amount: 18500, due_date: '2026-11-05' }),
  ];
  const name = (id) => ({ sal: 'Salários e pró-labore', alu: 'Aluguel e condomínio' })[id] ?? '';
  assert.deepEqual(p.genericPayroll(entries, name, '2026-09').map((e) => e.amount), [18500]);
});
