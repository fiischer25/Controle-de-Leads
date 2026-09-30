// `deno test supabase/functions/_shared/whatsapp.test.ts`
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { parseWebhook, verifySignature } from './whatsapp.ts';

async function sign(secret: string, body: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return 'sha256=' + Array.from(mac).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.test('assinatura da Meta: aceita a correta e recusa adulterada', async () => {
  const body = '{"entry":[]}';
  const header = await sign('segredo', body);
  assert(await verifySignature('segredo', body, header));
  assert(!(await verifySignature('segredo', body + ' ', header)));
  assert(!(await verifySignature('outro', body, header)));
  assert(!(await verifySignature('segredo', body, null)));
});

Deno.test('extrai mensagens de texto e ignora status de entrega', () => {
  const payload = {
    entry: [{
      changes: [
        { value: { messages: [{ id: 'wamid.1', from: '5541988880002', type: 'text', text: { body: 'minhas tarefas de hoje' } }] } },
        { value: { statuses: [{ id: 'wamid.0', status: 'delivered' }] } },
        { value: { messages: [{ id: 'wamid.2', from: '5541988880002', type: 'audio', audio: { id: 'x' } }] } },
      ],
    }],
  };
  assertEquals(parseWebhook(payload), [
    { id: 'wamid.1', from: '5541988880002', type: 'text', text: 'minhas tarefas de hoje' },
    { id: 'wamid.2', from: '5541988880002', type: 'audio', text: null },
  ]);
  assertEquals(parseWebhook({}), []);
});
