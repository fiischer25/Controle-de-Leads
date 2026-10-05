import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Upload } from 'lucide-react';
import { CONTRACT_ACCEPT, contractSummary, contractWarnings, readContract, type ContractExtraction } from '../../lib/contract';
import { cn, today } from '../../lib/utils';
import { Button } from '../ui';

/**
 * "Preencher com o contrato": envia o contrato (PDF, foto ou Word), o sistema lê e preenche
 * os campos. Mostra o resumo do que foi lido e os pontos para conferir.
 */
export function ContractReader({
  onRead,
  description = 'Envie o contrato assinado (PDF, foto ou Word) e o sistema preenche os dados do cliente, o valor e as parcelas.',
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

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setBusy(file.name);
    try {
      const extraction = await readContract(file);
      setDone({ extraction, fileName: file.name });
      onRead(extraction, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ler o contrato.');
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
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
                <div className="text-[12.5px] text-muted">Pode levar até um minuto. Não feche esta janela.</div>
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
    </div>
  );
}
