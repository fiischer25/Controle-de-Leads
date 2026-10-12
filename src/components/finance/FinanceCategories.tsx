import { useState } from 'react';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { FINANCE_CATEGORY_PRESETS } from '../../lib/defaults';
import type { FinanceCategory } from '../../lib/types';
import { cn } from '../../lib/utils';
import { Button, IconButton, Input, SectionHeader } from '../ui';
import { useFinance } from './useFinance';

/** Categorias de receitas e despesas: renomear, arquivar, excluir (sem uso) e criar. */
export function FinanceCategories() {
  return (
    <div>
      <SuggestedCategories />
      <div className="grid gap-12 md:grid-cols-2">
        <CategoryColumn kind="receita" title="Receitas" />
        <CategoryColumn kind="despesa" title="Despesas" />
      </div>
    </div>
  );
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/** Categorias sugeridas para escritório de arquitetura que ainda não existem: adiciona de uma vez. */
function SuggestedCategories() {
  const fin = useFinance();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const have = new Set(fin.categories.map((c) => `${c.kind}:${norm(c.name)}`));
  const missing = FINANCE_CATEGORY_PRESETS.filter(([name, kind]) => !have.has(`${kind}:${norm(name)}`));
  if (!missing.length) return null;

  const addAll = async () => {
    setBusy(true);
    try {
      for (const [name, kind, color] of missing) await fin.saveCategory({ name, kind, color });
      toast.success(`${missing.length} ${missing.length === 1 ? 'categoria adicionada' : 'categorias adicionadas'}.`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Categorias sugeridas" className="mb-10 rounded-[16px] border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display text-[15.5px] font-semibold text-ink">Categorias sugeridas para o escritório</h2>
          <p className="mt-0.5 text-[13px] text-muted">Prontas para usar nos lançamentos e nos relatórios. Dá para renomear ou arquivar depois.</p>
        </div>
        <Button variant="primary" size="sm" loading={busy} onClick={addAll} className="shrink-0">
          Adicionar {missing.length === 1 ? 'a categoria' : `as ${missing.length} categorias`}
        </Button>
      </div>
      {(['receita', 'despesa'] as const).map((kind) => {
        const items = missing.filter(([, k]) => k === kind);
        if (!items.length) return null;
        return (
          <div key={kind} className="mt-4">
            <div className="mb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-faint">{kind === 'receita' ? 'Receitas' : 'Despesas'}</div>
            <div className="flex flex-wrap gap-1.5">
              {items.map(([name, , color]) => (
                <span key={name} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12.5px] text-stone-700">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                  {name}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </section>
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
