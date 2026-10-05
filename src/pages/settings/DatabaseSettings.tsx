import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Circle, Copy, Download, RefreshCw, XCircle } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { backend } from '../../lib/backend';
import { checkSchema, migrationSql, myAccess, type MyAccess, type SchemaItem } from '../../lib/schemaCheck';
import { cn, downloadFile } from '../../lib/utils';
import { Button, Card, CardHeader, EmptyState } from '../../components/ui';

/**
 * Diagnóstico do banco: mostra quais atualizações (migrações) já foram aplicadas no Supabase e
 * copia o SQL exato das que faltam, para colar no SQL Editor.
 */
export function DatabaseSettings() {
  const { db, refresh } = useData();
  const toast = useToast();
  const [items, setItems] = useState<SchemaItem[] | null>(null);
  const [access, setAccess] = useState<MyAccess | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      await refresh();
      setItems(await checkSchema(db));
      setAccess(await myAccess());
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const copy = async (file: string) => {
    try {
      const sql = await migrationSql(file);
      await navigator.clipboard.writeText(sql);
      toast.success('SQL copiado. Cole no SQL Editor do Supabase e clique em Run.');
    } catch {
      toast.error('Não foi possível copiar. Use "Baixar" e abra o arquivo.');
    }
  };
  const download = async (file: string) => downloadFile(file, await migrationSql(file), 'text/plain');

  if (backend.mode !== 'supabase') {
    return (
      <Card className="max-w-3xl">
        <EmptyState title="Modo demonstração" description="Não há banco de dados para verificar: os dados ficam salvos neste navegador." className="py-12" />
      </Card>
    );
  }

  const missing = items?.filter((i) => i.status === 'missing') ?? [];
  return (
    <Card className="max-w-3xl overflow-hidden">
      <CardHeader
        title="Banco de dados"
        subtitle="Atualizações do banco (Supabase). Se alguma faltar, partes do sistema falham — por exemplo, lançar parcelas no Financeiro."
        action={
          <Button size="sm" icon={<RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />} onClick={run} disabled={busy}>
            Verificar de novo
          </Button>
        }
      />
      {items && (
        <div className={cn('mx-5 mb-4 rounded-lg px-4 py-3 text-[13px]', missing.length ? 'bg-danger-bg text-danger-fg' : 'bg-success-bg text-success-fg')}>
          {missing.length
            ? `Faltam ${missing.length} ${missing.length === 1 ? 'atualização' : 'atualizações'}. Para cada uma, em ordem: “Copiar SQL” → Supabase → SQL Editor → New query → colar → Run (se perguntar sobre RLS, “Run without RLS”). Depois clique em “Verificar de novo”.`
            : 'Tudo certo: o banco tem todas as atualizações necessárias.'}
        </div>
      )}
      {access && (
        <div className="mx-5 mb-4 rounded-lg border border-line px-4 py-3 text-[13px]">
          <div className="font-medium text-ink">Seu usuário no banco</div>
          <div className="mt-1 grid gap-x-6 gap-y-0.5 text-muted sm:grid-cols-2">
            <span>Login: {access.uid ? 'reconhecido' : <b className="text-danger-fg">não reconhecido (saia e entre de novo)</b>}</span>
            <span>
              Perfil: {access.role === 'admin' ? 'administrador' : access.role ?? <b className="text-danger-fg">não encontrado</b>}
              {access.active === false && <b className="text-danger-fg"> · inativo</b>}
            </span>
            <span>
              Financeiro: {access.financeiro ? <span className="text-success-fg">liberado</span> : <b className="text-danger-fg">bloqueado</b>}
            </span>
            <span>
              Regras do Financeiro: {access.finance_policies >= 4 ? <span className="text-success-fg">ok</span> : <b className="text-danger-fg">faltando</b>}
            </span>
          </div>
        </div>
      )}
      <ul className="divide-y divide-line/70 border-t border-line/70">
        {(items ?? []).map((i) => (
          <li key={i.file} className="flex flex-wrap items-center gap-3 px-5 py-3">
            {i.status === 'ok' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success-fg" aria-label="Aplicada" />
            ) : i.status === 'missing' ? (
              <XCircle className="h-4 w-4 shrink-0 text-danger-fg" aria-label="Falta" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-stone-400" aria-label="Recomendada" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink">{i.label}</div>
              <div className="truncate text-xs text-stone-500" title={i.detail}>
                {i.file}
                {i.status === 'missing' && ' · falta aplicar'}
                {i.status === 'optional' && ' · recomendada'}
              </div>
            </div>
            {i.status !== 'ok' && (
              <span className="flex gap-1.5">
                <Button size="sm" variant={i.status === 'missing' ? 'primary' : 'secondary'} icon={<Copy className="h-3.5 w-3.5" />} onClick={() => copy(i.file)}>
                  Copiar SQL
                </Button>
                <Button size="sm" variant="ghost" icon={<Download className="h-3.5 w-3.5" />} onClick={() => download(i.file)}>
                  Baixar
                </Button>
              </span>
            )}
          </li>
        ))}
        {!items && <li className="px-5 py-6 text-[13px] text-faint">Verificando…</li>}
      </ul>
    </Card>
  );
}
