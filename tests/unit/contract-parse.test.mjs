// Leitura gratuita do contrato (src/lib/contractParse.ts): variações do modelo do escritório
// (linhas juntas, data na linha de baixo, data antes do valor, ordinais por extenso, tabela
// repetida em anexo, texto corrido) e outras formas de pagamento. Dados fictícios.
// Rodar: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'airos-parse-'));
const out = join(dir, 'contractParse.mjs');
await build({ entryPoints: [new URL('../../src/lib/contractParse.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { parseContractText } = await import(out);
rmSync(dir, { recursive: true, force: true });

const head = (pay) => `CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE ARQUITETURA E INTERIORES
CONTRATANTE: MARIANA TEIXEIRA LOPES, brasileira, médica, inscrita no CPF sob o nº 390.533.447-05, residente e domiciliada na Rua das Flores, nº 120, Bairro Alto, Curitiba/PR, CEP 82820-000, e-mail mariana@exemplo.com, telefone (41) 99999-0000.
CONTRATADO: ESCRITÓRIO DE ARQUITETURA LTDA, CNPJ 11.222.333/0001-81.
1 DO OBJETO
1.1 O presente contrato tem como objeto a elaboração de projeto de arquitetura e interiores da residência situada na Rua das Araucárias, nº 45, Batel, Curitiba/PR, com área aproximada de 185 m².
2 DOS PRAZOS
2.1 Em caso de atraso no pagamento de qualquer parcela incidirá multa de 2% e juros de 1% ao mês.
3 DOS HONORÁRIOS
${pay}
3.2 Os pagamentos serão feitos por boletos bancários emitidos e enviados após a assinatura.
3.5 O acréscimo de área será cobrado à razão de R$ 120,00 por m² adicional.
Curitiba, 20 de novembro de 2026.`;

const ROWS = [
  ['ENTRADA', '9.747,50', '25/11/2026'],
  ['1ª PARCELA', '5.848,50', '15/12/2026'],
  ['2ª PARCELA', '5.848,50', '15/01/2027'],
  ['3ª PARCELA', '5.848,50', '15/02/2027'],
  ['4ª PARCELA', '5.848,50', '15/03/2027'],
  ['5ª PARCELA', '5.848,50', '15/04/2027'],
];
const WORDS = ['ENTRADA', 'PRIMEIRA PARCELA', 'SEGUNDA PARCELA', 'TERCEIRA PARCELA', 'QUARTA PARCELA', 'QUINTA PARCELA'];
const intro = '3.1 Pelos serviços, o CONTRATANTE pagará ao CONTRATADO R$ 38.990,00 (trinta e oito mil novecentos e noventa reais), conforme os vencimentos seguintes:\n';
const table = (fmt, sep = '\n') => intro + ROWS.map(fmt).join(sep);
const MODEL = [
  [9747.5, '2026-11-25'],
  [5848.5, '2026-12-15'],
  [5848.5, '2027-01-15'],
  [5848.5, '2027-02-15'],
  [5848.5, '2027-03-15'],
  [5848.5, '2027-04-15'],
];

const modelCases = {
  'modelo do escritório': table(([l, v, d]) => `${l} - R$ ${v}, no dia ${d}.`),
  'linhas da tabela juntas numa linha só': table(([l, v, d]) => `${l} - R$ ${v}, no dia ${d}.`, ' '),
  'data na linha de baixo': table(([l, v, d]) => `${l} - R$ ${v}, no dia\n${d}.`),
  'valor na linha de baixo': table(([l, v, d]) => `${l} - R$\n${v}, no dia ${d}.`),
  'dois-pontos e "com vencimento em"': table(([l, v, d]) => `${l}: R$ ${v} com vencimento em ${d};`),
  '"no valor de"': table(([l, v, d]) => `${l} no valor de R$ ${v}, a ser paga em ${d}.`),
  'sem separador': table(([l, v, d]) => `${l} R$ ${v} - ${d}`),
  'data antes do valor': table(([l, v, d]) => `${l} – ${d} – R$ ${v}`),
  'ordinais por extenso': intro + ROWS.map(([, v, d], i) => `${WORDS[i]} - R$ ${v}, no dia ${d}.`).join('\n'),
  'parcela 1/5': intro + ROWS.map(([, v, d], i) => `${i === 0 ? 'Entrada' : `Parcela ${i}/5`} - R$ ${v} - vencimento ${d}`).join('\n'),
  'texto corrido com saldo em parcelas':
    '3.1 Pelos serviços, o CONTRATANTE pagará ao CONTRATADO R$ 38.990,00 (trinta e oito mil novecentos e noventa reais), da seguinte forma: entrada de R$ 9.747,50 no dia 25/11/2026 e o saldo em 5 (cinco) parcelas de R$ 5.848,50, vencendo a primeira em 15/12/2026 e as demais no mesmo dia dos meses seguintes.',
};

for (const [name, pay] of Object.entries(modelCases)) {
  test(name, () => {
    const x = parseContractText(head(pay));
    assert.equal(x.contract.total, 38990);
    assert.deepEqual(x.contract.installments.map((r) => [r.amount, r.due_date]), MODEL);
    assert.equal(x.client.document, '390.533.447-05');
    assert.equal(x.project.area_m2, 185);
  });
}

test('tabela repetida no anexo conta uma vez', () => {
  const t = table(([l, v, d]) => `${l} - R$ ${v}, no dia ${d}.`);
  const x = parseContractText(head(t) + '\n\nANEXO I - CRONOGRAMA FINANCEIRO\n' + ROWS.map(([l, v, d]) => `${l} - R$ ${v}, no dia ${d}.`).join('\n'));
  assert.deepEqual(x.contract.installments.map((r) => [r.amount, r.due_date]), MODEL);
});

test('valores sem centavos', () => {
  const pay = '3.1 O CONTRATANTE pagará o valor total de R$ 30.000 (trinta mil reais), assim:\nENTRADA - R$ 10.000, no dia 10/12/2026.\n1ª PARCELA - R$ 10.000, no dia 10/01/2027.\n2ª PARCELA - R$ 10.000, no dia 10/02/2027.';
  const x = parseContractText(head(pay));
  assert.deepEqual(x.contract.installments.map((r) => [r.amount, r.due_date]), [[10000, '2026-12-10'], [10000, '2027-01-10'], [10000, '2027-02-10']]);
});

test('percentuais por etapa', () => {
  const pay = '3.1 Os honorários totalizam R$ 30.000,00 (trinta mil reais), pagos 30% (trinta por cento) na assinatura do contrato, 40% na entrega do anteprojeto e 30% na entrega do projeto executivo.';
  const x = parseContractText(head(pay));
  assert.equal(x.contract.total, 30000);
  assert.deepEqual(x.contract.installments.map((r) => r.percent), [30, 40, 30]);
  assert.equal(x.contract.installments[0].due_date, '2026-11-20');
});

test('parcelas mensais "todo dia"', () => {
  const pay = '3.1 O valor total de R$ 10.000,00 será pago em 10 (dez) parcelas mensais e sucessivas de R$ 1.000,00, todo dia 10.';
  const x = parseContractText(head(pay));
  const rows = x.contract.installments;
  assert.equal(rows.length, 10);
  assert.equal(rows.reduce((a, r) => a + r.amount, 0), 10000);
  assert.deepEqual([rows[0].due_date, rows[9].due_date], ['2026-12-10', '2027-09-10']);
});

test('saldo sem o valor de cada parcela: divide o que falta', () => {
  const pay = '3.1 Os honorários são de R$ 25.000,00, sendo entrada de R$ 5.000,00 na assinatura e o saldo em 4 (quatro) parcelas mensais, vencendo a primeira em 10/01/2027.';
  const x = parseContractText(head(pay));
  assert.deepEqual(x.contract.installments.map((r) => [r.amount, r.due_date]), [[5000, '2026-11-20'], [5000, '2027-01-10'], [5000, '2027-02-10'], [5000, '2027-03-10'], [5000, '2027-04-10']]);
});
