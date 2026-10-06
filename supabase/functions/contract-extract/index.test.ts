// Testes da leitura de contrato: `deno test --allow-env supabase/functions/contract-extract/index.test.ts`
// Usam um cliente do Claude simulado (não chamam APIs externas).
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
Deno.env.set('AIROS_NO_SERVE', '1');
const { CONTRACT_SCHEMA, ContractError, contractContent, extractContract, handle, normalizeExtraction, todayIn } = await import('./index.ts');

type Params = Record<string, unknown>;

function fakeClaude(reply: { text?: string; stop_reason?: string }) {
  const calls: Params[] = [];
  const client = {
    beta: {
      messages: {
        create: (params: Params) => {
          calls.push(params);
          return Promise.resolve({
            stop_reason: reply.stop_reason ?? 'end_turn',
            content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: reply.text ?? '' }],
          });
        },
      },
    },
  };
  return { client: client as never, calls };
}

const SAMPLE = {
  client: {
    name: ' Ana Souza ', document: '123.456.789-09', rg: '', birth_date: '1990-02-30', email: 'ANA@EXEMPLO.COM', phone: '(41) 99999-0000',
    profession: 'Médica', cep: '80000-000', street: 'Rua XV de Novembro', number: '100', complement: 'Apto 12', neighborhood: 'Centro',
    city: 'Curitiba', state: 'pr',
  },
  contract: {
    total: 30000,
    signed_date: '2026-10-10',
    installments: [
      { label: 'Assinatura do contrato', amount: 9000, percent: 30, due_date: '2026-10-10' },
      { label: 'Entrega do anteprojeto', amount: 12000, percent: 40, due_date: '' },
      { label: 'Entrega do executivo', amount: -5, percent: 130, due_date: '10/12/2026' },
    ],
  },
  project: { site_address: 'Rua das Flores, 20', site_city: 'Curitiba', area_m2: 180, scope: 'Projeto de interiores.' },
  notes: '',
  warnings: ['A última parcela não tem valor.', ''],
};

Deno.test('schema: todos os objetos fecham e todos os campos são obrigatórios', () => {
  const walk = (s: Record<string, unknown>) => {
    if (s.type === 'object') {
      assertEquals(s.additionalProperties, false);
      assertEquals((s.required as string[]).sort(), Object.keys(s.properties as object).sort());
      for (const v of Object.values(s.properties as Record<string, Record<string, unknown>>)) walk(v);
    }
    if (s.type === 'array') walk(s.items as Record<string, unknown>);
    assert(!('anyOf' in s) && !Array.isArray(s.type), 'sem uniões de tipo');
  };
  walk(CONTRACT_SCHEMA);
});

Deno.test('normaliza datas, números, UF e avisos', () => {
  const x = normalizeExtraction(SAMPLE);
  assertEquals(x.client.name, 'Ana Souza');
  assertEquals(x.client.birth_date, '');
  assertEquals(x.client.email, 'ana@exemplo.com');
  assertEquals(x.client.state, 'PR');
  assertEquals(x.contract.installments[1].due_date, '');
  assertEquals(x.contract.installments[2], { label: 'Entrega do executivo', amount: 0, percent: 0, due_date: '' });
  assertEquals(x.warnings, ['A última parcela não tem valor.']);
  assertEquals(normalizeExtraction(null).contract.installments, []);
});

Deno.test('monta o conteúdo para PDF, imagem e texto', () => {
  const pdf = contractContent({ media_type: 'application/pdf', data: 'data:application/pdf;base64,QUJD', name: 'c.pdf' });
  assertEquals((pdf[0] as unknown as Params).type, 'document');
  assertEquals(((pdf[0] as unknown as Params).source as Params).data, 'QUJD');
  const img = contractContent({ media_type: 'image/png', data: 'QUJD' });
  assertEquals((img[0] as unknown as Params).type, 'image');
  const txt = contractContent({ media_type: 'text/plain', text: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE ARQUITETURA. Contratante: Ana.' });
  assertEquals(((txt[0] as unknown as Params).source as Params).type, 'text');
  for (const bad of [
    { media_type: 'application/zip', data: 'QUJD' },
    { media_type: 'application/pdf', data: '' },
    { media_type: 'text/plain', text: 'curto' },
  ]) {
    try {
      contractContent(bad);
      throw new Error('deveria falhar');
    } catch (e) {
      assert(e instanceof ContractError, String(e));
    }
  }
});

Deno.test('chama o Claude com structured outputs e devolve os dados', async () => {
  const { client, calls } = fakeClaude({ text: JSON.stringify(SAMPLE) });
  const x = await extractContract(client, { media_type: 'application/pdf', data: 'QUJD' }, '2026-10-05');
  assertEquals(x.contract.total, 30000);
  assertEquals(x.contract.installments.length, 3);
  const p = calls[0];
  assertEquals(p.model, 'claude-opus-5-5');
  assertEquals(p.fallbacks, 'default');
  assertEquals((p.output_config as Params).format, { type: 'json_schema', schema: CONTRACT_SCHEMA });
  assert(JSON.stringify(p.messages).includes('2026-10-05'));
});

Deno.test('recusa e resposta inválida viram erro amigável', async () => {
  await assertRejects(() => extractContract(fakeClaude({ stop_reason: 'refusal' }).client, { media_type: 'image/png', data: 'QUJD' }, '2026-10-05'), ContractError);
  await assertRejects(() => extractContract(fakeClaude({ text: 'não sei' }).client, { media_type: 'image/png', data: 'QUJD' }, '2026-10-05'), ContractError);
  await assertRejects(() => extractContract(fakeClaude({ stop_reason: 'max_tokens', text: '{' }).client, { media_type: 'image/png', data: 'QUJD' }, '2026-10-05'), ContractError);
});

Deno.test('data de hoje no fuso do escritório', () => {
  assertEquals(todayIn('America/Sao_Paulo', new Date('2026-10-06T02:30:00Z')), '2026-10-05');
});

Deno.test('endpoint: CORS e aviso claro quando falta a chave', async () => {
  const pre = await handle(new Request('http://x/contract-extract', { method: 'OPTIONS' }));
  assertEquals(pre.status, 200);
  assertEquals(pre.headers.get('Access-Control-Allow-Origin'), '*');
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  Deno.env.delete('ANTHROPIC_API_KEY');
  try {
    const res = await handle(new Request('http://x/contract-extract', { method: 'POST', body: '{"ping":true}' }));
    assertEquals(res.status, 503);
    assert(/ANTHROPIC_API_KEY/.test((await res.json()).error));
  } finally {
    if (key) Deno.env.set('ANTHROPIC_API_KEY', key);
  }
});
