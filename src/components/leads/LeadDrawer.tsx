import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CalendarPlus,
  FileText,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Ruler,
  Send,
  Tag,
  Trash2,
  Trophy,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { INTERACTION_TYPES, LOST_REASONS } from '../../lib/constants';
import type { InteractionType } from '../../lib/types';
import {
  byPosition,
  diffDays,
  digitsOnly,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  today,
  toDateKey,
} from '../../lib/utils';
import {
  Avatar,
  Badge,
  Button,
  ColorDot,
  ConfirmDialog,
  Drawer,
  Field,
  IconButton,
  Input,
  Modal,
  Select,
  Textarea,
} from '../ui';
import { ConvertLeadModal } from './ConvertLeadModal';
import { EventFormModal } from '../events/EventFormModal';
import { LeadFormModal } from './LeadFormModal';

export function LostReasonModal({ onConfirm, onClose }: { onConfirm: (reason: string) => Promise<void>; onClose: () => void }) {
  const [reason, setReason] = useState(LOST_REASONS[0]);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Marcar como perdido"
      subtitle="Registrar o motivo ajuda a entender onde o funil está vazando."
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(detail.trim() ? `${reason} — ${detail.trim()}` : reason);
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirmar perda
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Motivo">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {LOST_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <Field label="Detalhes (opcional)">
          <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}

export function LeadDrawer({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const { db, maps, isAdmin, moveLead, deleteLead, addInteraction, updateLead } = useData();
  const toast = useToast();
  const lead = maps.leads[leadId];
  const [editing, setEditing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [losing, setLosing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [noteType, setNoteType] = useState<InteractionType>('nota');
  const [note, setNote] = useState('');
  const [noteDate, setNoteDate] = useState(today());
  const [sending, setSending] = useState(false);

  const stages = useMemo(() => [...db.lead_stages].sort(byPosition), [db.lead_stages]);
  const timeline = useMemo(
    () => db.lead_interactions.filter((i) => i.lead_id === leadId).sort((a, b) => b.happened_at.localeCompare(a.happened_at)),
    [db.lead_interactions, leadId],
  );

  if (!lead) return null;
  const stage = maps.stages[lead.stage_id];
  const owner = lead.owner_id ? maps.profiles[lead.owner_id] : null;
  const client = lead.client_id ? maps.clients[lead.client_id] : null;
  const project = client ? db.projects.find((p) => p.lead_id === lead.id || p.client_id === client.id) : null;
  const wonStage = stages.find((s) => s.kind === 'won');
  const lostStage = stages.find((s) => s.kind === 'lost');
  const whatsapp = `https://wa.me/55${digitsOnly(lead.phone)}`;

  const changeStage = async (stageId: string) => {
    const target = maps.stages[stageId];
    if (target?.kind === 'lost') return setLosing(true);
    try {
      await moveLead(lead.id, stageId);
    } catch (e) {
      toast.error(e);
    }
  };

  const submitNote = async () => {
    if (!note.trim()) return;
    setSending(true);
    try {
      const at = noteDate === today() ? new Date().toISOString() : new Date(`${noteDate}T12:00:00`).toISOString();
      await addInteraction(lead.id, noteType, note.trim(), at);
      setNote('');
    } catch (e) {
      toast.error(e);
    } finally {
      setSending(false);
    }
  };

  const info: Array<[React.ReactNode, string, React.ReactNode]> = [
    [<Phone key="p" className="h-4 w-4" />, 'Telefone', <a key="pv" href={whatsapp} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">{lead.phone}</a>],
    [<Mail key="m" className="h-4 w-4" />, 'E-mail', lead.email || '—'],
    [<MapPin key="c" className="h-4 w-4" />, 'Cidade', `${lead.city}${lead.state ? `/${lead.state}` : ''}`],
    [<Building2 key="t" className="h-4 w-4" />, 'Tipo de projeto', lead.project_type_id ? maps.types[lead.project_type_id]?.name ?? '—' : '—'],
    [<Ruler key="r" className="h-4 w-4" />, 'Tamanho', lead.area_m2 ? `${formatNumber(lead.area_m2)} m² · ${lead.category ?? ''}` : lead.category ?? '—'],
    [<Tag key="s" className="h-4 w-4" />, 'Origem', `${lead.source_id ? maps.sources[lead.source_id]?.name ?? '—' : '—'}${lead.referred_by ? ` · ${lead.referred_by}` : ''}`],
    [<FileText key="v" className="h-4 w-4" />, 'Proposta', formatCurrency(lead.proposal_value)],
    [<CalendarClock key="n" className="h-4 w-4" />, 'Próximo contato', lead.next_contact_date ? formatDate(lead.next_contact_date) : '—'],
  ];

  const followUpLate = lead.next_contact_date && lead.next_contact_date < today() && stage?.kind === 'open';

  return (
    <Drawer onClose={onClose}>
      <div className="flex items-start justify-between gap-3 border-b border-line/70 px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <ColorDot color={stage?.color ?? '#999'} /> {stage?.name}
            <span>· há {diffDays(toDateKey(new Date(lead.stage_changed_at)), today())} dias nesta etapa</span>
          </div>
          <h2 className="mt-1 truncate font-display text-xl font-semibold tracking-tight">{lead.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {client && <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-200"><UserCheck className="h-3 w-3" /> Cliente</Badge>}
            {followUpLate && <Badge className="bg-rose-50 text-rose-700 ring-rose-200">Retorno atrasado</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <IconButton label="Editar" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /></IconButton>
          {isAdmin && <IconButton label="Excluir" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" /></IconButton>}
          <IconButton label="Fechar" onClick={onClose}><X className="h-5 w-5" /></IconButton>
        </div>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto">
        <div className="space-y-6 px-6 py-5">
          {/* Etapa */}
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Etapa do funil" className="min-w-[200px] flex-1">
              <Select value={lead.stage_id} onChange={(e) => changeStage(e.target.value)}>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
            {stage?.kind === 'open' && wonStage && (
              <Button variant="secondary" icon={<Trophy className="h-4 w-4 text-emerald-600" />} onClick={() => changeStage(wonStage.id)}>
                Fechado
              </Button>
            )}
            {stage?.kind === 'open' && lostStage && (
              <Button variant="secondary" icon={<XCircle className="h-4 w-4 text-rose-500" />} onClick={() => setLosing(true)}>
                Perdido
              </Button>
            )}
          </div>

          {/* Conversão */}
          {stage?.kind === 'won' && !client && (
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white"><Trophy className="h-5 w-5" /></div>
                <div className="flex-1">
                  <div className="font-display font-semibold text-emerald-900">Projeto fechado! 🎉</div>
                  <p className="mt-0.5 text-sm text-emerald-800/80">
                    Complete os dados do cliente para convertê-lo e iniciar o projeto com as tarefas do modelo.
                  </p>
                  <Button variant="primary" className="mt-3 bg-emerald-600 hover:bg-emerald-700" icon={<UserCheck className="h-4 w-4" />} onClick={() => setConverting(true)}>
                    Virar cliente
                  </Button>
                </div>
              </div>
            </div>
          )}
          {client && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-stone-50 p-4">
              <div className="text-sm">
                <div className="font-semibold text-stone-800">Convertido em cliente</div>
                <div className="text-stone-500">{lead.converted_at ? formatDateTime(lead.converted_at) : ''}</div>
              </div>
              <div className="flex gap-2">
                <Link to={`/clientes/${client.id}`}><Button size="sm">Ver cliente</Button></Link>
                {project && <Link to={`/projetos/${project.id}`}><Button size="sm" variant="dark" icon={<ArrowRight className="h-3.5 w-3.5" />}>Projeto</Button></Link>}
              </div>
            </div>
          )}
          {stage?.kind === 'lost' && lead.lost_reason && (
            <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <span className="font-semibold">Motivo da perda:</span> {lead.lost_reason}
            </div>
          )}

          {/* Informações */}
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {info.map(([icon, label, value]) => (
              <div key={label} className="flex items-start gap-3">
                <span className="mt-0.5 text-stone-400">{icon}</span>
                <div className="min-w-0">
                  <div className="text-xs text-stone-500">{label}</div>
                  <div className="truncate text-sm font-medium text-stone-800">{value}</div>
                </div>
              </div>
            ))}
            <div className="flex items-start gap-3">
              <Avatar user={owner} size="sm" />
              <div>
                <div className="text-xs text-stone-500">Responsável</div>
                <div className="text-sm font-medium text-stone-800">{owner?.name ?? 'Sem responsável'}</div>
              </div>
            </div>
          </div>
          {lead.notes && <p className="whitespace-pre-wrap rounded-xl bg-stone-50 p-4 text-sm text-stone-700">{lead.notes}</p>}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<CalendarPlus className="h-4 w-4" />} onClick={() => setScheduling(true)}>Agendar reunião</Button>
            <a href={whatsapp} target="_blank" rel="noreferrer">
              <Button size="sm" icon={<MessageCircle className="h-4 w-4 text-emerald-600" />}>WhatsApp</Button>
            </a>
            {lead.email && (
              <a href={`mailto:${lead.email}`}>
                <Button size="sm" icon={<Mail className="h-4 w-4" />}>E-mail</Button>
              </a>
            )}
            <label className="inline-flex h-8 items-center gap-2 rounded-lg border border-stone-300 bg-white pl-3 text-sm font-medium text-stone-800">
              <CalendarClock className="h-4 w-4" />
              Retorno
              <input
                type="date"
                value={lead.next_contact_date ?? ''}
                onChange={(e) => updateLead(lead.id, { next_contact_date: e.target.value || null }).catch(toast.error)}
                className="h-full rounded-r-lg border-l border-line bg-stone-50 px-2 text-xs outline-none"
                aria-label="Data do próximo contato"
              />
            </label>
          </div>

          {/* Histórico */}
          <div>
            <h3 className="mb-3 font-display text-sm font-semibold">Histórico de contatos</h3>
            <div className="rounded-xl border border-line p-3">
              <div className="mb-2 flex flex-wrap gap-2">
                <Select value={noteType} onChange={(e) => setNoteType(e.target.value as InteractionType)} className="h-8 w-auto py-1 text-xs">
                  {Object.entries(INTERACTION_TYPES).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </Select>
                <Input type="date" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} className="h-8 w-auto py-1 text-xs" />
              </div>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="O que foi conversado?"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitNote();
                }}
              />
              <div className="mt-2 flex justify-end">
                <Button size="sm" variant="dark" loading={sending} onClick={submitNote} icon={<Send className="h-3.5 w-3.5" />} disabled={!note.trim()}>
                  Registrar
                </Button>
              </div>
            </div>
            <ol className="relative mt-4 space-y-4 border-l border-line pl-5">
              {timeline.map((i) => {
                const user = i.user_id ? maps.profiles[i.user_id] : null;
                return (
                  <li key={i.id} className="relative">
                    <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-500 ring-1 ring-brand-200" />
                    <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                      <Badge>{INTERACTION_TYPES[i.type]}</Badge>
                      <span>{formatDateTime(i.happened_at)}</span>
                      {user && <span>· {user.name}</span>}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{i.description}</p>
                  </li>
                );
              })}
              <li className="relative">
                <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-stone-300" />
                <div className="text-xs text-stone-500">Oportunidade criada em {formatDateTime(lead.created_at)}</div>
              </li>
            </ol>
          </div>
        </div>
      </div>

      {editing && <LeadFormModal lead={lead} onClose={() => setEditing(false)} />}
      {converting && <ConvertLeadModal lead={lead} onClose={() => setConverting(false)} />}
      {scheduling && (
        <EventFormModal
          defaults={{ title: `Reunião com ${lead.name}`, lead_id: lead.id, participant_ids: lead.owner_id ? [lead.owner_id] : [] }}
          onClose={() => setScheduling(false)}
        />
      )}
      {losing && lostStage && (
        <LostReasonModal
          onClose={() => setLosing(false)}
          onConfirm={async (reason) => {
            await moveLead(lead.id, lostStage.id, null, { lost_reason: reason });
          }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Excluir oportunidade"
          message={<>Tem certeza que deseja excluir <b>{lead.name}</b>? O histórico de contatos também será removido.</>}
          confirmLabel="Excluir"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await deleteLead(lead.id);
            toast.success('Oportunidade excluída.');
            onClose();
          }}
        />
      )}
    </Drawer>
  );
}
