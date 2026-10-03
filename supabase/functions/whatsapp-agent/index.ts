// Webhook do WhatsApp Business (Cloud API da Meta) → assistente da AIROS.
//
// Deploy (sem verificação de JWT, pois quem chama é a Meta):
//   supabase functions deploy whatsapp-agent --no-verify-jwt
// Segredos necessários: ANTHROPIC_API_KEY, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
// WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET (opcionais: APP_URL, AGENT_TIMEZONE,
// GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_CALENDAR_ID).
import { adminClient, findProfileByPhone, handleMessage, whatsappConfig } from '../_shared/agent/service.ts';
import { markRead, parseWebhook, sendText, verifySignature } from '../_shared/whatsapp.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

async function process(payload: unknown) {
  const wa = whatsappConfig();
  if (!wa) {
    console.error('WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID não configurados.');
    return;
  }
  const db = adminClient();
  for (const msg of parseWebhook(payload)) {
    try {
      // O número pode ser o mesmo que o escritório usa com clientes (WhatsApp Business app +
      // API). Mensagens de quem não é da equipe ficam intocadas: sem resposta automática e
      // sem marcar como lida, para a equipe atender pelo aplicativo normalmente.
      const me = await findProfileByPhone(db, msg.from);
      if (!me) continue;
      await markRead(wa, msg.id);
      if (!msg.text?.trim()) {
        await sendText(wa, msg.from, 'Por enquanto eu entendo apenas mensagens de texto. Pode escrever o seu pedido? 🙂');
        continue;
      }
      const reply = await handleMessage({ db, me, text: msg.text.trim(), channel: 'whatsapp', waMessageId: msg.id });
      if (reply) await sendText(wa, msg.from, reply);
    } catch (e) {
      console.error('Erro ao processar mensagem', e);
      await sendText(wa, msg.from, 'Tive um problema para processar sua mensagem agora. Tente novamente em instantes.').catch(() => undefined);
    }
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Verificação do webhook (configuração no painel da Meta)
  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' &&
      url.searchParams.get('hub.verify_token') === Deno.env.get('WHATSAPP_VERIFY_TOKEN');
    return ok ? new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 }) : new Response('forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const raw = await req.text();
  const secret = Deno.env.get('WHATSAPP_APP_SECRET');
  if (!secret || !(await verifySignature(secret, raw, req.headers.get('x-hub-signature-256')))) {
    return new Response('invalid signature', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response('bad request', { status: 400 });
  }

  // Responde 200 na hora (a Meta reenvia se demorar) e processa em segundo plano.
  const work = process(payload);
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work);
  else await work;
  return new Response('ok', { status: 200 });
});
