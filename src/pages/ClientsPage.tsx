import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Plus, Search, UsersRound } from 'lucide-react';
import { useData } from '../context/DataContext';
import { downloadFile, formatDate, matches, toCsv, today, toDateKey } from '../lib/utils';
import { Badge, Button, Card, EmptyState, Input, PageHeader } from '../components/ui';
import { ClientFormModal } from '../components/clients/ClientFormModal';

export default function ClientsPage() {
  const { db, maps } = useData();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    return db.clients
      .filter((c) => matches(query, c.name, c.document, c.email, c.phone, c.city))
      .map((c) => {
        const projects = db.projects.filter((p) => p.client_id === c.id);
        const lead = c.lead_id ? maps.leads[c.lead_id] : null;
        return {
          client: c,
          projects,
          active: projects.filter((p) => ['nao_iniciado', 'em_andamento', 'pausado'].includes(p.status)).length,
          source: lead?.source_id ? maps.sources[lead.source_id]?.name : null,
        };
      })
      .sort((a, b) => a.client.name.localeCompare(b.client.name));
  }, [db.clients, db.projects, maps, query]);

  const exportCsv = () =>
    downloadFile(
      `clientes-${today()}.csv`,
      toCsv(
        rows.map(({ client: c, projects, source }) => ({
          Nome: c.name, 'CPF/CNPJ': c.document, RG: c.rg ?? '', Nascimento: formatDate(c.birth_date), Email: c.email, Telefone: c.phone,
          Profissão: c.profession ?? '', CEP: c.cep, Endereço: `${c.street}, ${c.number}${c.complement ? ` - ${c.complement}` : ''}`,
          Bairro: c.neighborhood, Cidade: c.city, UF: c.state, Projetos: projects.map((p) => p.name).join(', '), Origem: source ?? '',
          'Cliente desde': formatDate(toDateKey(new Date(c.created_at))),
        })),
      ),
      'text/csv',
    );

  return (
    <div>
      <PageHeader
        eyebrow="Relacionamento"
        title="Clientes"
        description="Clientes convertidos a partir das oportunidades e seus projetos."
        actions={
          <>
            <Button icon={<Download className="h-4 w-4" />} onClick={exportCsv}>Exportar</Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Novo cliente</Button>
          </>
        }
      />
      <div className="card mb-4 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome, CPF/CNPJ, e-mail, telefone, cidade…" className="pl-9" />
        </div>
      </div>
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={<UsersRound className="h-6 w-6" />} title="Nenhum cliente" description="Clientes aparecem aqui quando uma oportunidade fechada vira cliente." />
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-[11px] uppercase tracking-[0.08em] text-stone-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">Cliente</th>
                <th className="px-4 py-2.5 font-medium">Contato</th>
                <th className="px-4 py-2.5 font-medium">Cidade</th>
                <th className="px-4 py-2.5 font-medium">Projetos</th>
                <th className="px-4 py-2.5 font-medium">Origem</th>
                <th className="px-4 py-2.5 font-medium">Desde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {rows.map(({ client: c, projects, active, source }) => (
                <tr key={c.id} className="cursor-pointer hover:bg-stone-50" onClick={() => navigate(`/clientes/${c.id}`)}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{c.name}</div>
                    <div className="text-xs text-stone-500">{c.document}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-stone-700">{c.phone}</div>
                    <div className="text-xs text-stone-500">{c.email}</div>
                  </td>
                  <td className="px-4 py-3 text-stone-700">{c.city}/{c.state}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {projects.slice(0, 3).map((p) => <Badge key={p.id}>{p.name}</Badge>)}
                      {active > 0 && <span className="text-xs text-stone-500">{active} ativo{active > 1 ? 's' : ''}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-stone-600">{source ?? '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-stone-600">{formatDate(toDateKey(new Date(c.created_at)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {creating && <ClientFormModal onClose={() => setCreating(false)} onSaved={(c) => navigate(`/clientes/${c.id}`)} />}
    </div>
  );
}
