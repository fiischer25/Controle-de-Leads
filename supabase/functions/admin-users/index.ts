// Supabase Edge Function: administração de usuários da equipe AIROS.
// Só administradores ativos podem chamar. Usa a service role (nunca exposta ao navegador)
// para criar logins, trocar e-mail/senha e desativar membros.
//
// Deploy: supabase functions deploy admin-users
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count, x-region, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Quem está chamando?
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await caller.auth.getUser();
  if (!auth.user) return json({ error: 'Sessão expirada. Entre novamente.' }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: me } = await admin.from('profiles').select('role, active').eq('id', auth.user.id).single();
  if (!me || me.role !== 'admin' || !me.active) {
    return json({ error: 'Apenas administradores podem gerenciar a equipe.' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Requisição inválida.' }, 400);
  }

  if (body.action === 'create') {
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const role = body.role === 'admin' ? 'admin' : 'member';
    const color = String(body.color ?? '#57534e');
    const job_title = body.job_title ? String(body.job_title) : null;
    const phone = body.phone ? String(body.phone) : null;
    const MODULES = ['projetos', 'comercial', 'relatorios', 'equipe', 'configuracoes', 'financeiro'];
    const permissions = Array.isArray(body.permissions)
      ? [...new Set(body.permissions.map(String).filter((m) => MODULES.includes(m)))]
      : ['projetos', 'comercial', 'relatorios', 'equipe'];

    if (!name) return json({ error: 'Informe o nome.' }, 400);
    if (!EMAIL_RE.test(email)) return json({ error: 'E-mail inválido.' }, 400);
    if (password.length < 6) return json({ error: 'A senha deve ter pelo menos 6 caracteres.' }, 400);

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, color, job_title, phone },
      app_metadata: { provisioned: true, role },
    });
    if (error) return json({ error: error.message }, 400);

    // O gatilho handle_new_user cria o perfil; garantimos os dados finais.
    const { data: profile, error: pErr } = await admin
      .from('profiles')
      .upsert({ id: data.user.id, name, email, role, color, job_title, phone, active: true, permissions })
      .select('*')
      .single();
    if (pErr) return json({ error: pErr.message }, 400);
    return json({ profile });
  }

  if (body.action === 'update') {
    const userId = String(body.userId ?? '');
    if (!userId) return json({ error: 'Usuário não informado.' }, 400);
    if (userId === auth.user.id && body.active === false) {
      return json({ error: 'Você não pode desativar a própria conta.' }, 400);
    }

    const attrs: Record<string, unknown> = {};
    const profilePatch: Record<string, unknown> = {};
    if (typeof body.email === 'string' && body.email) {
      const email = body.email.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return json({ error: 'E-mail inválido.' }, 400);
      attrs.email = email;
      attrs.email_confirm = true;
      profilePatch.email = email;
    }
    if (typeof body.password === 'string' && body.password) {
      if (body.password.length < 6) return json({ error: 'A senha deve ter pelo menos 6 caracteres.' }, 400);
      attrs.password = body.password;
    }
    if (typeof body.active === 'boolean') {
      // Desativar = bloquear o login (ban) e marcar o perfil como inativo.
      attrs.ban_duration = body.active ? 'none' : '876000h';
      profilePatch.active = body.active;
    }

    if (Object.keys(attrs).length) {
      const { error } = await admin.auth.admin.updateUserById(userId, attrs);
      if (error) return json({ error: error.message }, 400);
    }
    if (Object.keys(profilePatch).length) {
      const { error } = await admin.from('profiles').update(profilePatch).eq('id', userId);
      if (error) return json({ error: error.message }, 400);
    }
    return json({ ok: true });
  }

  return json({ error: 'Ação desconhecida.' }, 400);
});
