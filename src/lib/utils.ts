export function cn(...classes: Array<string | false | null | undefined | 0>): string {
  return classes.filter(Boolean).join(' ');
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Datas. Datas "de calendário" são strings 'YYYY-MM-DD' no fuso local.
// ---------------------------------------------------------------------------

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function today(): string {
  return toDateKey(new Date());
}

export function parseDate(key: string): Date {
  const [y, m, d] = key.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, days: number): string {
  const d = parseDate(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function isWeekend(key: string): boolean {
  const day = parseDate(key).getDay();
  return day === 0 || day === 6;
}

/** Próximo dia útil a partir de `key` (inclusive). */
export function nextBusinessDay(key: string): string {
  let k = key;
  while (isWeekend(k)) k = addDays(k, 1);
  return k;
}

/** Soma `days` dias úteis. addBusinessDays(seg, 1) = ter. */
export function addBusinessDays(key: string, days: number): string {
  let k = nextBusinessDay(key);
  let left = days;
  while (left > 0) {
    k = addDays(k, 1);
    if (!isWeekend(k)) left--;
  }
  return k;
}

/** Diferença em dias de calendário: b - a. */
export function diffDays(a: string, b: string): number {
  const ms = parseDate(b).getTime() - parseDate(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function startOfWeek(key: string): string {
  const d = parseDate(key);
  const day = (d.getDay() + 6) % 7; // segunda = 0
  d.setDate(d.getDate() - day);
  return toDateKey(d);
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MONTHS_FULL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function formatDate(key: string | null | undefined): string {
  if (!key) return '—';
  const d = parseDate(key);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function formatDateShort(key: string | null | undefined): string {
  if (!key) return '—';
  const d = parseDate(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${formatDate(toDateKey(d))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `há ${d} dia${d > 1 ? 's' : ''}`;
  return formatDate(toDateKey(new Date(iso)));
}

/** Texto amigável para prazos: "vence hoje", "vence em 3 dias", "atrasado 2 dias". */
export function dueLabel(key: string | null): string {
  if (!key) return 'Sem prazo';
  const d = diffDays(today(), key);
  if (d === 0) return 'Vence hoje';
  if (d === 1) return 'Vence amanhã';
  if (d > 1) return `Vence em ${d} dias`;
  if (d === -1) return 'Venceu ontem';
  return `Atrasado ${-d} dias`;
}

export type DeadlineState = 'none' | 'ok' | 'soon' | 'today' | 'overdue' | 'done';

export function deadlineState(due: string | null, done: boolean, soonDays: number): DeadlineState {
  if (done) return 'done';
  if (!due) return 'none';
  const d = diffDays(today(), due);
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d <= soonDays) return 'soon';
  return 'ok';
}

// ---------------------------------------------------------------------------
// Números e textos
// ---------------------------------------------------------------------------

const currencyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
export function formatCurrency(v: number | null | undefined): string {
  if (v == null) return '—';
  return currencyFmt.format(v);
}

export function formatNumber(v: number | null | undefined, digits = 0): string {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { maximumFractionDigits: digits });
}

export function formatMinutes(total: number): string {
  const m = Math.round(total);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}min`;
  if (r === 0) return `${h}h`;
  return `${h}h ${String(r).padStart(2, '0')}min`;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Sugere o nome do projeto a partir do cliente: "João Dias" → "CASA J.D." */
export function suggestProjectName(clientName: string, prefix = 'CASA'): string {
  const stop = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  const letters = clientName
    .trim()
    .split(/\s+/)
    .filter((p) => p && !stop.has(p.toLowerCase()))
    .map((p) => p[0].toUpperCase());
  const picked = letters.length > 2 ? [letters[0], letters[letters.length - 1]] : letters;
  return `${prefix} ${picked.map((l) => `${l}.`).join('')}`.trim();
}

export function normalize(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function matches(query: string, ...fields: Array<string | null | undefined>): boolean {
  const q = normalize(query).trim();
  if (!q) return true;
  return fields.some((f) => normalize(f).includes(q));
}

export function groupBy<T, K extends string>(items: T[], key: (item: T) => K): Record<K, T[]> {
  return items.reduce(
    (acc, item) => {
      const k = key(item);
      (acc[k] ||= []).push(item);
      return acc;
    },
    {} as Record<K, T[]>,
  );
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function byPosition<T extends { position: number }>(a: T, b: T): number {
  return a.position - b.position;
}

export function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

export function maskPhone(v: string): string {
  const d = digitsOnly(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function maskCep(v: string): string {
  const d = digitsOnly(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function maskDocument(v: string): string {
  const d = digitsOnly(v).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function isValidCpf(value: string): boolean {
  const cpf = digitsOnly(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const calc = (len: number) => {
    let total = 0;
    for (let i = 0; i < len; i++) total += Number(cpf[i]) * (len + 1 - i);
    const r = (total * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

export function isValidCnpj(value: string): boolean {
  const cnpj = digitsOnly(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const total = weights.reduce((acc, w, i) => acc + Number(cnpj[i]) * w, 0);
    const r = total % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

export function isValidDocument(value: string): boolean {
  const d = digitsOnly(value);
  return d.length === 11 ? isValidCpf(d) : isValidCnpj(d);
}

export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export function downloadFile(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Separador ";" para abrir corretamente no Excel em pt-BR; BOM para acentuação.
  return '﻿' + [headers.join(';'), ...rows.map((r) => headers.map((h) => esc(r[h])).join(';'))].join('\n');
}

/**
 * Converte o link de compartilhamento/iframe do Google Agenda em uma URL de embed.
 * Aceita: o código <iframe> completo, a URL de embed, ou apenas o ID da agenda (e-mail).
 */
export function toCalendarEmbedUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;
  const srcMatch = raw.match(/src="([^"]+)"/);
  const candidate = srcMatch ? srcMatch[1].replace(/&amp;/g, '&') : raw;
  if (/^https:\/\/calendar\.google\.com\//.test(candidate)) {
    if (candidate.includes('/embed')) return candidate;
    const cid = new URL(candidate).searchParams.get('cid') ?? new URL(candidate).searchParams.get('src');
    if (cid) return buildCalendarEmbed(cid);
    return candidate;
  }
  if (/^[^\s@]+@[^\s@]+$/.test(candidate)) return buildCalendarEmbed(candidate);
  return null;
}

function buildCalendarEmbed(calendarId: string): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
  const params = new URLSearchParams({
    src: calendarId,
    ctz: tz,
    mode: 'WEEK',
    showTitle: '0',
    showPrint: '0',
    showTabs: '1',
    showCalendars: '0',
    hl: 'pt_BR',
  });
  return `https://calendar.google.com/calendar/embed?${params.toString()}`;
}
