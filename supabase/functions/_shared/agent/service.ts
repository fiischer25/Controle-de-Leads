// Liga o assistente aos serviços reais: Supabase (service role), Claude, WhatsApp e Google Agenda.
import Anthropic from 'npm:@anthropic-ai/sdk@0.129.0';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { GoogleCalendar } from '../google-calendar.ts';
import { samePhone, toWhatsAppNumber } from '../phone.ts';
import { sendText, type WhatsAppConfig } from '../whatsapp.ts';
import { runAgent, type HistoryTurn } from './run.ts';
import { SupabaseStore } from './supabase-store.ts';
import type { CalendarSync, Profile } from './tools.ts';

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function whatsappConfig(): WhatsAppConfig | null {
  const token = Deno.env.get('WHATSAPP_TOKEN');
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  return token && phoneNumberId ? { token, phoneNumberId } : null;
}

export const TIMEZONE = Deno.env.get('AGENT_TIMEZONE') || 'America/Sao_Paulo';

export async function findProfileByPhone(db: SupabaseClient, phone: string): Promise<Profile | null> {
  const { data } = await db.from('profiles').select('*').eq('active', true);
  return ((data ?? []) as Profile[]).find((p) => samePhone(p.phone, phone)) ?? null;
}

function calendarSync(): CalendarSync | null {
  const gc = GoogleCalendar.fromEnv(TIMEZONE);
  if (!gc) return null;
  return {
    upsert: (ev, participants) => gc.upsert(ev, participants.map((p) => p.name)),
    remove: (id) => gc.remove(id),
  };
}

/** Processa uma mensagem de um membro e devolve a resposta do assistente (e grava o histórico). */
export async function handleMessage(opts: {
  db: SupabaseClient;
  me: Profile;
  text: string;
  channel: 'whatsapp' | 'app';
  waMessageId?: string;
}): Promise<string> {
  const { db, me, text, channel } = opts;

  // Evita processar duas vezes a mesma mensagem (o WhatsApp reenvia webhooks)
  const { error: dupError } = await db.from('agent_messages').insert({
    user_id: me.id, channel, role: 'user', content: text, wa_message_id: opts.waMessageId ?? null,
  });
  if (dupError) {
    if (dupError.code === '23505') return '';
    throw new Error(dupError.message);
  }

  const since = new Date(Date.now() - 12 * 3_600_000).toISOString();
  const { data: rows } = await db
    .from('agent_messages')
    .select('role, content, created_at')
    .eq('user_id', me.id)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(13);
  // A mensagem atual é a mais recente; o histórico são as anteriores
  const history = ((rows ?? []) as HistoryTurn[]).slice(1).reverse();

  const { data: settings } = await db.from('app_settings').select('office_name').eq('id', 'office').maybeSingle();
  const officeName = settings?.office_name ?? 'AIROS Arquitetura';
  const wa = whatsappConfig();

  const result = await runAgent({
    anthropic: new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') }),
    officeName,
    history,
    text,
    effort: (Deno.env.get('AGENT_EFFORT') as 'low' | 'medium' | 'high' | undefined) ?? 'low',
    ctx: {
      store: new SupabaseStore(db),
      me,
      tz: TIMEZONE,
      now: new Date(),
      appUrl: Deno.env.get('APP_URL') ?? null,
      calendar: calendarSync(),
      // Aviso por WhatsApp para quem recebeu tarefa/reunião (só chega se a pessoa
      // tiver falado com o número do escritório nas últimas 24h — regra da Meta).
      pingWhatsApp: wa
        ? async (to, message) => {
            const number = to.phone ? toWhatsAppNumber(to.phone) : null;
            if (number) await sendText(wa, number, message);
          }
        : undefined,
    },
  });

  await db.from('agent_messages').insert({ user_id: me.id, channel, role: 'assistant', content: result.reply });
  return result.reply;
}
