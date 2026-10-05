import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MessageCircle, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { INTERACTION_TYPES } from '../lib/constants';
import { isProjectActive } from '../lib/domain';
import { digitsOnly, formatCurrency, formatDate, formatDateShort, isoToLocalTime, toDateKey } from '../lib/utils';
import { ActionLink, AvatarStack, BackLink, Button, ConfirmDialog, EmptyState, IconButton, PageHeader, SectionHeader, StatusBadge } from '../components/ui';
import { ClientEditModal } from '../components/clients/ClientEditModal';
import { ClientFinanceSection } from '../components/finance/ClientFinanceSection';
import { ProjectFormModal } from '../components/projects/ProjectFormModal';
import { useProjectSummaries } from '../components/projects/useProjectSummaries';
import { projectRail, templatePhasesByType } from '../components/projects/rail';
import { ProjectDeadline, StageRail } from '../components/projects/StageRail';

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-t border-hairline py-3">
      <dt className="text-[12.5px] text-faint">{label}</dt>
      <dd className="mt-0.5 text-body text-ink">{children}</dd>
    </div>
  );
}

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
  const templates = useMemo(() => templatePhasesByType(db.task_templates), [db.task_templates]);

  if (!client) {
    return (
      <div>
        <BackLink to="/clientes">Clientes</BackLink>
        <EmptyState title="Cliente não encontrado" description="Ele pode ter sido excluído." className="py-20" />
      </div>
    );
  }

  const projects = summaries.filter((s) => s.project.client_id === client.id);
  const active = projects.filter((s) => isProjectActive(s.project));
  const lead = client.lead_id ? maps.leads[client.lead_id] : null;
  const interactions = lead
    ? db.lead_interactions.filter((i) => i.lead_id === lead.id).sort((a, b) => b.happened_at.localeCompare(a.happened_at))
    : [];
  const phone = digitsOnly(client.phone);

  return (
    <div>
      <BackLink to="/clientes">Clientes</BackLink>
      <PageHeader
        className="md:pt-4"
        eyebrow={[client.document, client.rg ? `RG ${client.rg}` : null].filter(Boolean).join(' · ')}
        title={client.name}
        description={
          <>
            {client.city}/{client.state} · cliente desde {formatDate(toDateKey(new Date(client.created_at)))} · {projects.length}{' '}
            {projects.length === 1 ? 'projeto' : 'projetos'}
            {active.length > 0 && <> ({active.length} em andamento)</>}
          </>
        }
        actions={
          <>
            <a href={`tel:${phone}`} className="max-sm:hidden">
              <Button variant="ghost" icon={<Phone className="h-4 w-4" strokeWidth={1.6} />}>
                Ligar
              </Button>
            </a>
            <a href={`https://wa.me/55${phone}`} target="_blank" rel="noreferrer">
              <Button variant="ghost" icon={<MessageCircle className="h-4 w-4" strokeWidth={1.6} />}>
                WhatsApp
              </Button>
            </a>
            <Button variant="secondary" icon={<Pencil className="h-4 w-4" strokeWidth={1.6} />} onClick={() => setEditing(true)}>
              Editar
            </Button>
            {isAdmin && (
              <IconButton label="Excluir cliente" onClick={() => setConfirmDelete(true)} className="hover:text-danger-fg">
                <Trash2 className="h-4 w-4" strokeWidth={1.6} />
              </IconButton>
            )}
            <Button variant="primary" icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => setNewProject(true)}>
              Projeto
            </Button>
          </>
        }
      />

      <div className="grid gap-12 lg:grid-cols-[1fr_300px] lg:gap-16">
        <div className="min-w-0 space-y-12">
          <section aria-labelledby="projetos">
            <SectionHeader id="projetos" title="Projetos" aside={<span className="text-[13px] text-faint">{projects.length}</span>} />
            {projects.length === 0 ? (
              <EmptyState
                title="Nenhum projeto"
                description="Crie um projeto para este cliente com as tarefas do modelo."
                action={<ActionLink onClick={() => setNewProject(true)}>Novo projeto</ActionLink>}
                className="border-t border-hairline py-10"
              />
            ) : (
              <ul>
                {projects.map((s) => {
                  const { phases, current } = projectRail(s, templates[s.project.project_type_id]);
                  const finished = s.project.status === 'concluido' || s.project.status === 'cancelado';
                  return (
                    <li key={s.project.id}>
                      <Link
                        to={`/projetos/${s.project.id}`}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 border-t border-hairline py-4 transition-colors hover:bg-ink/[0.025] md:grid-cols-[170px_minmax(0,1fr)_44px_120px_56px] md:gap-x-6"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-display text-[14.5px] font-semibold tracking-[0.01em] text-ink">{s.project.name}</div>
                          <div className="truncate text-[12.5px] text-faint">{s.type?.name ?? s.project.code}</div>
                        </div>
                        <div className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:row-start-auto">
                          {finished ? (
                            <StatusBadge kind="project" value={s.project.status} />
                          ) : (
                            <>
                              <StageRail phases={phases} current={current} />
                              <div className="mt-2 truncate text-[12.5px] text-muted">{s.phase}</div>
                            </>
                          )}
                        </div>
                        <div className="hidden text-right text-[13px] tabular text-muted md:block">{s.progress}%</div>
                        <div className="col-start-2 row-start-1 text-right md:col-start-auto md:row-start-auto md:text-left">
                          <ProjectDeadline due={s.project.due_date} soonDays={settings.due_soon_days} done={s.project.status === 'concluido'} />
                        </div>
                        <div className="hidden justify-end md:flex">
                          <AvatarStack users={s.people} max={3} size={22} ring="ring-canvas" />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <ClientFinanceSection client={client} lead={lead} projectIds={projects.map((s) => s.project.id)} />

          {lead && (
            <section aria-labelledby="historico">
              <SectionHeader id="historico" title="Histórico comercial" aside={<ActionLink to={`/oportunidades?lead=${lead.id}`} muted>Ver oportunidade</ActionLink>} />
              {interactions.length === 0 ? (
                <p className="border-t border-hairline py-4 text-[13px] text-faint">Nenhum contato registrado.</p>
              ) : (
                <ol>
                  {interactions.slice(0, 8).map((i) => {
                    const user = i.user_id ? maps.profiles[i.user_id] : null;
                    return (
                      <li key={i.id} className="border-t border-hairline py-3.5">
                        <div className="text-[12.5px] text-faint">
                          <span className="text-stone-700">{INTERACTION_TYPES[i.type]}</span> · {formatDateShort(toDateKey(new Date(i.happened_at)))},{' '}
                          {isoToLocalTime(i.happened_at)}
                          {user && <> · {user.name.split(' ')[0]}</>}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-body text-stone-800">{i.description}</p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          )}
        </div>

        <aside className="min-w-0 space-y-10">
          <section aria-labelledby="dados">
            <SectionHeader id="dados" title="Dados" />
            <dl>
              <Detail label="Telefone">{client.phone}</Detail>
              <Detail label="E-mail">
                <a href={`mailto:${client.email}`} className="break-all hover:underline hover:decoration-stone-300 hover:underline-offset-4">
                  {client.email}
                </a>
              </Detail>
              {client.birth_date && <Detail label="Nascimento">{formatDate(client.birth_date)}</Detail>}
              {client.profession && <Detail label="Profissão">{client.profession}</Detail>}
              <Detail label="Endereço">
                {client.street}, {client.number}
                {client.complement ? ` - ${client.complement}` : ''}
                <span className="block text-[13px] text-muted">
                  {client.neighborhood} · {client.city}/{client.state} · CEP {client.cep}
                </span>
              </Detail>
            </dl>
            {client.notes && <p className="mt-4 whitespace-pre-wrap border-t border-hairline pt-4 text-body text-stone-700">{client.notes}</p>}
          </section>

          {lead && (
            <section aria-labelledby="origem">
              <SectionHeader id="origem" title="Origem comercial" />
              <dl>
                <Detail label="Origem">
                  {lead.source_id ? maps.sources[lead.source_id]?.name : '—'}
                  {lead.referred_by && <span className="text-muted"> · {lead.referred_by}</span>}
                </Detail>
                <Detail label={lead.payment_plan ? 'Valor fechado' : 'Proposta'}>{formatCurrency(lead.payment_plan?.total ?? lead.proposal_value)}</Detail>
                <Detail label="Convertido em">{lead.converted_at ? formatDate(toDateKey(new Date(lead.converted_at))) : '—'}</Detail>
              </dl>
            </section>
          )}
        </aside>
      </div>

      {editing && <ClientEditModal client={client} onClose={() => setEditing(false)} />}
      {newProject && <ProjectFormModal clientId={client.id} onClose={() => setNewProject(false)} />}
      {confirmDelete && (
        <ConfirmDialog
          title="Excluir cliente"
          danger
          confirmLabel="Excluir"
          message={
            <>
              Excluir <b>{client.name}</b>? Só é possível excluir clientes sem projetos.
            </>
          }
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
