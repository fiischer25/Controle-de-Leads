// Chat com o assistente dentro do sistema (mesmo agente do WhatsApp).
// Deploy: supabase functions deploy agent-chat
import { adminClient, handleMessage } from '../_shared/agent/service.ts';
import type { Profile } from '../_shared/agent/tools.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return json({ error: 'O assistente ainda não foi configurado (ANTHROPIC_API_KEY).' }, 503);

  const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await caller.auth.getUser();
  if (!auth.user) return json({ error: 'Sessão expirada. Entre novamente.' }, 401);

  const db = adminClient();
  const { data: me } = await db.from('profiles').select('*').eq('id', auth.user.id).single();
  if (!me?.active) return json({ error: 'Usuário desativado.' }, 403);

  let text = '';
  try {
    text = String((await req.json()).message ?? '').trim();
  } catch {
    /* corpo inválido */
  }
  if (!text) return json({ error: 'Mensagem vazia.' }, 400);
  if (text.length > 4000) return json({ error: 'Mensagem muito longa.' }, 400);

  try {
    const reply = await handleMessage({ db, me: me as Profile, text, channel: 'app' });
    return json({ reply });
  } catch (e) {
    console.error(e);
    return json({ error: 'O assistente não conseguiu responder agora. Tente novamente.' }, 500);
  }
});
