import { useMemo, useState, type ReactNode } from 'react';
import { CalendarPlus, Mail, MessageCircle, Pencil, Phone, Trash2, Trophy, X, XCircle } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { INTERACTION_TYPES, LOST_REASONS } from '../../lib/constants';
import { stageColor } from '../../lib/status';
import type { InteractionType } from '../../lib/types';
import {
  byPosition,
  cn,
  diffDays,
  digitsOnly,
  formatCurrency,
  formatDate,
  formatDateShort,
  formatNumber,
  isoToLocalTime,
  parseDate,
  today,
  toDateKey,
  WEEKDAYS_SHORT,
} from '../../lib/utils';
import { ActionLink, Avatar, Button, ConfirmDialog, Drawer, Field, IconButton, Listbox, Modal, Select, Textarea } from '../ui';
import { ConvertLeadModal } from './ConvertLeadModal';
import { ContactLogModal } from './ContactLogModal';
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

/** "2 out, 14:30" */
function shortDateTime(iso: string) {
  return `${formatDateShort(toDateKey(new Date(iso)))}, ${isoToLocalTime(iso)}`;
}

function Section({ title, aside, children, className }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('border-t border-hairline-surface py-5', className)}>
      {(title || aside) && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          {title && <h3 className="text-[12.5px] text-faint">{title}</h3>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

function Detail({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('min-w-0', wide && 'col-span-2')}>
      <dt className="text-[12.5px] text-faint">{label}</dt>
      <dd className="mt-0.5 truncate text-body text-ink">{children}</dd>
    </div>
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
  const [logging, setLogging] = useState(false);
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
  const t = today();
  const stage = maps.stages[lead.stage_id];
  const open = stage?.kind === 'open';
  const owner = lead.owner_id ? maps.profiles[lead.owner_id] : null;
  const client = lead.client_id ? maps.clients[lead.client_id] : null;
  const project = client ? db.projects.find((p) => p.lead_id === lead.id || p.client_id === client.id) : null;
  const wonStage = stages.find((s) => s.kind === 'won');
  const lostStage = stages.find((s) => s.kind === 'lost');
  const phone = digitsOnly(lead.phone);
  const whatsapp = `https://wa.me/55${phone}`;
  const daysInStage = diffDays(toDateKey(new Date(lead.stage_changed_at)), t);
  const type = lead.project_type_id ? maps.types[lead.project_type_id] : null;
  const source = lead.source_id ? maps.sources[lead.source_id] : null;
  const subtitle = [lead.city + (lead.state ? `/${lead.state}` : ''), lead.area_m2 ? `${formatNumber(lead.area_m2)} m²` : null, lead.category]
    .filter(Boolean)
    .join(' · ');

  const changeStage = async (stageId: string) => {
    const target = maps.stages[stageId];
    if (target?.kind === 'lost') return setLosing(true);
    try {
      await moveLead(lead.id, stageId);
      if (target?.kind === 'won' && !lead.client_id) toast.success(`${lead.name} fechou! Complete os dados para virar cliente.`);
    } catch (e) {
      toast.error(e);
    }
  };

  const submitNote = async () => {
    if (!note.trim()) return;
    setSending(true);
    try {
      const at = noteDate === t ? new Date().toISOString() : new Date(`${noteDate}T12:00:00`).toISOString();
      await addInteraction(lead.id, noteType, note.trim(), at);
      setNote('');
    } catch (e) {
      toast.error(e);
    } finally {
      setSending(false);
    }
  };

  // Próximo retorno segundo a regra-mãe: vencido = danger, hoje = warning.
  const ret = lead.next_contact_date;
  const retText = !ret
    ? 'Sem retorno agendado'
    : ret < t
      ? `Atrasado desde ${formatDateShort(ret)}`
      : ret === t
        ? 'Hoje'
        : `${WEEKDAYS_SHORT[parseDate(ret).getDay()].toLowerCase()}, ${formatDateShort(ret)}`;
  const retClass = !ret ? 'text-faint' : ret < t ? 'text-danger-fg' : ret === t ? 'text-warning-fg' : 'text-ink';

  return (
    <Drawer onClose={onClose} label={lead.name}>
      {/* Cabeçalho */}
      <div className="px-6 pb-4 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-[12.5px] text-faint">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: stageColor(stage, stages) }} aria-hidden />
            <span className="truncate text-stone-700">{stage?.name}</span>
            <span className="shrink-0">· há {daysInStage} {daysInStage === 1 ? 'dia' : 'dias'}</span>
          </div>
          <div className="-mr-2 flex shrink-0 items-center">
            <IconButton label="Editar" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" strokeWidth={1.6} />
            </IconButton>
            {isAdmin && (
              <IconButton label="Excluir" size="sm" onClick={() => setConfirmDelete(true)} className="hover:text-danger-fg">
                <Trash2 className="h-4 w-4" strokeWidth={1.6} />
              </IconButton>
            )}
            <IconButton label="Fechar" size="sm" onClick={onClose}>
              <X className="h-[18px] w-[18px]" strokeWidth={1.6} />
            </IconButton>
          </div>
        </div>
        <h2 className="mt-2 font-display text-h2 text-ink">{lead.name}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
        <div className="-ml-2.5 mt-3 flex flex-wrap items-center gap-0.5">
          <a href={`tel:${phone}`}>
            <Button size="sm" variant="ghost" icon={<Phone className="h-4 w-4" strokeWidth={1.6} />}>
              Ligar
            </Button>
          </a>
          <a href={whatsapp} target="_blank" rel="noreferrer">
            <Button size="sm" variant="ghost" icon={<MessageCircle className="h-4 w-4" strokeWidth={1.6} />}>
              WhatsApp
            </Button>
          </a>
          {lead.email && (
            <a href={`mailto:${lead.email}`}>
              <Button size="sm" variant="ghost" icon={<Mail className="h-4 w-4" strokeWidth={1.6} />}>
                E-mail
              </Button>
            </a>
          )}
          <Button size="sm" variant="ghost" icon={<CalendarPlus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => setScheduling(true)}>
            Reunião
          </Button>
        </div>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-6 pb-8">
        {/* Etapa e desfecho */}
        <Section title="Etapa">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[200px] flex-1">
              <Listbox
                value={lead.stage_id}
                onChange={changeStage}
                aria-label="Etapa do funil"
                options={stages.map((s) => ({
                  value: s.id,
                  label: s.name,
                  icon: <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: stageColor(s, stages) }} />,
                }))}
              />
            </div>
            {open && wonStage && (
              <Button variant="ghost" icon={<Trophy className="h-4 w-4" strokeWidth={1.6} />} onClick={() => changeStage(wonStage.id)}>
                Ganho
              </Button>
            )}
            {open && lostStage && (
              <Button variant="ghost" icon={<XCircle className="h-4 w-4" strokeWidth={1.6} />} onClick={() => setLosing(true)}>
                Perdido
              </Button>
            )}
          </div>

          {stage?.kind === 'won' && !client && (
            <div className="mt-4 rounded-lg bg-success-bg px-4 py-3.5">
              <div className="text-body font-medium text-success-fg">Oportunidade fechada</div>
              <p className="mt-0.5 text-[13px] text-success-fg/80">Complete os dados do cliente para criar o projeto com as tarefas do modelo.</p>
              <Button variant="primary" size="sm" className="mt-3" onClick={() => setConverting(true)}>
                Virar cliente
              </Button>
            </div>
          )}
          {client && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px]">
              <span className="text-muted">
                Cliente desde {lead.converted_at ? formatDate(toDateKey(new Date(lead.converted_at))) : '—'}
              </span>
              <span className="flex items-center gap-4">
                <ActionLink to={`/clientes/${client.id}`}>Ver cliente</ActionLink>
                {project && <ActionLink to={`/projetos/${project.id}`}>Ver projeto</ActionLink>}
              </span>
            </div>
          )}
          {stage?.kind === 'lost' && lead.lost_reason && (
            <p className="mt-4 text-[13px] text-muted">
              <span className="text-faint">Motivo da perda:</span> {lead.lost_reason}
            </p>
          )}
        </Section>

        {/* Próximo retorno */}
        {open && (
          <Section title="Próximo retorno" aside={<ActionLink onClick={() => setLogging(true)}>Registrar contato</ActionLink>}>
            <div className="flex items-center justify-between gap-3">
              <span className={cn('text-body', retClass)}>{retText}</span>
              <input
                type="date"
                value={ret ?? ''}
                onChange={(e) => updateLead(lead.id, { next_contact_date: e.target.value || null }).catch(toast.error)}
                aria-label="Data do próximo retorno"
                className="input h-8 w-auto px-2 text-[13px]"
              />
            </div>
          </Section>
        )}

        {/* Dados */}
        <Section title="Dados">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Detail label="Proposta">
              <span className={cn('tabular', !lead.proposal_value && 'text-faint')}>{lead.proposal_value ? formatCurrency(lead.proposal_value) : 'Sem proposta'}</span>
            </Detail>
            <Detail label="Previsão de fechamento">
              {lead.expected_close_date ? formatDate(lead.expected_close_date) : <span className="text-faint">—</span>}
            </Detail>
            <Detail label="Tipo de projeto">{type?.name ?? <span className="text-faint">—</span>}</Detail>
            <Detail label="Origem">
              {source?.name ?? <span className="text-faint">—</span>}
              {lead.referred_by && <span className="text-muted"> · {lead.referred_by}</span>}
            </Detail>
            <Detail label="Telefone">
              <a href={whatsapp} target="_blank" rel="noreferrer" className="hover:underline hover:decoration-stone-300 hover:underline-offset-4">
                {lead.phone}
              </a>
            </Detail>
            <Detail label="E-mail">{lead.email || <span className="text-faint">—</span>}</Detail>
            <Detail label="Responsável">
              <span className="inline-flex items-center gap-2">
                <Avatar user={owner} size="xs" />
                {owner?.name ?? <span className="text-faint">Sem responsável</span>}
              </span>
            </Detail>
            <Detail label="Entrada">{formatDate(toDateKey(new Date(lead.created_at)))}</Detail>
          </dl>
          {lead.notes && <p className="mt-5 whitespace-pre-wrap text-body text-stone-700">{lead.notes}</p>}
        </Section>

        {/* Histórico */}
        <Section title={`Histórico${timeline.length ? ` · ${timeline.length}` : ''}`}>
          <div className="rounded-lg border border-line bg-surface transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-[0_0_0_3px_rgb(var(--accent)/0.22)]">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Registrar uma conversa ou anotação…"
              aria-label="Nova anotação"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitNote();
              }}
              className="block w-full resize-none rounded-t-lg bg-transparent px-3 pb-1 pt-2.5 text-body text-ink outline-none placeholder:text-faint focus-visible:shadow-none"
            />
            <div className="flex flex-wrap items-center gap-1 px-1.5 pb-1.5">
              <Listbox
                value={noteType}
                onChange={(v) => setNoteType(v as InteractionType)}
                aria-label="Tipo"
                options={Object.entries(INTERACTION_TYPES).map(([value, label]) => ({ value, label }))}
                className="h-7 w-auto gap-1 border-transparent bg-transparent px-2 text-[12.5px] text-muted shadow-none hover:bg-ink/5"
              />
              <input
                type="date"
                value={noteDate}
                max={t}
                onChange={(e) => setNoteDate(e.target.value)}
                aria-label="Data"
                className="h-7 rounded-sm bg-transparent px-2 text-[12.5px] text-muted outline-none hover:bg-ink/5"
              />
              <Button size="xs" variant="primary" className="ml-auto" loading={sending} onClick={submitNote} disabled={!note.trim()}>
                Registrar
              </Button>
            </div>
          </div>

          <ol className="mt-2">
            {timeline.map((i) => {
              const user = i.user_id ? maps.profiles[i.user_id] : null;
              return (
                <li key={i.id} className="border-b border-hairline-surface py-3.5 last:border-b-0">
                  <div className="text-[12.5px] text-faint">
                    <span className="text-stone-700">{INTERACTION_TYPES[i.type]}</span> · {shortDateTime(i.happened_at)}
                    {user && <> · {user.name.split(' ')[0]}</>}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-body text-stone-800">{i.description}</p>
                </li>
              );
            })}
            <li className="py-3.5 text-[12.5px] text-faint">Oportunidade criada em {shortDateTime(lead.created_at)}</li>
          </ol>
        </Section>
      </div>

      {editing && <LeadFormModal lead={lead} onClose={() => setEditing(false)} />}
      {converting && <ConvertLeadModal lead={lead} onClose={() => setConverting(false)} />}
      {logging && <ContactLogModal leadId={lead.id} onClose={() => setLogging(false)} />}
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
          message={
            <>
              Tem certeza que deseja excluir <b>{lead.name}</b>? O histórico de contatos também será removido.
            </>
          }
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
