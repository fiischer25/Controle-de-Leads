import { useState, type ReactNode } from 'react';
import { CheckCircle2, Copy, Download, Info, PlayCircle, XCircle } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { backend } from '../../lib/backend';
import { cn, downloadFile } from '../../lib/utils';
import { Button, Card, CardHeader } from '../../components/ui';

// Código da função (arquivo único), carregado só quando for copiado
const sources = import.meta.glob('/supabase/functions/contract-extract/index.ts', { query: '?raw', import: 'default' });

async function functionCode(): Promise<string> {
  const load = Object.values(sources)[0];
  if (!load) throw new Error('Código da função não encontrado.');
  return (await load()) as string;
}

type Status = { kind: 'ok' | 'error'; text: string } | null;

/**
 * Ativação da leitura de contratos sem terminal: chave da Anthropic nos segredos do Supabase e a
 * função contract-extract publicada pelo editor do painel (código copiado daqui). "Testar" confere.
 */
export function ContractSettings() {
  const toast = useToast();
  const [status, setStatus] = useState<Status>(null);
  const [testing, setTesting] = useState(false);
  const local = backend.mode !== 'supabase';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(await functionCode());
      toast.success('Código copiado. Cole no editor da função no Supabase.');
    } catch {
      toast.error('Não foi possível copiar. Use "Baixar" e abra o arquivo.');
    }
  };

  const test = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const data = (await backend.invokeFunction('contract-extract', { ping: true })) as { ok?: boolean; error?: string } | null;
      if (data?.ok) setStatus({ kind: 'ok', text: 'Tudo certo: a leitura de contratos está ativa.' });
      else setStatus({ kind: 'error', text: data?.error ?? 'A função respondeu de forma inesperada. Publique o código de novo (passo 3).' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus({
        kind: 'error',
        text: /não está publicada|failed to send|fetch/i.test(msg)
          ? 'A função contract-extract ainda não foi publicada no Supabase. Faça o passo 3 (nome exatamente contract-extract).'
          : msg,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="max-w-3xl overflow-hidden">
      <CardHeader
        title="Leitura de contratos"
        subtitle="Ao marcar uma oportunidade como ganha, envie o contrato e o sistema preenche o cadastro do cliente, o valor e as parcelas. Ative uma vez, pelo site do Supabase, sem instalar nada."
      />
      <ol className="space-y-5 border-t border-line/70 px-5 py-5">
        <Step n={1} title="Crie a chave da Anthropic">
          Entre em{' '}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="font-medium text-ink underline decoration-stone-300 underline-offset-4">
            console.anthropic.com → API Keys
          </a>
          , clique em <b>Create Key</b> e copie a chave (começa com <code className="rounded bg-subtle px-1">sk-ant-</code>). Se você já ativou o
          assistente do WhatsApp, use a mesma chave e pule para o passo 3.
        </Step>
        <Step n={2} title="Guarde a chave no Supabase">
          No painel do Supabase do sistema, abra <b>Edge Functions → Secrets</b>. Em <b>Name</b> escreva{' '}
          <code className="rounded bg-subtle px-1">ANTHROPIC_API_KEY</code>, em <b>Value</b> cole a chave e clique em <b>Save</b>.
        </Step>
        <Step n={3} title="Publique a função">
          <p>
            Ainda em <b>Edge Functions</b>, clique em <b>Deploy a new function → Via Editor</b>. Apague o código de exemplo, cole o código copiado
            abaixo, troque o nome da função para <code className="rounded bg-subtle px-1">contract-extract</code> e clique em <b>Deploy function</b>.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" icon={<Copy className="h-3.5 w-3.5" />} onClick={copy}>
              Copiar código da função
            </Button>
            <Button size="sm" variant="ghost" icon={<Download className="h-3.5 w-3.5" />} onClick={async () => downloadFile('contract-extract.ts', await functionCode(), 'text/plain')}>
              Baixar
            </Button>
          </div>
          <p className="mt-2 text-[12.5px] text-faint">
            Para atualizar no futuro, abra a função contract-extract no Supabase, aba <b>Code</b>, cole o código novo e clique em Deploy.
          </p>
        </Step>
        <Step n={4} title="Teste">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" icon={<PlayCircle className="h-3.5 w-3.5" />} loading={testing} onClick={test} disabled={local}>
              Testar a leitura de contratos
            </Button>
            {local && <span className="text-[12.5px] text-faint">Disponível com o sistema conectado ao Supabase.</span>}
          </div>
          {status && (
            <p className={cn('mt-3 flex gap-2 rounded-lg px-3 py-2.5 text-[13px]', status.kind === 'ok' ? 'bg-success-bg text-success-fg' : 'bg-danger-bg text-danger-fg')}>
              {status.kind === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              {status.text}
            </p>
          )}
        </Step>
      </ol>
      <div className="flex items-start gap-2 border-t border-line/70 bg-subtle/60 px-5 py-3.5 text-[12.5px] text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Cada contrato lido é cobrado pela Anthropic conforme o tamanho do arquivo; acompanhe o consumo em console.anthropic.com. Se o modelo
        principal estiver indisponível, a leitura tenta automaticamente um modelo alternativo.
      </div>
    </Card>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[12.5px] font-semibold text-surface">{n}</span>
      <div className="pt-0.5 text-[13.5px] leading-relaxed text-muted">
        <div className="mb-1 font-medium text-ink">{title}</div>
        {children}
      </div>
    </li>
  );
}
