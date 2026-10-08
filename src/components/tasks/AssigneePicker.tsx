import { useState } from 'react';
import { Check, Users } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { cn } from '../../lib/utils';
import { Avatar, Popover } from '../ui';

/**
 * Escolher o responsável sem abrir a tarefa: um clique no responsável abre a lista da equipe.
 * `value` = 'varios' quando a etapa tem responsáveis diferentes. `variant`: 'cell' (avatar e
 * primeiro nome, para tabelas e cabeçalhos de etapa) ou 'avatar' (só o avatar, nas linhas).
 */
export function AssigneePicker({
  value,
  onChange,
  label,
  variant = 'cell',
  hint,
}: {
  value: string | null | 'varios';
  onChange: (id: string | null) => void;
  label: string;
  variant?: 'cell' | 'avatar';
  /** Linha explicativa no topo da lista (ex.: "Vale para as 4 tarefas abertas da etapa"). */
  hint?: string;
}) {
  const { db, maps } = useData();
  const [query, setQuery] = useState('');
  const person = value && value !== 'varios' ? maps.profiles[value] : null;
  const people = db.profiles
    .filter((p) => p.active || p.id === value)
    .filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Popover
      align="left"
      className="w-64"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          aria-label={label}
          title={label}
          className={cn(
            'flex min-w-0 items-center gap-1.5 rounded-full text-left text-[12.5px] transition-colors hover:bg-ink/5',
            variant === 'cell' ? '-ml-1 max-w-full px-1 py-0.5' : 'p-0.5',
          )}
        >
          {value === 'varios' ? (
            <>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500">
                <Users className="h-3 w-3" />
              </span>
              {variant === 'cell' && <span className="truncate text-stone-600">Vários</span>}
            </>
          ) : person ? (
            <>
              <Avatar user={person} size={variant === 'cell' ? 'xs' : 'sm'} />
              {variant === 'cell' && <span className="truncate text-stone-700">{person.name.split(' ')[0]}</span>}
            </>
          ) : variant === 'cell' ? (
            <span className="truncate text-stone-400 underline decoration-dotted underline-offset-4">Definir</span>
          ) : (
            <Avatar user={null} size="sm" />
          )}
        </button>
      )}
    >
      {(close) => {
        const pick = (id: string | null) => {
          close();
          setQuery('');
          if (id !== value) onChange(id);
        };
        return (
          <div onClick={(e) => e.stopPropagation()}>
            {hint && <p className="px-2.5 pb-1.5 pt-1 text-[12px] text-faint">{hint}</p>}
            {db.profiles.length > 7 && (
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar pessoa…"
                aria-label="Buscar pessoa"
                className="input mb-1 h-8 w-full text-[13px]"
              />
            )}
            <ul className="max-h-72 overflow-y-auto">
              {people.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => pick(p.id)}
                    className="flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-[13.5px] text-stone-800 hover:bg-canvas"
                  >
                    <Avatar user={p} size="xs" />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {p.id === value && <Check className="h-3.5 w-3.5 shrink-0 text-ink" />}
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => pick(null)}
                  className="flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-[13.5px] text-muted hover:bg-canvas"
                >
                  <Avatar user={null} size="xs" />
                  <span className="flex-1">Sem responsável</span>
                  {value === null && <Check className="h-3.5 w-3.5 shrink-0 text-ink" />}
                </button>
              </li>
            </ul>
          </div>
        );
      }}
    </Popover>
  );
}
