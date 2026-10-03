import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, MessageCircle, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { digitsOnly } from '../../lib/utils';
import { Avatar, Badge, Card, CardHeader } from '../../components/ui';

const EXAMPLES = [
  'quais são minhas tarefas atrasadas?',
  'agenda reunião amanhã 14h com a Ana e o Bruno — apresentação da CASA J.D.',
  'passa pra Carla ligar pro Rodrigo Tavares até sexta',
  'concluí o levantamento métrico da CASA J.D.',
  'lança 1h30 na modelagem 3D',
  'o que tenho na agenda essa semana?',
  'novo lead: Paula Souza, 41 91234-5678, Pinhais, interiores, veio do Instagram',
  'remarca a reunião com o Rodrigo para quinta às 10h',
];

export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex items-center gap-2 rounded-sm border border-line bg-canvas/60 py-1.5 pl-3 pr-1.5">
        <code className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{value}</code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="inline-flex h-7 items-center gap-1 rounded-xs px-2 text-xs text-stone-500 hover:bg-surface hover:text-ink"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}

export function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-[11px] font-medium text-stone-500">{n}</span>
      <div className="min-w-0 flex-1 pb-5">
        <div className="text-sm font-medium text-ink">{title}</div>
        <div className="mt-1 space-y-2 text-sm leading-relaxed text-stone-500">{children}</div>
      </div>
    </li>
  );
}

export function WhatsAppSettings() {
  const { mode } = useAuth();
  const { db } = useData();
  const toast = useToast();
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') ?? 'https://SEU-PROJETO.supabase.co';
  const webhook = `${supabaseUrl}/functions/v1/whatsapp-agent`;
  const members = db.profiles.filter((p) => p.active);
  const withPhone = members.filter((p) => digitsOnly(p.phone ?? '').length >= 10);

  return (
    <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
      <div className="space-y-5">
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-surface">
              <Sparkles className="h-5 w-5" strokeWidth={1.6} />
            </span>
            <div>
              <h3 className="font-display text-[17px] font-semibold tracking-tight">Assistente da equipe no WhatsApp</h3>
              <p className="mt-1 text-sm leading-relaxed text-stone-500">
                Cada membro conversa com o número do escritório pelo WhatsApp (ou pelo botão <b>Assistente</b> no topo do sistema) e pede em
                linguagem natural: criar e designar tarefas, concluir, lançar horas, consultar a agenda e agendar reuniões. O assistente
                identifica a pessoa pelo telefone do cadastro e age em nome dela, com as mesmas permissões.
              </p>
              {mode === 'local' && (
                <p className="mt-3 rounded-sm border border-dashed border-line px-3 py-2 text-xs text-stone-500">
                  No modo demonstração o assistente fica desligado — ele roda no servidor (Supabase + chave da Anthropic).
                </p>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="mb-5 font-display text-[15px] font-semibold tracking-tight">Como ativar</h3>
          <ol>
            <Step n={1} title="Chave da Anthropic (Claude)">
              <p>
                Crie uma chave em{' '}
                <a className="text-ink underline underline-offset-2" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                  console.anthropic.com
                </a>{' '}
                e guarde-a como segredo do Supabase: <code className="rounded bg-canvas px-1">ANTHROPIC_API_KEY</code>.
              </p>
            </Step>
            <Step n={2} title="Número do WhatsApp Business (Meta)">
              <p>
                Em{' '}
                <a className="text-ink underline underline-offset-2" href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">
                  developers.facebook.com
                </a>
                , crie um app do tipo <b>Business</b>, adicione o produto <b>WhatsApp</b> e cadastre o número do escritório. Anote o{' '}
                <b>Phone number ID</b>, gere um <b>token permanente</b> (usuário do sistema) e copie o <b>App secret</b>.
              </p>
            </Step>
            <Step n={3} title="Segredos e publicação das funções">
              <pre className="overflow-x-auto rounded-sm bg-ink p-3 text-[11.5px] leading-relaxed text-stone-200">{`npx supabase secrets set \\
  ANTHROPIC_API_KEY=sk-ant-... \\
  WHATSAPP_TOKEN=EAAG... \\
  WHATSAPP_PHONE_NUMBER_ID=1234567890 \\
  WHATSAPP_APP_SECRET=abc123... \\
  WHATSAPP_VERIFY_TOKEN=uma-frase-secreta \\
  APP_URL=${window.location.origin}

npx supabase functions deploy whatsapp-agent --no-verify-jwt
npx supabase functions deploy agent-chat
npx supabase functions deploy calendar-sync`}</pre>
            </Step>
            <Step n={4} title="Webhook no painel da Meta">
              <p>Em WhatsApp → Configuração → Webhook, informe a URL abaixo e o mesmo token de verificação, e assine o campo <b>messages</b>.</p>
              <CopyField label="URL de retorno (callback)" value={webhook} />
            </Step>
            <Step n={5} title="Telefone de cada membro">
              <p>
                O assistente reconhece quem escreve pelo telefone do cadastro em{' '}
                <Link className="text-ink underline underline-offset-2" to="/equipe">
                  Equipe
                </Link>
                . Mensagens de números fora da equipe (clientes) são ignoradas: o assistente não responde nem marca como lidas, e a equipe atende pelo aplicativo normalmente.
              </p>
            </Step>
            <Step n={6} title="Google Agenda automático (opcional)">
              <p>
                Para as reuniões entrarem sozinhas no Google Agenda do escritório: crie uma <b>conta de serviço</b> no Google Cloud (com a
                Google Calendar API ativada), compartilhe a agenda do escritório com o e-mail dela com a permissão “Fazer alterações nos
                eventos” e guarde os segredos <code className="rounded bg-canvas px-1">GOOGLE_SERVICE_ACCOUNT_JSON</code> e{' '}
                <code className="rounded bg-canvas px-1">GOOGLE_CALENDAR_ID</code>. Sem isso, o assistente envia um link para adicionar a
                reunião ao Google Agenda.
              </p>
            </Step>
          </ol>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader
            icon={<MessageCircle className="h-4 w-4" />}
            title="Telefones da equipe"
            subtitle={`${withPhone.length} de ${members.length} membros prontos para usar pelo WhatsApp`}
          />
          <ul className="divide-y divide-line/70 border-t border-line/70">
            {members.map((p) => {
              const ok = digitsOnly(p.phone ?? '').length >= 10;
              return (
                <li key={p.id} className="flex items-center gap-3 px-6 py-3">
                  <Avatar user={p} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-ink">{p.name}</div>
                    <div className="text-xs text-stone-400">{p.phone || 'sem telefone'}</div>
                  </div>
                  <Badge tone={ok ? 'success' : 'warning'}>{ok ? 'Pronto' : 'Falta telefone'}</Badge>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-line/70 px-6 py-3 text-xs text-stone-400">
            Edite o telefone em{' '}
            <Link to="/equipe" className="text-ink underline underline-offset-2">
              Equipe
            </Link>{' '}
            (ou cada um em Meu perfil).
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-display text-[15px] font-semibold tracking-tight">Exemplos de pedidos</h3>
          <ul className="mt-4 space-y-2">
            {EXAMPLES.map((ex) => (
              <li key={ex}>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(ex).then(() => toast.info('Exemplo copiado.'))}
                  className="w-full rounded-xl rounded-bl-xs bg-canvas px-4 py-2.5 text-left text-[13px] text-stone-600 hover:text-ink"
                >
                  {ex}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
