// Sincronização com o Google Agenda usando uma conta de serviço do Google Cloud.
// A agenda do escritório precisa estar compartilhada com o e-mail da conta de serviço
// com a permissão "Fazer alterações nos eventos".

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

interface SyncableEvent {
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  google_event_id: string | null;
}

const API = 'https://www.googleapis.com/calendar/v3';

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`)));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${b64url(signature)}`,
    }),
  });
  if (!res.ok) throw new Error(`Google OAuth ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

export class GoogleCalendar {
  private token: Promise<string> | null = null;
  constructor(private sa: ServiceAccount, private calendarId: string, private tz: string) {}

  /** Retorna null se as variáveis de ambiente não estiverem configuradas. */
  static fromEnv(tz: string): GoogleCalendar | null {
    const json = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    const calendarId = Deno.env.get('GOOGLE_CALENDAR_ID');
    if (!json || !calendarId) return null;
    try {
      return new GoogleCalendar(JSON.parse(json), calendarId, tz);
    } catch {
      return null;
    }
  }

  private async headers() {
    this.token ??= accessToken(this.sa);
    return { Authorization: `Bearer ${await this.token}`, 'Content-Type': 'application/json' };
  }

  private body(ev: SyncableEvent, participantNames: string[]) {
    const people = participantNames.length ? `Participantes: ${participantNames.join(', ')}` : '';
    const description = [ev.description, people].filter(Boolean).join('\n\n');
    if (ev.all_day) {
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: this.tz }).format(new Date(ev.starts_at));
      const next = new Date(`${day}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      return { summary: ev.title, description, location: ev.location ?? undefined, start: { date: day }, end: { date: next.toISOString().slice(0, 10) } };
    }
    const end = ev.ends_at ?? new Date(new Date(ev.starts_at).getTime() + 3_600_000).toISOString();
    return {
      summary: ev.title,
      description,
      location: ev.location ?? undefined,
      start: { dateTime: ev.starts_at, timeZone: this.tz },
      end: { dateTime: end, timeZone: this.tz },
    };
  }

  /** Cria ou atualiza o evento no Google e devolve o id do evento no Google. */
  async upsert(ev: SyncableEvent, participantNames: string[]): Promise<string> {
    const base = `${API}/calendars/${encodeURIComponent(this.calendarId)}/events`;
    const body = JSON.stringify(this.body(ev, participantNames));
    if (ev.google_event_id) {
      const res = await fetch(`${base}/${encodeURIComponent(ev.google_event_id)}`, { method: 'PATCH', headers: await this.headers(), body });
      if (res.ok) return (await res.json()).id;
      if (res.status !== 404 && res.status !== 410) throw new Error(`Google Agenda ${res.status}: ${await res.text()}`);
    }
    const res = await fetch(base, { method: 'POST', headers: await this.headers(), body });
    if (!res.ok) throw new Error(`Google Agenda ${res.status}: ${await res.text()}`);
    return (await res.json()).id;
  }

  async remove(googleEventId: string): Promise<void> {
    const res = await fetch(`${API}/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(googleEventId)}`, {
      method: 'DELETE',
      headers: await this.headers(),
    });
    if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`Google Agenda ${res.status}: ${await res.text()}`);
  }
}
