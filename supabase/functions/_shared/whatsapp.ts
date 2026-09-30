// WhatsApp Business Cloud API (Meta).
const GRAPH = 'https://graph.facebook.com/v21.0';

export interface WhatsAppConfig {
  token: string;
  phoneNumberId: string;
}

async function post(cfg: WhatsAppConfig, body: Record<string, unknown>) {
  const res = await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Envia texto. O WhatsApp limita a 4096 caracteres por mensagem. */
export async function sendText(cfg: WhatsAppConfig, to: string, text: string) {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > 4000) {
    const cut = rest.lastIndexOf('\n', 4000) > 2000 ? rest.lastIndexOf('\n', 4000) : 4000;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  chunks.push(rest);
  for (const body of chunks) {
    await post(cfg, { recipient_type: 'individual', to, type: 'text', text: { body, preview_url: true } });
  }
}

export function markRead(cfg: WhatsAppConfig, messageId: string) {
  return post(cfg, { status: 'read', message_id: messageId }).catch(() => undefined);
}

/** Valida o cabeçalho X-Hub-Signature-256 enviado pela Meta. */
export async function verifySignature(appSecret: string, rawBody: string, header: string | null): Promise<boolean> {
  if (!header?.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  const expected = Array.from(mac).map((b) => b.toString(16).padStart(2, '0')).join('');
  const got = header.slice(7);
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export interface IncomingMessage {
  id: string;
  from: string;
  type: string;
  text: string | null;
}

/** Extrai as mensagens recebidas do payload do webhook (ignora status de entrega). */
export function parseWebhook(payload: unknown): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries as Array<{ changes?: Array<{ value?: { messages?: Array<Record<string, unknown>> } }> }>) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) {
        const type = String(m.type ?? '');
        let text: string | null = null;
        if (type === 'text') text = String((m.text as { body?: string })?.body ?? '');
        else if (type === 'button') text = String((m.button as { text?: string })?.text ?? '');
        else if (type === 'interactive') {
          const i = m.interactive as { button_reply?: { title?: string }; list_reply?: { title?: string } };
          text = i?.button_reply?.title ?? i?.list_reply?.title ?? null;
        }
        out.push({ id: String(m.id), from: String(m.from), type, text });
      }
    }
  }
  return out;
}
