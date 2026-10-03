// Espelha no Google Agenda do escritório as reuniões criadas/alteradas/excluídas no sistema.
//
// Arquivo único de propósito: pode ser publicado colando este código no painel do Supabase
// (Edge Functions → Deploy a new function → Via Editor, nome "calendar-sync") ou pela CLI:
//   npx supabase functions deploy calendar-sync
//
// Segredos (Edge Functions → Secrets):
//   GOOGLE_SERVICE_ACCOUNT_JSON  conteúdo do arquivo .json da chave da conta de serviço
//   GOOGLE_CALENDAR_ID           ID da agenda (Google Agenda → Configurações → Integrar agenda)
//   AGENT_TIMEZONE               opcional, padrão America/Sao_Paulo
//
// A agenda precisa estar compartilhada com o e-mail da conta de serviço com a permissão
// "Fazer alterações nos eventos". A mesma lógica do Google existe em _shared/google-calendar.ts,
// usada pelo assistente do WhatsApp; mantenha as duas em sincronia.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count, x-region, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const TIMEZONE = Deno.env.get('AGENT_TIMEZONE') || 'America/Sao_Paulo';
const API = 'https://www.googleapis.com/calendar/v3';

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  google_event_id: string | null;
  participant_ids: string[] | null;
}

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Token de acesso do Google a partir da conta de serviço (JWT assinado em RS256). */
async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/calendar.events',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`)));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${b64url(signature)}` }),
  });
  if (!res.ok) throw new Error(`Google OAuth ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

function googleBody(ev: EventRow, participantNames: string[]) {
  const people = participantNames.length ? `Participantes: ${participantNames.join(', ')}` : '';
  const description = [ev.description, people].filter(Boolean).join('\n\n');
  if (ev.all_day) {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date(ev.starts_at));
    const next = new Date(`${day}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return { summary: ev.title, description, location: ev.location ?? undefined, start: { date: day }, end: { date: next.toISOString().slice(0, 10) } };
  }
  const end = ev.ends_at ?? new Date(new Date(ev.starts_at).getTime() + 3_600_000).toISOString();
  return {
    summary: ev.title,
    description,
    location: ev.location ?? undefined,
    start: { dateTime: ev.starts_at, timeZone: TIMEZONE },
    end: { dateTime: end, timeZone: TIMEZONE },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const saJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  const calendarId = Deno.env.get('GOOGLE_CALENDAR_ID');
  if (!saJson || !calendarId) return json({ skipped: 'Google Agenda não configurado.' });
  let sa: ServiceAccount;
  try {
    sa = JSON.parse(saJson);
  } catch {
    return json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON inválido: cole o conteúdo completo do arquivo .json.' }, 500);
  }

  // Só membros ativos do escritório podem sincronizar.
  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await caller.auth.getUser();
  if (!auth.user) return json({ error: 'Não autenticado.' }, 401);
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: me } = await db.from('profiles').select('active').eq('id', auth.user.id).single();
  if (!me?.active) return json({ error: 'Usuário desativado.' }, 403);

  const { action, event_id, google_event_id } = await req.json().catch(() => ({}));
  const base = `${API}/calendars/${encodeURIComponent(calendarId)}/events`;
  try {
    const headers = { Authorization: `Bearer ${await accessToken(sa)}`, 'Content-Type': 'application/json' };

    if (action === 'delete') {
      if (google_event_id) {
        const res = await fetch(`${base}/${encodeURIComponent(String(google_event_id))}`, { method: 'DELETE', headers });
        if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`Google Agenda ${res.status}: ${await res.text()}`);
      }
      return json({ ok: true });
    }

    const { data: ev } = await db.from('events').select('*').eq('id', event_id).single<EventRow>();
    if (!ev) return json({ error: 'Reunião não encontrada.' }, 404);
    const { data: people } = await db.from('profiles').select('name').in('id', ev.participant_ids ?? []);
    const body = JSON.stringify(googleBody(ev, (people ?? []).map((p: { name: string }) => p.name)));

    let gid: string | null = null;
    if (ev.google_event_id) {
      const res = await fetch(`${base}/${encodeURIComponent(ev.google_event_id)}`, { method: 'PATCH', headers, body });
      if (res.ok) gid = (await res.json()).id;
      else if (res.status !== 404 && res.status !== 410) throw new Error(`Google Agenda ${res.status}: ${await res.text()}`);
    }
    if (!gid) {
      const res = await fetch(base, { method: 'POST', headers, body });
      if (!res.ok) throw new Error(`Google Agenda ${res.status}: ${await res.text()}`);
      gid = (await res.json()).id;
    }
    if (gid !== ev.google_event_id) await db.from('events').update({ google_event_id: gid }).eq('id', ev.id);
    return json({ ok: true, google_event_id: gid });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : 'Falha ao sincronizar.' }, 502);
  }
});
