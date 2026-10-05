import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { backend } from '../../lib/backend';
import { checkSchema } from '../../lib/schemaCheck';
import { ActionLink } from '../ui';

/** Aviso ao administrador quando falta alguma atualização do banco (verifica uma vez por sessão). */
export function SchemaBanner() {
  const { db, isAdmin, loading } = useData();
  const [missing, setMissing] = useState(0);

  useEffect(() => {
    if (!isAdmin || loading || backend.mode !== 'supabase') return;
    let cancelled = false;
    checkSchema(db)
      .then((items) => !cancelled && setMissing(items.filter((i) => i.status === 'missing').length))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Só na abertura do sistema (e quando termina de carregar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, loading]);

  if (!missing) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-warning-bg px-4 py-3 text-[13px] text-warning-fg">
      <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.8} />
      <span className="flex-1">
        O banco de dados precisa de {missing} {missing === 1 ? 'atualização' : 'atualizações'}: sem {missing === 1 ? 'ela' : 'elas'}, partes do sistema
        (como lançar parcelas no Financeiro) não funcionam.
      </span>
      <ActionLink to="/configuracoes?aba=banco">Ver o que falta</ActionLink>
    </div>
  );
}
