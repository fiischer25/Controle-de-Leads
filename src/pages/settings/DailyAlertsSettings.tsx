import { useCallback, useEffect, useState } from 'react';
import { BellRing, Eye, RefreshCw, Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { backend } from '../../lib/backend';
import type { AppSettings } from '../../lib/types';
import type { Tone } from '../../lib/status';
import { digitsOnly, formatDateShort, nowIso } from '../../lib/utils';
import { Badge, Button, Card, CardHeader, Checkbox, Field, Select, Switch } from '../../components/ui';
import { CopyField, Step } from './WhatsAppSettings';

const TEMPLATE_NAME = 'resumo_diario';
const TEMPLATE_BODY = 'Olá, {{1}}! Seu resumo de hoje: {{2}}. Responda esta mensagem para ver os detalhes.';

const STATUS: Record<string, { label: string; tone: Tone }> = {
  enviado: { label: 'Enviado', tone: 'success' },
  modelo: { label: 'Enviado (modelo)', tone: 'info' },
  sem_novidades: { label: 'Sem novidades', tone: 'neutral' },
  erro: { label: 'Erro', tone: 'danger' },
  pendente: { label: 'Enviando', tone: 'warning' },
};

interface LogRow {
  user_id: string;
  day: string;
  status: string;
  detail: string | null;
}

type AlertFields = Pick<
  AppSettings,
  'wa_alerts_enabled' | 'wa_alerts_hour' | 'wa_alerts_tasks' | 'wa_alerts_projects' | 'wa_alerts_leads' | 'wa_alerts_weekends'
>;

function functionError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/Failed to send a request|FunctionsFetchError|not found|404/i.test(msg)) {
    return new Error('A função whatsapp-alerts ainda não foi publicada no Supabase (passo 4 abaixo).');
  }
  return e instanceof Error ? e : new Error(msg);
}

/** Configurações → Resumo diário. */
export function DailyAlertsSettings() {
  const { mode } = useAuth();
  const { db, me, maps, settings, isAdmin, patch, insertRows } = useData();
  const toast = useToast();
  const local = mode === 'local';
  const pick = (s: AppSettings): AlertFields => ({
    wa_alerts_enabled: s.wa_alerts_enabled ?? false,
    wa_alerts_hour: s.wa_alerts_hour ?? 8,
    wa_alerts_tasks: s.wa_alerts_tasks ?? true,
    wa_alerts_projects: s.wa_alerts_projects ?? true,
    wa_alerts_leads: s.wa_alerts_leads ?? true,
    wa_alerts_weekends: s.wa_alerts_weekends ?? false,
  });
  const [v, setV] = useState<AlertFields>(() => pick(settings));
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<'preview' | 'test' | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [log, setLog] = useState<LogRow[] | null>(null);
  const [logError, setLogError] = useState<string | null>(null);

  const dirty = JSON.stringify(v) !== JSON.stringify(pick(settings));
  const members = db.profiles.filter((p) => p.active);
  const receiving = members.filter((p) => p.wa_alerts !== false && digitsOnly(p.phone ?? '').length >= 10);

  const save = async () => {
    setSaving(true);
    try {
      if (db.app_settings.length) await patch('app_settings', 'office', v);
      else await insertRows('app_settings', [{ ...settings, ...v, updated_at: nowIso() }]);
      toast.success(v.wa_alerts_enabled ? 'Resumo diário ligado.' : 'Configurações salvas.');
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const loadLog = useCallback(async () => {
    if (local || !isAdmin) return;
    try {
      const data = (await backend.invokeFunction('whatsapp-alerts', { action: 'log' })) as { log?: LogRow[] };
      setLog(data.log ?? []);
      setLogError(null);
    } catch (e) {
      setLogError(functionError(e).message);
    }
  }, [local, isAdmin]);
  useEffect(() => {
    loadLog();
  }, [loadLog]);

  const run = async (action: 'preview' | 'test') => {
    setBusy(action);
    try {
      const data = (await backend.invokeFunction('whatsapp-alerts', { action })) as { text?: string; status?: string };
      setPreview(data.text ?? '');
      if (action === 'test') {
        toast.success(data.status === 'modelo' ? 'Enviado pelo modelo aprovado (você não falou com o número nas últimas 24h).' : 'Resumo enviado para o seu WhatsApp.');
        loadLog();
      }
    } catch (e) {
      toast.error(functionError(e));
    } finally {
      setBusy(null);
    }
  };

  const set = <K extends keyof AlertFields>(k: K, value: AlertFields[K]) => setV((prev) => ({ ...prev, [k]: value }));

  return (
    <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
      <div className="space-y-5">
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-surface">
              <BellRing className="h-5 w-5" strokeWidth={1.6} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-[17px] font-semibold tracking-tight">Resumo diário no WhatsApp</h3>
              <p className="mt-1 text-sm leading-relaxed text-stone-500">
                Uma mensagem por dia para cada pessoa da equipe, só quando há algo a avisar: tarefas atrasadas, que vencem hoje e amanhã, prazos
                dos projetos em que ela está e retornos de leads do dia. Administradores recebem também os números do escritório.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-5 border-t border-line/70 pt-5">
            <Switch checked={!!v.wa_alerts_enabled} onChange={(on) => set('wa_alerts_enabled', on)} label="Enviar o resumo diário para a equipe" />
            <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
              <Field label="Horário">
                <Select value={String(v.wa_alerts_hour)} onChange={(e) => set('wa_alerts_hour', Number(e.target.value))} aria-label="Horário do resumo">
                  {Array.from({ length: 15 }, (_, i) => i + 6).map((h) => (
                    <option key={h} value={String(h)}>
                      {String(h).padStart(2, '0')}:00
                    </option>
                  ))}
                </Select>
              </Field>
              <div>
                <div className="label">O que avisar</div>
                <div className="mt-1 flex flex-col gap-2.5">
                  <Checkbox checked={!!v.wa_alerts_tasks} onChange={(on) => set('wa_alerts_tasks', on)} label="Tarefas atrasadas e que vencem hoje e amanhã" />
                  <Checkbox
                    checked={!!v.wa_alerts_projects}
                    onChange={(on) => set('wa_alerts_projects', on)}
                    label={`Prazos de projetos (vencidos e nos próximos ${settings.due_soon_days || 7} dias)`}
                  />
                  <Checkbox checked={!!v.wa_alerts_leads} onChange={(on) => set('wa_alerts_leads', on)} label="Retornos de leads do dia" />
                  <Checkbox checked={!!v.wa_alerts_weekends} onChange={(on) => set('wa_alerts_weekends', on)} label="Enviar também aos sábados e domingos" />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" loading={saving} disabled={!dirty} onClick={save}>
                Salvar
              </Button>
              <Button variant="ghost" icon={<Eye className="h-4 w-4" />} loading={busy === 'preview'} disabled={local} onClick={() => run('preview')}>
                Ver meu resumo de hoje
              </Button>
              {isAdmin && (
                <Button variant="ghost" icon={<Send className="h-4 w-4" />} loading={busy === 'test'} disabled={local} onClick={() => run('test')}>
                  Enviar teste para mim
                </Button>
              )}
            </div>
            <p className="text-xs text-stone-400">
              {local
                ? 'No modo demonstração nada é enviado: o resumo roda no servidor (Supabase + WhatsApp Business).'
                : `${receiving.length} de ${members.length} pessoas vão receber (com telefone no cadastro e sem desligar em Meu perfil).`}
            </p>
            {preview !== null && (
              <div>
                <div className="label">Como chega no WhatsApp</div>
                <pre className="mt-1 max-w-md whitespace-pre-wrap rounded-xl rounded-tl-xs bg-canvas px-4 py-3 font-sans text-[13px] leading-relaxed text-stone-700">
                  {preview || 'Sem novidades hoje.'}
                </pre>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="mb-5 font-display text-[15px] font-semibold tracking-tight">Como ativar o resumo diário</h3>
          <ol>
            <Step n={1} title="Banco de dados">
              <p>
                No Supabase, abra o <b>SQL Editor</b> e execute o arquivo <code className="rounded bg-canvas px-1">20261005000000_whatsapp_alerts.sql</code>.
              </p>
            </Step>
            <Step n={2} title="Modelo de mensagem na Meta">
              <p>
                A Meta só deixa o escritório mandar texto livre para quem escreveu ao número nas últimas 24 horas. Para os demais, o resumo vai
                por um <b>modelo aprovado</b>. No WhatsApp Manager → <b>Modelos de mensagem</b> → Criar modelo: categoria <b>Utilidade</b>,
                idioma <b>Português (BR)</b>, este nome e este corpo:
              </p>
              <CopyField label="Nome do modelo" value={TEMPLATE_NAME} />
              <CopyField label="Corpo" value={TEMPLATE_BODY} />
              <p>Exemplos pedidos pela Meta: {'{{1}}'} = Ana; {'{{2}}'} = 2 tarefas atrasadas e 1 projeto com prazo próximo. A aprovação costuma levar minutos.</p>
            </Step>
            <Step n={3} title="Segredos">
              <p>
                Em Edge Functions → <b>Secrets</b>, além de <code className="rounded bg-canvas px-1">WHATSAPP_TOKEN</code> e{' '}
                <code className="rounded bg-canvas px-1">WHATSAPP_PHONE_NUMBER_ID</code>, crie{' '}
                <code className="rounded bg-canvas px-1">ALERTS_CRON_SECRET</code> com uma frase secreta inventada por você e{' '}
                <code className="rounded bg-canvas px-1">APP_URL</code> com o endereço do sistema.
              </p>
              <CopyField label="APP_URL" value={window.location.origin} />
            </Step>
            <Step n={4} title="Publicar a função">
              <p>
                Edge Functions → Deploy a new function → <b>Via Editor</b>, nome <code className="rounded bg-canvas px-1">whatsapp-alerts</code>,
                cole o arquivo <code className="rounded bg-canvas px-1">supabase/functions/whatsapp-alerts/index.ts</code> e publique. Nos
                detalhes da função, desligue <b>Verify JWT</b>: ela confere sozinha quem chama.
              </p>
            </Step>
            <Step n={5} title="Agendamento de hora em hora">
              <p>
                Integrations → <b>Cron</b> → Create job: agenda <code className="rounded bg-canvas px-1">0 * * * *</code>, tipo{' '}
                <b>Supabase Edge Function</b>, método POST, função <code className="rounded bg-canvas px-1">whatsapp-alerts</code>, cabeçalho{' '}
                <code className="rounded bg-canvas px-1">x-cron-secret</code> com a mesma frase do passo 3 e corpo:
              </p>
              <CopyField label="Corpo (body)" value='{"action":"run"}' />
              <p>A função só envia no horário escolhido acima, uma vez por dia por pessoa.</p>
            </Step>
          </ol>
        </Card>
      </div>

      {isAdmin && !local && (
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Últimos envios"
              subtitle="Últimos 14 dias"
              action={
                <Button variant="ghost" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={loadLog}>
                  Atualizar
                </Button>
              }
            />
            {logError ? (
              <p className="border-t border-line/70 px-6 py-4 text-sm text-stone-500">{logError}</p>
            ) : log === null ? (
              <p className="border-t border-line/70 px-6 py-4 text-sm text-stone-400">Carregando…</p>
            ) : log.length === 0 ? (
              <p className="border-t border-line/70 px-6 py-4 text-sm text-stone-400">Nenhum envio ainda.</p>
            ) : (
              <ul className="divide-y divide-line/70 border-t border-line/70">
                {log.map((r) => {
                  const st = STATUS[r.status] ?? { label: r.status, tone: 'neutral' as Tone };
                  return (
                    <li key={`${r.user_id}-${r.day}`} className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <span className="w-12 shrink-0 text-xs tabular text-stone-400">{formatDateShort(r.day)}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">{maps.profiles[r.user_id]?.name ?? (r.user_id === me.id ? me.name : '—')}</span>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </div>
                      {r.status === 'erro' && r.detail && <p className="mt-1 break-words pl-[60px] text-xs text-danger-fg">{r.detail}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
