import { useMemo, useState } from 'react';
import { MessageCircle, PauseCircle, PlayCircle, Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { backend } from '../../lib/backend';
import {
  BILLING_TEMPLATE_BODY,
  BILLING_TEMPLATE_NAME,
  billingMessage,
  duePhrase,
  REMINDER_LABEL,
  reminderKey,
  upcomingReminders,
  whatsappLink,
  type BillingSettings,
} from '../../lib/billing';
import type { AppSettings, FinanceEntry } from '../../lib/types';
import { cn, digitsOnly, formatDateShort, formatMoney, nowIso, today, uid } from '../../lib/utils';
import { Badge, Button, Checkbox, Field, IconButton, SectionHeader, Select, Switch, Textarea } from '../ui';
import { CopyField, Step } from '../../pages/settings/WhatsAppSettings';

type Fields = Pick<AppSettings, 'billing_enabled' | 'billing_days_before' | 'billing_on_due' | 'billing_days_after' | 'billing_hour' | 'billing_payment_info'>;

const pick = (s: AppSettings): Fields => ({
  billing_enabled: s.billing_enabled ?? false,
  billing_days_before: s.billing_days_before ?? 3,
  billing_on_due: s.billing_on_due ?? true,
  billing_days_after: s.billing_days_after ?? 3,
  billing_hour: s.billing_hour ?? 9,
  billing_payment_info: s.billing_payment_info ?? '',
});
const toRules = (v: Fields): BillingSettings => ({
  enabled: !!v.billing_enabled,
  daysBefore: v.billing_days_before ?? 0,
  onDue: !!v.billing_on_due,
  daysAfter: v.billing_days_after ?? 0,
  paymentInfo: v.billing_payment_info ?? '',
});

const STATUS: Record<string, { label: string; tone: 'success' | 'danger' | 'warning' | 'info' }> = {
  enviado: { label: 'Enviado', tone: 'success' },
  manual: { label: 'Enviado à mão', tone: 'info' },
  erro: { label: 'Erro', tone: 'danger' },
  pendente: { label: 'Enviando', tone: 'warning' },
};

/**
 * Financeiro → Cobrança: lembretes automáticos no WhatsApp para o cliente (antes, no dia e
 * depois do vencimento), próximos lembretes, parcelas vencidas para cobrar à mão e o histórico.
 */
export function FinanceBilling() {
  const { mode } = useAuth();
  const { db, maps, me, settings, can, patch, insertRows, updateClient } = useData();
  const toast = useToast();
  const local = mode === 'local';
  const canEdit = can('configuracoes');
  const [v, setV] = useState<Fields>(() => pick(settings));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(pick(settings));
  const set = <K extends keyof Fields>(k: K, value: Fields[K]) => setV((prev) => ({ ...prev, [k]: value }));
  const t = today();
  const rules = toRules(v);

  // Quem recebe: o cliente da parcela ou, sem cliente, a oportunidade de onde ela veio
  const who = (e: FinanceEntry) => {
    const client = e.client_id ? maps.clients[e.client_id] : null;
    const lead = e.lead_id ? maps.leads[e.lead_id] : null;
    return { client, name: client?.name ?? lead?.name ?? 'Sem cliente', phone: client?.phone || lead?.phone || '', paused: client?.billing_reminders === false };
  };
  const open = useMemo(() => db.finance_entries.filter((e) => e.kind === 'receita' && !e.paid_at && e.amount > 0), [db.finance_entries]);
  const sent = useMemo(
    () => new Set(db.billing_reminder_log.filter((l) => l.kind !== 'manual').map((l) => reminderKey(l.entry_id, l.kind, l.due_date))),
    [db.billing_reminder_log],
  );
  const upcoming = useMemo(() => upcomingReminders(open, { ...rules, enabled: true }, t, 14, sent), [open, rules.daysBefore, rules.onDue, rules.daysAfter, t, sent]); // eslint-disable-line react-hooks/exhaustive-deps
  const overdue = open.filter((e) => e.due_date < t).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const log = [...db.billing_reminder_log].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30);

  const message = (e: FinanceEntry) =>
    billingMessage({ clientName: who(e).name, amount: e.amount, description: e.description, due: e.due_date, today: t, paymentInfo: v.billing_payment_info ?? '', officeName: settings.office_name });
  const sample = upcoming[0]?.entry ?? overdue[0] ?? null;
  const preview = sample
    ? message(sample)
    : billingMessage({ clientName: 'Juliana', amount: 1500, description: 'Honorários CASA J.D. · 2ª parcela', due: t, today: t, paymentInfo: v.billing_payment_info ?? '', officeName: settings.office_name });

  const save = async () => {
    setSaving(true);
    try {
      if (db.app_settings.length) await patch('app_settings', 'office', v);
      else await insertRows('app_settings', [{ ...settings, ...v, updated_at: nowIso() }]);
      toast.success(v.billing_enabled ? 'Lembretes de cobrança ligados.' : 'Configurações salvas.');
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      await backend.invokeFunction('whatsapp-alerts', { action: 'billing_test' });
      toast.success('Lembrete de exemplo enviado para o seu WhatsApp.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(/Failed to send a request|FunctionsFetchError|not found|404/i.test(msg) ? 'Publique de novo a função whatsapp-alerts (passo 3 abaixo).' : msg);
    } finally {
      setTesting(false);
    }
  };

  const chargeNow = async (e: FinanceEntry) => {
    const link = whatsappLink(who(e).phone, message(e));
    if (!link) return;
    window.open(link, '_blank', 'noopener');
    try {
      await insertRows('billing_reminder_log', [
        { id: uid(), entry_id: e.id, kind: 'manual', due_date: e.due_date, status: 'manual', detail: null, phone: digitsOnly(who(e).phone), sent_by: me.id, created_at: nowIso() },
      ]);
    } catch {
      /* sem a migração: o WhatsApp abre mesmo assim, só não fica no histórico */
    }
  };

  const togglePause = async (clientId: string, paused: boolean) => {
    try {
      await updateClient(clientId, { billing_reminders: paused });
      toast.success(paused ? 'Lembretes retomados para este cliente.' : 'Este cliente não recebe mais lembretes automáticos.');
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="space-y-8">
        {/* Configuração */}
        <section aria-labelledby="cobranca-config" className="rounded-[16px] border border-line bg-surface p-5 shadow-card md:p-6">
          <SectionHeader id="cobranca-config" title="Lembretes de cobrança no WhatsApp" />
          <p className="-mt-2 text-[13px] leading-relaxed text-muted">
            O cliente recebe um lembrete da parcela em aberto antes, no dia e depois do vencimento, só em dias úteis. Os lembretes param quando a
            parcela é marcada como recebida.
          </p>
          <div className="mt-5 space-y-5 border-t border-hairline-surface pt-5">
            <Switch checked={!!v.billing_enabled} onChange={(on) => set('billing_enabled', on)} label="Enviar lembretes de cobrança aos clientes" disabled={!canEdit} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Antes do vencimento">
                <Select value={String(v.billing_days_before)} onChange={(e) => set('billing_days_before', Number(e.target.value))} disabled={!canEdit} aria-label="Dias antes do vencimento">
                  <option value="0">Não enviar</option>
                  {[1, 2, 3, 5, 7, 10].map((d) => (
                    <option key={d} value={String(d)}>
                      {d} {d === 1 ? 'dia antes' : 'dias antes'}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Depois do vencimento">
                <Select value={String(v.billing_days_after)} onChange={(e) => set('billing_days_after', Number(e.target.value))} disabled={!canEdit} aria-label="Dias depois do vencimento">
                  <option value="0">Não enviar</option>
                  {[1, 2, 3, 5, 7, 10, 15].map((d) => (
                    <option key={d} value={String(d)}>
                      {d} {d === 1 ? 'dia depois' : 'dias depois'}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Horário">
                <Select value={String(v.billing_hour)} onChange={(e) => set('billing_hour', Number(e.target.value))} disabled={!canEdit} aria-label="Horário dos lembretes">
                  {Array.from({ length: 12 }, (_, i) => i + 8).map((h) => (
                    <option key={h} value={String(h)}>
                      {String(h).padStart(2, '0')}:00
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Checkbox checked={!!v.billing_on_due} onChange={(on) => set('billing_on_due', on)} label="Enviar também no dia do vencimento" disabled={!canEdit} />
            <Field label="Como pagar" hint="Vai no lembrete. Vazio: “Se o pagamento já foi feito, por favor desconsidere esta mensagem.”">
              <Textarea
                rows={2}
                value={v.billing_payment_info ?? ''}
                onChange={(e) => set('billing_payment_info', e.target.value)}
                placeholder="Ex.: PIX (CNPJ) 12.345.678/0001-90 · Airos Arquitetura"
                disabled={!canEdit}
              />
            </Field>
            <div>
              <div className="label">Como chega para o cliente</div>
              <pre className="mt-1 max-w-lg whitespace-pre-wrap rounded-xl rounded-tl-xs bg-canvas px-4 py-3 font-sans text-[13px] leading-relaxed text-stone-700" data-billing-preview>
                {preview}
              </pre>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <Button variant="primary" loading={saving} disabled={!dirty} onClick={save}>
                  Salvar
                </Button>
              )}
              <Button variant="ghost" icon={<Send className="h-4 w-4" />} loading={testing} disabled={local} onClick={test}>
                Enviar exemplo para mim
              </Button>
            </div>
            <p className="text-xs text-stone-400">
              {local
                ? 'No modo demonstração nada é enviado: os lembretes saem pelo servidor (Supabase + WhatsApp Business).'
                : !canEdit
                  ? 'Só quem tem acesso às Configurações altera os lembretes.'
                  : 'Clientes sem telefone no cadastro não recebem. Dá para pausar um cliente na lista ao lado.'}
            </p>
          </div>
        </section>

        {/* Vencidas */}
        <section aria-labelledby="cobranca-vencidas" className="panel">
          <SectionHeader id="cobranca-vencidas" title="Vencidas: cobrar agora" aside={<span className="text-[12.5px] text-faint">abre o WhatsApp com a mensagem pronta</span>} />
          {overdue.length === 0 ? (
            <p className="border-t border-hairline pt-4 text-[13px] text-faint">Nenhuma parcela vencida. 👏</p>
          ) : (
            <ul className="divide-y divide-hairline border-t border-hairline">
              {overdue.map((e) => {
                const w = who(e);
                const link = whatsappLink(w.phone, '');
                return (
                  <li key={e.id} className="flex items-center gap-3 py-3" data-overdue-entry={e.id}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] text-ink">{w.name}</div>
                      <div className="truncate text-[12px] text-faint">
                        {e.description} · <span className="text-danger-fg">{duePhrase(e.due_date, t)}</span>
                      </div>
                    </div>
                    <span className="shrink-0 text-[13.5px] font-medium tabular text-ink">{formatMoney(e.amount)}</span>
                    <Button size="sm" icon={<MessageCircle className="h-3.5 w-3.5" />} disabled={!link} onClick={() => chargeNow(e)} title={link ? undefined : 'Cliente sem telefone'}>
                      Cobrar
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="cobranca-ativar" className="rounded-[16px] border border-line bg-surface p-5 shadow-card md:p-6">
          <SectionHeader id="cobranca-ativar" title="Como ativar os lembretes automáticos" />
          <ol>
            <Step n={1} title="Banco de dados">
              <p>
                Em Configurações → Banco de dados, aplique <b>Lembretes de cobrança</b> (migração{' '}
                <code className="rounded bg-canvas px-1">20261021000000_billing_reminders.sql</code>).
              </p>
            </Step>
            <Step n={2} title="Modelo de mensagem na Meta">
              <p>
                No WhatsApp Manager → <b>Modelos de mensagem</b> → Criar modelo: categoria <b>Utilidade</b>, idioma <b>Português (BR)</b>, este nome e
                este corpo:
              </p>
              <CopyField label="Nome do modelo" value={BILLING_TEMPLATE_NAME} />
              <CopyField label="Corpo" value={BILLING_TEMPLATE_BODY} />
              <p>
                Exemplos: {'{{1}}'} = Juliana; {'{{2}}'} = R$ 1.500,00; {'{{3}}'} = Honorários CASA J.D. · 2ª parcela; {'{{4}}'} = vence em 15/10;{' '}
                {'{{5}}'} = PIX (CNPJ) 12.345.678/0001-90; {'{{6}}'} = {settings.office_name || 'Airos Arquitetura'}.
              </p>
            </Step>
            <Step n={3} title="Publicar de novo a função whatsapp-alerts">
              <p>
                Cole a versão nova de <code className="rounded bg-canvas px-1">supabase/functions/whatsapp-alerts/index.ts</code> na função
                whatsapp-alerts. O agendamento de hora em hora do resumo diário já serve para os lembretes; se ainda não existe, siga os passos em
                Configurações → Resumo diário.
              </p>
            </Step>
          </ol>
        </section>
      </div>

      <div className="space-y-8">
        {/* Próximos */}
        <section aria-labelledby="cobranca-proximos" className="panel">
          <SectionHeader id="cobranca-proximos" title="Próximos lembretes" aside={<span className="text-[12.5px] text-faint">14 dias</span>} />
          {upcoming.length === 0 ? (
            <p className="border-t border-hairline pt-4 text-[13px] text-faint">Nenhum lembrete nos próximos 14 dias.</p>
          ) : (
            <ul className="divide-y divide-hairline border-t border-hairline">
              {upcoming.map(({ entry: e, kind, date }) => {
                const w = who(e);
                const noPhone = digitsOnly(w.phone).length < 10;
                return (
                  <li key={`${e.id}-${kind}`} className={cn('flex items-center gap-3 py-3', (w.paused || noPhone) && 'opacity-60')} data-upcoming={kind}>
                    <span className="w-12 shrink-0 text-[12px] tabular text-faint">{date === t ? 'hoje' : formatDateShort(date)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] text-ink">
                        {w.name} · <span className="tabular">{formatMoney(e.amount)}</span>
                      </div>
                      <div className="truncate text-[12px] text-faint">
                        {REMINDER_LABEL[kind]} · {w.paused ? 'pausado para este cliente' : noPhone ? 'cliente sem telefone' : duePhrase(e.due_date, date)}
                      </div>
                    </div>
                    {w.client && (
                      <IconButton
                        size="xs"
                        label={w.paused ? `Retomar lembretes de ${w.name}` : `Pausar lembretes de ${w.name}`}
                        onClick={() => togglePause(w.client!.id, w.paused)}
                      >
                        {w.paused ? <PlayCircle className="h-4 w-4" strokeWidth={1.6} /> : <PauseCircle className="h-4 w-4" strokeWidth={1.6} />}
                      </IconButton>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {!v.billing_enabled && upcoming.length > 0 && (
            <p className="mt-3 text-[12.5px] text-warning-fg">Os lembretes estão desligados: nada disto será enviado até você ligar acima.</p>
          )}
        </section>

        {/* Histórico */}
        <section aria-labelledby="cobranca-enviados" className="panel">
          <SectionHeader id="cobranca-enviados" title="Enviados" aside={<span className="text-[12.5px] text-faint">últimos 30</span>} />
          {log.length === 0 ? (
            <p className="border-t border-hairline pt-4 text-[13px] text-faint">Nenhum lembrete enviado ainda.</p>
          ) : (
            <ul className="divide-y divide-hairline border-t border-hairline">
              {log.map((l) => {
                const e = db.finance_entries.find((x) => x.id === l.entry_id);
                const st = STATUS[l.status] ?? { label: l.status, tone: 'info' as const };
                return (
                  <li key={l.id} className="py-3" data-billing-log={l.kind}>
                    <div className="flex items-center gap-3">
                      <span className="w-12 shrink-0 text-[12px] tabular text-faint">{formatDateShort(l.created_at.slice(0, 10))}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] text-ink">{e ? who(e).name : 'Parcela excluída'}</div>
                        <div className="truncate text-[12px] text-faint">
                          {REMINDER_LABEL[l.kind]}
                          {e && ` · ${formatMoney(e.amount)} · vencimento ${formatDateShort(l.due_date)}`}
                        </div>
                      </div>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                    {l.status === 'erro' && l.detail && <p className="mt-1 break-words pl-[60px] text-xs text-danger-fg">{l.detail}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
