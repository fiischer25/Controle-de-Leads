// Datas no fuso do escritório (padrão America/Sao_Paulo), sem dependências externas.

function parts(utcMs: number, tz: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
  const out: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) out[p.type] = p.value;
  return out;
}

function offsetMinutes(utcMs: number, tz: string): number {
  const p = parts(utcMs, tz);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - utcMs) / 60000);
}

/** 'YYYY-MM-DD' + 'HH:MM' no fuso `tz` → ISO UTC. */
export function zonedToIso(date: string, time: string, tz: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  let utc = naive - offsetMinutes(naive, tz) * 60000;
  utc = naive - offsetMinutes(utc, tz) * 60000;
  return new Date(utc).toISOString();
}

/** ISO → { date: 'YYYY-MM-DD', time: 'HH:MM' } no fuso `tz`. */
export function isoToZoned(iso: string, tz: string): { date: string; time: string } {
  const p = parts(new Date(iso).getTime(), tz);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export function todayIn(tz: string, now = new Date()): string {
  return isoToZoned(now.toISOString(), tz).date;
}

export function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export function weekdayName(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function isDateKey(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

export function isTime(v: unknown): v is string {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

export function formatBr(key: string | null | undefined): string {
  if (!key) return 'sem prazo';
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}
