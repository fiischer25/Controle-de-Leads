// Espelha no Google Agenda do escritório as reuniões criadas/alteradas pelo sistema.
// Deploy: supabase functions deploy calendar-sync
// Segredos: GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_CALENDAR_ID (opcional: AGENT_TIMEZONE).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { adminClient, TIMEZONE } from '../_shared/agent/service.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { GoogleCalendar } from '../_shared/google-calendar.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const gc = GoogleCalendar.fromEnv(TIMEZONE);
  if (!gc) return json({ skipped: 'Google Agenda não configurado.' });

  const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await caller.auth.getUser();
  if (!auth.user) return json({ error: 'Não autenticado.' }, 401);
  const db = adminClient();
  const { data: me } = await db.from('profiles').select('active').eq('id', auth.user.id).single();
  if (!me?.active) return json({ error: 'Usuário desativado.' }, 403);

  const { action, event_id, google_event_id } = await req.json().catch(() => ({}));
  try {
    if (action === 'delete') {
      if (google_event_id) await gc.remove(String(google_event_id));
      return json({ ok: true });
    }
    const { data: ev } = await db.from('events').select('*').eq('id', event_id).single();
    if (!ev) return json({ error: 'Reunião não encontrada.' }, 404);
    const { data: people } = await db.from('profiles').select('id, name').in('id', ev.participant_ids ?? []);
    const gid = await gc.upsert(ev, (people ?? []).map((p: { name: string }) => p.name));
    if (gid !== ev.google_event_id) await db.from('events').update({ google_event_id: gid }).eq('id', ev.id);
    return json({ ok: true, google_event_id: gid });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : 'Falha ao sincronizar.' }, 502);
  }
});
