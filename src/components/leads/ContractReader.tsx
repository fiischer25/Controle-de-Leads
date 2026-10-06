import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardPaste, Copy, ExternalLink, FileText, Sparkles, Upload } from 'lucide-react';
import {
  CLAUDE_PROMPT,
  CONTRACT_ACCEPT,
  ContractNeedsAiError,
  completeAddressFromCep,
  contractSummary,
  contractWarnings,
  parseClaudeAnswer,
  readContract,
  type ContractExtraction,
} from '../../lib/contract';
import { cn, today } from '../../lib/utils';
import { Button, Textarea } from '../ui';

/**
 * "Preencher com o contrato": envia o contrato (PDF ou Word) e o sistema lê e preenche os campos
 * (de graça, no navegador). Para fotos e escaneados, "Ler com o Claude.ai":
 * a pessoa usa a própria assinatura do Claude e cola a resposta aqui. Mostra o resumo e os avisos.
 */
export function ContractReader({
  onRead,
  description = 'Envie o contrato assinado (PDF ou Word) e o sistema preenche os dados do cliente, o valor e as parcelas.',
  initial,
  className,
}: {
  onRead: (x: ContractExtraction, fileName: string) => void;
  description?: string;
  /** Contrato já lido antes (ex.: no fechamento da oportunidade). */
  initial?: { extraction: ContractExtraction; fileName: string } | null;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(initial ?? null);
  const [claude, setClaude] = useState(false);
  const [answer, setAnswer] = useState('');
  const [copied, setCopied] = useState(false);

  const finish = (extraction: ContractExtraction, fileName: string) => {
    setDone({ extraction, fileName });
    setError('');
    onRead(extraction, fileName);
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setBusy(file.name);
    try {
      finish(await readContract(file), file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ler o contrato.');
      if (e instanceof ContractNeedsAiError) setClaude(true);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(CLAUDE_PROMPT);
      setCopied(true);
    } catch {
      setError('Não foi possível copiar. Selecione o texto da instrução e copie manualmente.');
    }
  };

  const applyAnswer = async () => {
    try {
      finish(await completeAddressFromCep(parseClaudeAnswer(answer)), 'resposta do Claude.ai');
      setClaude(false);
      setAnswer('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Resposta inválida.');
    }
  };

  const warnings = done ? contractWarnings(done.extraction, today()) : [];

  return (
    <div
      className={cn('rounded-[14px] border border-dashed border-line-strong bg-canvas px-4 py-3.5', className)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (!busy) pick(e.dataTransfer.files?.[0]);
      }}
    >
      <input ref={input} type="file" accept={CONTRACT_ACCEPT} className="hidden" aria-label="Arquivo do contrato" onChange={(e) => pick(e.target.files?.[0])} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', done && !busy ? 'bg-success-bg text-success-fg' : 'bg-surface text-muted shadow-xs')}>
            {done && !busy ? <CheckCircle2 className="h-[18px] w-[18px]" strokeWidth={1.6} /> : <FileText className="h-[18px] w-[18px]" strokeWidth={1.6} />}
          </span>
          <div className="min-w-0 flex-1">
            {busy ? (
              <>
                <div className="text-[13.5px] font-medium text-ink">Lendo {busy}…</div>
                <div className="text-[12.5px] text-muted">Aguarde alguns segundos.</div>
              </>
            ) : done ? (
              <>
                <div className="truncate text-[13.5px] font-medium text-ink">Preenchido com {done.fileName}</div>
                <div className="text-[12.5px] text-muted">{contractSummary(done.extraction)}. Confira os campos antes de salvar.</div>
              </>
            ) : (
              <>
                <div className="text-[13.5px] font-medium text-ink">Preencher com o contrato</div>
                <div className="text-[12.5px] text-muted">{description}</div>
              </>
            )}
          </div>
        </div>
        <Button size="sm" className="ml-12 self-start sm:ml-0 sm:self-auto" loading={!!busy} icon={<Upload className="h-3.5 w-3.5" strokeWidth={1.8} />} onClick={() => input.current?.click()}>
          {done ? 'Enviar outro' : 'Enviar contrato'}
        </Button>
      </div>
      {error && <p className="mt-2.5 text-[13px] text-danger-fg">{error}</p>}
      {!busy && warnings.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line pt-3">
          {warnings.map((w) => (
            <li key={w} className="flex gap-2 text-[12.5px] text-warning-fg">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
              {w}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 border-t border-line pt-2.5">
        <button
          type="button"
          aria-expanded={claude}
          onClick={() => setClaude(!claude)}
          className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-ink"
        >
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.8} />
          Ler com o Claude.ai {claude ? '' : '(foto, escaneado ou contrato fora do padrão)'}
        </button>
        {claude && (
          <ol className="mt-3 space-y-3 text-[13px] text-muted">
            <li>
              <span className="font-medium text-ink">1.</span> Copie a instrução e abra o Claude (usa a sua assinatura, sem custo extra).
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" icon={<Copy className="h-3.5 w-3.5" />} onClick={copyPrompt}>
                  {copied ? 'Instrução copiada' : 'Copiar instrução'}
                </Button>
                <a
                  href="https://claude.ai/new"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-sm font-medium text-stone-800 hover:bg-ink/5"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir o Claude.ai
                </a>
              </div>
            </li>
            <li>
              <span className="font-medium text-ink">2.</span> No Claude, anexe o contrato (PDF ou foto), cole a instrução e envie.
            </li>
            <li>
              <span className="font-medium text-ink">3.</span> Copie a resposta do Claude, cole aqui e clique em Preencher.
              <Textarea
                className="mt-2 font-mono text-[12px]"
                rows={4}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder='Cole aqui a resposta (começa com { "client": ...)'
                aria-label="Resposta do Claude"
              />
              <Button size="sm" variant="primary" className="mt-2" icon={<ClipboardPaste className="h-3.5 w-3.5" />} disabled={!answer.trim()} onClick={applyAnswer}>
                Preencher
              </Button>
            </li>
          </ol>
        )}
      </div>
    </div>
  );
}
