import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Briefcase, Cake, FileText, Mail, MapPin, MessageCircle, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { INTERACTION_TYPES, PROJECT_STATUS } from '../lib/constants';
import { digitsOnly, formatCurrency, formatDate, formatDateTime } from '../lib/utils';
import { AvatarStack, Badge, Button, Card, ConfirmDialog, DueBadge, EmptyState, IconButton, ProgressBar } from '../components/ui';
import { ClientFormModal } from '../components/clients/ClientFormModal';
import { ProjectFormModal } from '../components/projects/ProjectFormModal';
import { useProjectSummaries } from '../components/projects/useProjectSummaries';

export default function ClientDetailPage() {
  const { id } = useParams();
  const { db, maps, isAdmin, settings, deleteClient } = useData();
  const summaries = useProjectSummaries();
  const toast = useToast();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const client = id ? maps.clients[id] : undefined;

  if (!client) {
    return <Card><EmptyState title="Cliente não encontrado" action={<Link to="/clientes"><Button>Voltar</Button></Link>} /></Card>;
  }

  const projects = summaries.filter((s) => s.project.client_id === client.id);
  const lead = client.lead_id ? maps.leads[client.lead_id] : null;
  const interactions = lead ? db.lead_interactions.filter((i) => i.lead_id === lead.id).sort((a, b) => b.happened_at.localeCompare(a.happened_at)) : [];

  return (
    <div>
      <Link to="/clientes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800">
        <ArrowLeft className="h-4 w-4" /> Clientes
      </Link>
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-tight">{client.name}</h1>
                <div className="text-sm text-stone-500">{client.document}{client.rg ? ` · RG ${client.rg}` : ''}</div>
              </div>
              <div className="flex">
                <IconButton label="Editar" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /></IconButton>
                {isAdmin && <IconButton label="Excluir" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" /></IconButton>}
              </div>
            </div>
            <div className="mt-4 space-y-2.5 text-sm">
              <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-stone-400" />{client.phone}</div>
              <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-stone-400" /><a className="text-brand-700 hover:underline" href={`mailto:${client.email}`}>{client.email}</a></div>
              {client.birth_date && <div className="flex items-center gap-2"><Cake className="h-4 w-4 text-stone-400" />{formatDate(client.birth_date)}</div>}
              {client.profession && <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-stone-400" />{client.profession}</div>}
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 text-stone-400" />
                <span>{client.street}, {client.number}{client.complement ? ` - ${client.complement}` : ''}<br />{client.neighborhood} · {client.city}/{client.state}<br />CEP {client.cep}</span>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <a href={`https://wa.me/55${digitsOnly(client.phone)}`} target="_blank" rel="noreferrer"><Button size="sm" icon={<MessageCircle className="h-4 w-4 text-emerald-600" />}>WhatsApp</Button></a>
            </div>
            {client.notes && <p className="mt-4 whitespace-pre-wrap rounded-xl bg-stone-50 p-3 text-sm text-stone-700">{client.notes}</p>}
          </Card>
          {lead && (
            <Card className="p-5">
              <h3 className="font-display text-sm font-semibold">Origem comercial</h3>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-stone-500">Origem</dt><dd>{lead.source_id ? maps.sources[lead.source_id]?.name : '—'}</dd></div>
                {lead.referred_by && <div className="flex justify-between"><dt className="text-stone-500">Indicação</dt><dd>{lead.referred_by}</dd></div>}
                <div className="flex justify-between"><dt className="text-stone-500">Proposta</dt><dd>{formatCurrency(lead.proposal_value)}</dd></div>
                <div className="flex justify-between"><dt className="text-stone-500">Convertido</dt><dd>{lead.converted_at ? formatDateTime(lead.converted_at) : '—'}</dd></div>
              </dl>
              <Link to={`/oportunidades?lead=${lead.id}`} className="mt-3 inline-block text-xs font-medium text-brand-700 hover:underline">Ver oportunidade →</Link>
              {interactions.length > 0 && (
                <ol className="mt-4 space-y-2 border-t border-line/70 pt-3">
                  {interactions.slice(0, 5).map((i) => (
                    <li key={i.id} className="text-xs"><Badge>{INTERACTION_TYPES[i.type]}</Badge> <span className="text-stone-400">{formatDate(i.happened_at.slice(0, 10))}</span><p className="mt-0.5 text-stone-600">{i.description}</p></li>
                  ))}
                </ol>
              )}
            </Card>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold tracking-tight">Projetos</h2>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setNewProject(true)}>Novo projeto</Button>
          </div>
          {projects.length === 0 ? (
            <Card><EmptyState icon={<Briefcase className="h-6 w-6" />} title="Nenhum projeto" /></Card>
          ) : (
            <div className="space-y-3">
              {projects.map((s) => {
                const st = PROJECT_STATUS[s.project.status];
                return (
                  <Link key={s.project.id} to={`/projetos/${s.project.id}`} className="card block p-4 hover:border-stone-300">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-stone-400">{s.project.code} · {s.type?.name}</div>
                        <div className="font-display text-base font-semibold">{s.project.name}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <DueBadge due={s.project.due_date} done={['concluido', 'cancelado'].includes(s.project.status)} soonDays={settings.due_soon_days} />
                        <Badge className={st.badge} dot={st.dot}>{st.label}</Badge>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <ProgressBar value={s.progress} className="flex-1" />
                      <span className="text-xs tabular">{s.progress}%</span>
                      <span className="hidden text-xs text-stone-500 sm:inline">Etapa: {s.phase}</span>
                      <AvatarStack users={s.people} size="xs" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {editing && <ClientFormModal client={client} onClose={() => setEditing(false)} />}
      {newProject && <ProjectFormModal clientId={client.id} onClose={() => setNewProject(false)} />}
      {confirmDelete && (
        <ConfirmDialog
          title="Excluir cliente"
          danger
          confirmLabel="Excluir"
          message={<>Excluir <b>{client.name}</b>? Só é possível excluir clientes sem projetos.</>}
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            try {
              await deleteClient(client.id);
              toast.success('Cliente excluído.');
              navigate('/clientes');
            } catch (e) {
              toast.error(e);
            }
          }}
        />
      )}
    </div>
  );
}
