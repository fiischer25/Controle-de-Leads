import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Clock, ThumbsDown, ThumbsUp, XCircle } from 'lucide-react';
import { backend, type PublicApproval } from '../lib/backend';
import { APPROVAL_KIND } from '../lib/obras';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '../lib/utils';
import { Button, Field, Input, Spinner, Textarea } from '../components/ui';

/**
 * Página que o cliente abre pelo link (sem login): vê o que precisa aprovar — orçamento por partes,
 * pagamento, aditivo… — e responde Aprovo / Não aprovo com o nome e um comentário.
 */
export default function PublicApprovalPage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<PublicApproval | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<'aprovado' | 'recusado' | null>(null);
  const [confirmRefuse, setConfirmRefuse] = useState(false);

  const load = useCallback(
    () =>
      backend
      .getPublicApproval(token)
      .then((d) => {
        setData(d);
        if (d?.client_name) setName((n) => n || d.client_name!);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setData(null);
      }),
    [token],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (data) document.title = `${data.title} · ${data.office_name ?? 'Aprovação'}`;
  }, [data]);

  const answer = async (status: 'aprovado' | 'recusado') => {
    if (!name.trim()) return setError('Escreva seu nome para registrar a resposta.');
    setError(null);
    setBusy(status);
    try {
      await backend.answerPublicApproval(token, status, name.trim(), comment.trim() || null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setConfirmRefuse(false);
    }
  };

  if (data === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Spinner />
      </div>
    );
  }

  if (!data) {
    return (
      <Shell office={null} logo={null}>
        <div className="py-16 text-center">
          <XCircle className="mx-auto h-8 w-8 text-faint" strokeWidth={1.6} />
          <h1 className="mt-3 font-display text-[20px] font-semibold text-ink">Link não encontrado</h1>
          <p className="mt-1 text-[14px] text-muted">{error ?? 'Este pedido de aprovação não existe ou foi removido. Fale com o escritório.'}</p>
        </div>
      </Shell>
    );
  }

  const s = data.snapshot;
  const answered = data.status !== 'pendente';
  return (
    <Shell office={data.office_name} logo={data.logo_url}>
      <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-faint">
        {APPROVAL_KIND[data.kind]}
        {data.obra_name ? ` · ${data.obra_name}` : ''}
      </div>
      <h1 className="mt-1 font-display text-[24px] font-semibold leading-8 tracking-[-0.01em] text-ink sm:text-[28px] sm:leading-9">{data.title}</h1>
      <p className="mt-1 text-[13.5px] text-muted">
        {data.client_name ? `Para ${data.client_name} · ` : ''}enviado em {formatDate(data.requested_at.slice(0, 10))}
        {data.requested_by_name ? ` por ${data.requested_by_name}` : ''}
        {data.due_date && !answered ? ` · responder até ${formatDate(data.due_date)}` : ''}
      </p>

      {data.description && <p className="mt-5 whitespace-pre-line text-[15px] leading-6 text-ink">{data.description}</p>}

      {s?.facts && s.facts.length > 0 && (
        <dl className="mt-6 grid gap-x-6 gap-y-2 rounded-[14px] border border-line bg-surface p-4 sm:grid-cols-2">
          {s.facts.map((f) => (
            <div key={f.label} className="flex gap-3 text-[13.5px]">
              <dt className="w-28 shrink-0 text-muted">{f.label}</dt>
              <dd className="font-medium text-ink">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {s?.lines && s.lines.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-[14px] border border-line bg-surface">
          {s.lines.map((l, i) => (
            <details key={i} className="group border-b border-hairline last:border-0" open={!!l.items?.length && s.lines!.length <= 3}>
              <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 px-4 py-3 hover:bg-canvas">
                <span className="text-[14px] font-medium text-ink">
                  {i + 1}. {l.label}
                  {l.items?.length ? <span className="ml-1.5 text-[12px] font-normal text-faint">{l.items.length} itens</span> : null}
                </span>
                {l.value != null && <span className="shrink-0 text-[14px] font-semibold tabular text-ink">{formatMoney(l.value)}</span>}
              </summary>
              {l.items && l.items.length > 0 && (
                <ul className="bg-subtle px-4 py-2">
                  {l.items.map((it, j) => (
                    <li key={j} className="flex items-baseline justify-between gap-3 py-1 text-[13px]">
                      <span className="text-stone-700">
                        {it.description}{' '}
                        <span className="text-faint">
                          · {formatNumber(it.qty, 2)} {it.unit}
                        </span>
                      </span>
                      <span className="shrink-0 tabular text-muted">{formatMoney(it.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          ))}
        </div>
      )}

      {(s?.total ?? data.amount) != null && (
        <div className="mt-5 flex items-baseline justify-between rounded-[14px] bg-ink px-5 py-4 text-surface">
          <span className="text-[14px]">Total</span>
          <span className="font-display text-[24px] font-semibold tabular">{formatMoney((s?.total ?? data.amount)!)}</span>
        </div>
      )}

      {s?.notes && <p className="mt-5 whitespace-pre-line text-[13.5px] leading-6 text-muted">{s.notes}</p>}

      <div className="mt-8 rounded-[16px] border border-line bg-surface p-5 shadow-card">
        {answered ? (
          <div className="flex items-start gap-3" data-answer={data.status}>
            {data.status === 'aprovado' ? (
              <CheckCircle2 className="h-7 w-7 shrink-0 text-success-fg" strokeWidth={1.8} />
            ) : data.status === 'recusado' ? (
              <XCircle className="h-7 w-7 shrink-0 text-danger-fg" strokeWidth={1.8} />
            ) : (
              <Clock className="h-7 w-7 shrink-0 text-faint" strokeWidth={1.8} />
            )}
            <div>
              <p className="font-display text-[17px] font-semibold text-ink">
                {data.status === 'aprovado' ? 'Aprovado' : data.status === 'recusado' ? 'Não aprovado' : 'Pedido cancelado pelo escritório'}
              </p>
              {data.answered_at && (
                <p className="text-[13.5px] text-muted">
                  {data.answered_name ? `${data.answered_name} · ` : ''}
                  {formatDateTime(data.answered_at)}
                </p>
              )}
              {data.answer_comment && <p className="mt-2 text-[14px] text-ink">“{data.answer_comment}”</p>}
              {data.status !== 'cancelado' && <p className="mt-3 text-[13px] text-muted">Obrigado! O escritório já foi avisado.</p>}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="font-display text-[17px] font-semibold text-ink">Sua resposta</p>
            <Field label="Seu nome" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>
            <Field label={confirmRefuse ? 'Por que não aprova? (ajuda o escritório a ajustar)' : 'Comentário (opcional)'}>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
            </Field>
            {error && <p className="text-[13px] text-danger-fg" role="alert">{error}</p>}
            {confirmRefuse ? (
              <div className="flex flex-wrap gap-2">
                <Button size="touch" variant="danger" loading={busy === 'recusado'} onClick={() => answer('recusado')} icon={<ThumbsDown className="h-4 w-4" />}>
                  Confirmar: não aprovo
                </Button>
                <Button size="touch" variant="ghost" onClick={() => setConfirmRefuse(false)}>
                  Voltar
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="touch" variant="primary" loading={busy === 'aprovado'} onClick={() => answer('aprovado')} icon={<ThumbsUp className="h-4 w-4" />} className="flex-1 sm:flex-none">
                  Aprovo
                </Button>
                <Button size="touch" onClick={() => setConfirmRefuse(true)} icon={<ThumbsDown className="h-4 w-4" />} className="flex-1 sm:flex-none">
                  Não aprovo
                </Button>
              </div>
            )}
            <p className="text-[12px] text-faint">Sua resposta fica registrada com seu nome, data e hora.</p>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ office, logo, children }: { office: string | null; logo: string | null; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-[720px] items-center px-5">
          {logo ? <img src={logo} alt={office ?? ''} className="h-8 w-auto object-contain" /> : <span className="font-display text-[15px] font-semibold tracking-[0.12em] text-ink">{(office ?? '').toUpperCase()}</span>}
        </div>
      </header>
      <main className="mx-auto max-w-[720px] px-5 pb-16 pt-8">{children}</main>
    </div>
  );
}
