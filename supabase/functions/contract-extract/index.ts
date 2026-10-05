// Lê um contrato (PDF, foto ou texto do Word) e devolve os dados do cliente, o valor e as
// parcelas para preencher o cadastro no fechamento da oportunidade.
// Deploy: supabase functions deploy contract-extract   (usa o segredo ANTHROPIC_API_KEY)
import Anthropic from 'npm:@anthropic-ai/sdk@0.129.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { adminClient, TIMEZONE } from '../_shared/agent/service.ts';
import { hasModule, type Profile } from '../_shared/agent/tools.ts';
import { todayIn } from '../_shared/agent/time.ts';
import { ContractError, extractContract, type ContractInput } from '../_shared/contract.ts';
import { corsHeaders, json } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  if (!Deno.env.get('ANTHROPIC_API_KEY')) {
    return json({ error: 'A leitura de contratos ainda não foi configurada (segredo ANTHROPIC_API_KEY no Supabase).' }, 503);
  }

  const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await caller.auth.getUser();
  if (!auth.user) return json({ error: 'Sessão expirada. Entre novamente.' }, 401);

  const { data: me } = await adminClient().from('profiles').select('*').eq('id', auth.user.id).single();
  if (!me?.active) return json({ error: 'Usuário desativado.' }, 403);
  if (!hasModule(me as Profile, 'comercial') && !hasModule(me as Profile, 'financeiro')) {
    return json({ error: 'Você não tem acesso ao Comercial para ler contratos.' }, 403);
  }

  let input: ContractInput;
  try {
    const body = await req.json();
    input = { name: String(body.name ?? '').slice(0, 200), media_type: String(body.media_type ?? ''), data: body.data, text: body.text };
  } catch {
    return json({ error: 'Arquivo inválido.' }, 400);
  }

  try {
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
    const result = await extractContract(anthropic, input, todayIn(TIMEZONE, new Date()));
    return json({ result });
  } catch (e) {
    if (e instanceof ContractError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Não foi possível ler o contrato agora. Tente novamente em instantes.' }, 500);
  }
});
