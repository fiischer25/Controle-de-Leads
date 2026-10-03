import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, Plus } from 'lucide-react';
import { useData } from '../context/DataContext';
import { isProjectActive } from '../lib/domain';
import { downloadFile, formatDate, matches, toCsv, today, toDateKey } from '../lib/utils';
import { Button, EmptyState, FilterPick, PageHeader, SearchField, Toolbar } from '../components/ui';
import { ClientFormModal } from '../components/clients/ClientFormModal';

type Filter = '' | 'active' | 'none';

export default function ClientsPage() {
  const { db, maps } = useData();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('');
  const [creating, setCreating] = useState(false);

  const all = useMemo(() => {
    return db.clients
      .map((c) => {
        const projects = db.projects.filter((p) => p.client_id === c.id);
        const lead = c.lead_id ? maps.leads[c.lead_id] : null;
        return {
          client: c,
          projects,
          active: projects.filter(isProjectActive),
          source: lead?.source_id ? maps.sources[lead.source_id]?.name : null,
        };
      })
      .sort((a, b) => a.client.name.localeCompare(b.client.name));
  }, [db.clients, db.projects, maps]);

  const rows = all.filter((r) => {
    if (filter === 'active' && r.active.length === 0) return false;
    if (filter === 'none' && r.active.length > 0) return false;
    return matches(query, r.client.name, r.client.document, r.client.email, r.client.phone, r.client.city);
  });
  const withActive = all.filter((r) => r.active.length > 0).length;

  const exportCsv = () =>
    downloadFile(
      `clientes-${today()}.csv`,
      toCsv(
        rows.map(({ client: c, projects, source }) => ({
          Nome: c.name,
          'CPF/CNPJ': c.document,
          RG: c.rg ?? '',
          Nascimento: formatDate(c.birth_date),
          Email: c.email,
          Telefone: c.phone,
          Profissão: c.profession ?? '',
          CEP: c.cep,
          Endereço: `${c.street}, ${c.number}${c.complement ? ` - ${c.complement}` : ''}`,
          Bairro: c.neighborhood,
          Cidade: c.city,
          UF: c.state,
          Projetos: projects.map((p) => p.name).join(', '),
          Origem: source ?? '',
          'Cliente desde': formatDate(toDateKey(new Date(c.created_at))),
        })),
      ),
      'text/csv',
    );

  const cols = 'grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_88px]';

  return (
    <div>
      <PageHeader
        title="Clientes"
        description={
          <>
            {all.length} {all.length === 1 ? 'cliente' : 'clientes'} · {withActive} com projeto em andamento
          </>
        }
        actions={
          <>
            <Button variant="ghost" icon={<Download className="h-4 w-4" strokeWidth={1.6} />} onClick={exportCsv} className="max-sm:hidden">
              Exportar
            </Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => setCreating(true)}>
              Cliente
            </Button>
          </>
        }
      />

      <Toolbar
        search={<SearchField value={query} onChange={setQuery} placeholder="Buscar nome, CPF/CNPJ, e-mail, cidade…" label="Buscar clientes" />}
        filters={
          <FilterPick
            label="Projetos"
            allLabel="Todos os clientes"
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            options={[
              { value: 'active', label: 'Com projeto em andamento' },
              { value: 'none', label: 'Sem projeto em andamento' },
            ]}
          />
        }
      />

      <div className="mt-6 md:mt-8">
        {rows.length === 0 ? (
          <EmptyState
            title={all.length ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'}
            description={all.length ? 'Ajuste a busca ou o filtro.' : 'Clientes aparecem aqui quando uma oportunidade fechada vira cliente.'}
            className="py-16"
          />
        ) : (
          <>
            <div className={`hidden gap-6 border-b border-hairline pb-2.5 text-[12.5px] text-faint md:grid ${cols}`}>
              <span>Cliente</span>
              <span>Contato</span>
              <span>Projetos</span>
              <span>Origem</span>
              <span className="text-right">Desde</span>
            </div>
            <ul>
              {rows.map(({ client: c, projects, active, source }) => (
                <li key={c.id}>
                  <div
                    role="link"
                    tabIndex={0}
                    onClick={() => navigate(`/clientes/${c.id}`)}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/clientes/${c.id}`)}
                    className={`grid cursor-pointer items-center gap-x-6 gap-y-1 border-b border-hairline py-3.5 transition-colors hover:bg-ink/[0.025] ${cols}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium text-ink">{c.name}</span>
                      <span className="block truncate text-[12.5px] text-faint">
                        {c.city}/{c.state}
                      </span>
                    </span>
                    <span className="hidden min-w-0 md:block">
                      <span className="block truncate text-[13px] text-stone-700">{c.phone}</span>
                      <span className="block truncate text-[12.5px] text-faint">{c.email}</span>
                    </span>
                    <span className="min-w-0 text-right text-[13px] md:text-left">
                      {projects.length === 0 ? (
                        <span className="text-faint">—</span>
                      ) : (
                        <span className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 md:justify-start">
                          {projects.slice(0, 2).map((p) => (
                            <Link
                              key={p.id}
                              to={`/projetos/${p.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="truncate font-display text-[13px] font-semibold tracking-[0.01em] text-ink hover:underline hover:decoration-stone-300 hover:underline-offset-4"
                            >
                              {p.name}
                            </Link>
                          ))}
                          {projects.length > 2 && <span className="text-faint">+{projects.length - 2}</span>}
                          {active.length > 0 && <span className="hidden text-[12.5px] text-faint lg:inline">· {active.length} em andamento</span>}
                        </span>
                      )}
                    </span>
                    <span className="hidden truncate text-[13px] text-muted md:block">{source ?? '—'}</span>
                    <span className="hidden text-right text-[13px] tabular text-muted md:block">{formatDate(toDateKey(new Date(c.created_at)))}</span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12.5px] text-faint">
              {rows.length} {rows.length === 1 ? 'cliente' : 'clientes'}
            </p>
          </>
        )}
      </div>
      {creating && <ClientFormModal onClose={() => setCreating(false)} onSaved={(c) => navigate(`/clientes/${c.id}`)} />}
    </div>
  );
}
