import { useState } from 'react';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import type { FinanceCategory } from '../../lib/types';
import { cn } from '../../lib/utils';
import { Button, IconButton, Input, SectionHeader } from '../ui';
import { useFinance } from './useFinance';

/** Categorias de receitas e despesas: renomear, arquivar, excluir (sem uso) e criar. */
export function FinanceCategories() {
  return (
    <div className="grid gap-12 md:grid-cols-2">
      <CategoryColumn kind="receita" title="Receitas" />
      <CategoryColumn kind="despesa" title="Despesas" />
    </div>
  );
}

function CategoryColumn({ kind, title }: { kind: FinanceCategory['kind']; title: string }) {
  const { db } = useData();
  const fin = useFinance();
  const toast = useToast();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const list = fin.categories.filter((c) => c.kind === kind).sort((a, b) => Number(b.active) - Number(a.active));
  const used = (id: string) => db.finance_entries.filter((e) => e.category_id === id).length;

  const run = async (fn: () => Promise<unknown>, message: string) => {
    try {
      await fn();
      toast.success(message);
    } catch (e) {
      toast.error(e);
    }
  };

  const add = async () => {
    if (!name.trim()) return;
    await run(() => fin.saveCategory({ name: name.trim(), kind }), 'Categoria criada.');
    setName('');
  };

  const rename = async () => {
    if (!editing) return;
    const value = editing.name.trim();
    setEditing(null);
    if (value) await run(() => fin.saveCategory({ id: editing.id, name: value, kind }), 'Categoria renomeada.');
  };

  return (
    <section aria-label={title}>
      <SectionHeader title={title} aside={<span className="text-[12.5px] text-faint">{list.filter((c) => c.active).length} em uso</span>} />
      <ul>
        {list.map((c) => {
          const n = used(c.id);
          return (
            <li key={c.id} className={cn('flex min-h-11 items-center gap-3 border-t border-hairline py-1.5', !c.active && 'opacity-55')}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />
              {editing?.id === c.id ? (
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                  onBlur={rename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') rename();
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  className="h-8 flex-1"
                  autoFocus
                  aria-label="Nome da categoria"
                />
              ) : (
                <button type="button" onClick={() => setEditing({ id: c.id, name: c.name })} className="min-w-0 flex-1 truncate text-left text-[13.5px] text-ink" title="Renomear">
                  {c.name}
                </button>
              )}
              <span className="text-[12.5px] tabular text-faint">{n}</span>
              <IconButton
                label={c.active ? `Arquivar ${c.name}` : `Reativar ${c.name}`}
                size="xs"
                onClick={() => run(() => fin.saveCategory({ id: c.id, name: c.name, kind, active: !c.active }), c.active ? 'Categoria arquivada.' : 'Categoria reativada.')}
              >
                {c.active ? <Archive className="h-3.5 w-3.5" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
              </IconButton>
              {n === 0 && (
                <IconButton label={`Excluir ${c.name}`} size="xs" onClick={() => run(() => fin.deleteCategory(c.id), 'Categoria excluída.')}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              )}
            </li>
          );
        })}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Nova categoria de ${title.toLowerCase()}`} aria-label={`Nova categoria de ${title.toLowerCase()}`} />
        <Button type="submit" variant="ghost" disabled={!name.trim()}>
          Adicionar
        </Button>
      </form>
    </section>
  );
}
