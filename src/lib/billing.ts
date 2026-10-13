// Lembretes de cobrança no WhatsApp: quais parcelas a receber ganham lembrete em cada dia
// (alguns dias antes, no dia e alguns dias depois do vencimento) e o texto da mensagem.
// Só em dias úteis (segunda a sexta); se um dia falhar, o lembrete ainda sai até 2 dias depois.
// A função whatsapp-alerts (Supabase) repete estas regras ao enviar: mantenha as duas iguais.
// Funções puras (sem React nem banco).

export type ReminderKind = 'antes' | 'no_dia' | 'depois';

export interface BillingSettings {
  enabled: boolean;
  /** Dias antes do vencimento (0 = não envia). */
  daysBefore: number;
  onDue: boolean;
  /** Dias depois do vencimento (0 = não envia). */
  daysAfter: number;
  /** Como pagar (PIX, conta…). Vazio: "se já pagou, desconsidere". */
  paymentInfo: string;
}

export interface BillingEntry {
  id: string;
  kind: string;
  amount: number;
  due_date: string;
  paid_at: string | null;
  description: string;
  client_id: string | null;
  lead_id?: string | null;
}

export const REMINDER_LABEL: Record<ReminderKind | 'manual', string> = {
  antes: 'Antes do vencimento',
  no_dia: 'No dia',
  depois: 'Depois do vencimento',
  manual: 'Cobrança pelo botão',
};

/** Janela para recuperar um lembrete que não saiu no dia (fim de semana, falha). */
const CATCH_UP = 2;

function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function weekday(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const isBusinessDay = (key: string) => weekday(key) !== 0 && weekday(key) !== 6;

/** Chave do registro de envio: a mesma parcela recebe cada lembrete uma vez por vencimento. */
export const reminderKey = (entryId: string, kind: string, due: string) => `${entryId}|${kind}|${due}`;

/** Data prevista de cada lembrete da parcela. */
export function reminderDates(due: string, s: BillingSettings): Array<{ kind: ReminderKind; date: string }> {
  const out: Array<{ kind: ReminderKind; date: string }> = [];
  if (s.daysBefore > 0) out.push({ kind: 'antes', date: addDays(due, -s.daysBefore) });
  if (s.onDue) out.push({ kind: 'no_dia', date: due });
  if (s.daysAfter > 0) out.push({ kind: 'depois', date: addDays(due, s.daysAfter) });
  return out;
}

/** O lembrete pode sair hoje? Dia útil, dentro da janela e ainda fazendo sentido (o "antes" não sai depois do vencimento). */
function sendableOn(kind: ReminderKind, date: string, due: string, today: string): boolean {
  if (!isBusinessDay(today)) return false;
  if (kind === 'no_dia') return today === due;
  if (today < date || today > addDays(date, CATCH_UP)) return false;
  return kind === 'antes' ? today < due : true;
}

/** Lembretes que saem hoje: parcelas a receber em aberto, ainda não lembradas. */
export function dueReminders<E extends BillingEntry>(entries: E[], s: BillingSettings, today: string, sent: Set<string>): Array<{ entry: E; kind: ReminderKind }> {
  if (!s.enabled) return [];
  const out: Array<{ entry: E; kind: ReminderKind }> = [];
  for (const e of entries) {
    if (e.kind !== 'receita' || e.paid_at || !(e.amount > 0)) continue;
    // Um lembrete por parcela por dia: o mais recente da régua
    const ready = reminderDates(e.due_date, s).filter((r) => sendableOn(r.kind, r.date, e.due_date, today) && !sent.has(reminderKey(e.id, r.kind, e.due_date)));
    if (ready.length) out.push({ entry: e, kind: ready[ready.length - 1].kind });
  }
  return out;
}

/** Próximos lembretes (a partir de hoje, até `days` dias), na data em que devem sair (próximo dia útil). */
export function upcomingReminders<E extends BillingEntry>(
  entries: E[],
  s: BillingSettings,
  today: string,
  days: number,
  sent: Set<string>,
): Array<{ entry: E; kind: ReminderKind; date: string }> {
  const until = addDays(today, days);
  const out: Array<{ entry: E; kind: ReminderKind; date: string }> = [];
  for (const e of entries) {
    if (e.kind !== 'receita' || e.paid_at || !(e.amount > 0)) continue;
    for (const r of reminderDates(e.due_date, s)) {
      if (sent.has(reminderKey(e.id, r.kind, e.due_date))) continue;
      // Primeiro dia, de hoje em diante, em que este lembrete pode sair
      const last = addDays(r.date, CATCH_UP) < until ? addDays(r.date, CATCH_UP) : until;
      for (let day = r.date < today ? today : r.date; day <= last; day = addDays(day, 1)) {
        if (sendableOn(r.kind, r.date, e.due_date, day)) {
          out.push({ entry: e, kind: r.kind, date: day });
          break;
        }
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.entry.due_date.localeCompare(b.entry.due_date));
}

const short = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;

/** "vence em 15/10", "vence hoje", "venceu em 05/10". */
export function duePhrase(due: string, today: string): string {
  if (due === today) return 'vence hoje';
  if (due === addDays(today, 1)) return `vence amanhã (${short(due)})`;
  return due > today ? `vence em ${short(due)}` : `venceu em ${short(due)}`;
}

export const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Parâmetros do modelo aprovado na Meta, na ordem {{1}}…{{6}}. */
export function templateParams(o: { clientName: string; amount: number; description: string; due: string; today: string; paymentInfo: string; officeName: string }): string[] {
  return [
    o.clientName.trim().split(/\s+/)[0] || 'tudo bem',
    money(o.amount),
    o.description.trim() || 'honorários do projeto',
    duePhrase(o.due, o.today),
    o.paymentInfo.trim() || 'Se o pagamento já foi feito, por favor desconsidere esta mensagem.',
    o.officeName.trim() || 'do escritório',
  ];
}

/** Nome e corpo do modelo que o escritório cadastra na Meta (categoria Utilidade). */
export const BILLING_TEMPLATE_NAME = 'lembrete_cobranca';
export const BILLING_TEMPLATE_BODY =
  'Olá, {{1}}! Passando para lembrar da parcela de {{2}} referente a {{3}}, que {{4}}. {{5}}\n\nQualquer dúvida, é só responder esta mensagem. Equipe {{6}}.';

/** Mensagem completa (o mesmo texto do modelo, já preenchido). */
export function billingMessage(o: Parameters<typeof templateParams>[0]): string {
  const p = templateParams(o);
  return BILLING_TEMPLATE_BODY.replace(/\{\{(\d)\}\}/g, (_, i) => p[Number(i) - 1]);
}

/** Link do WhatsApp com a mensagem pronta (envio à mão, sem a API da Meta). */
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const d = (phone ?? '').replace(/\D/g, '');
  if (d.length < 10) return null;
  const to = d.startsWith('55') && d.length >= 12 ? d : `55${d}`;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}
