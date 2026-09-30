import { useState } from 'react';
import { CalendarPlus, ExternalLink, Trash2 } from 'lucide-react';
import { useData, type EventInput } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import type { CalendarEvent } from '../../lib/types';
import { googleCalendarLink, isoToLocalTime, localDateTimeToIso, today, toDateKey } from '../../lib/utils';
import { MemberPicker } from '../projects/ProjectFields';
import { Button, Checkbox, ConfirmDialog, Field, Input, Modal, Select, Textarea } from '../ui';

function addHour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${String(Math.min(23, h + 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Criar / editar reunião. Participantes recebem notificação. */
export function EventFormModal({
  event,
  defaults,
  onClose,
}: {
  event?: CalendarEvent;
  defaults?: Partial<EventInput> & { date?: string };
  onClose: () => void;
}) {
  const { db, me, isAdmin, createEvent, updateEvent, deleteEvent } = useData();
  const toast = useToast();
  const [title, setTitle] = useState(event?.title ?? defaults?.title ?? '');
  const [date, setDate] = useState(event ? toDateKey(new Date(event.starts_at)) : defaults?.date ?? today());
  const [start, setStart] = useState(event && !event.all_day ? isoToLocalTime(event.starts_at) : '09:00');
  const [end, setEnd] = useState(event?.ends_at && !event.all_day ? isoToLocalTime(event.ends_at) : '10:00');
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [location, setLocation] = useState(event?.location ?? defaults?.location ?? '');
  const [participants, setParticipants] = useState<string[]>(event?.participant_ids ?? defaults?.participant_ids ?? [me.id]);
  const [projectId, setProjectId] = useState(event?.project_id ?? defaults?.project_id ?? '');
  const [leadId, setLeadId] = useState(event?.lead_id ?? defaults?.lead_id ?? '');
  const [description, setDescription] = useState(event?.description ?? defaults?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canDelete = !!event && (isAdmin || event.created_by === me.id);

  const build = (): EventInput | null => {
    if (!title.trim()) {
      setError('Dê um título para a reunião.');
      return null;
    }
    if (!allDay && end <= start) {
      setError('O horário de término deve ser depois do início.');
      return null;
    }
    return {
      title: title.trim(),
      description: description.trim() || null,
      starts_at: localDateTimeToIso(date, allDay ? '00:00' : start),
      ends_at: allDay ? null : localDateTimeToIso(date, end),
      all_day: allDay,
      location: location.trim() || null,
      participant_ids: participants,
      project_id: projectId || null,
      lead_id: leadId || null,
    };
  };

  const save = async () => {
    const input = build();
    if (!input) return;
    setBusy(true);
    try {
      if (event) await updateEvent(event.id, input);
      else await createEvent(input);
      toast.success(event ? 'Reunião atualizada.' : 'Reunião agendada. Os participantes foram notificados.');
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const preview = title.trim()
    ? googleCalendarLink({
        title: title.trim(),
        starts_at: localDateTimeToIso(date, allDay ? '00:00' : start),
        ends_at: allDay ? null : localDateTimeToIso(date, end),
        all_day: allDay,
        location: location || null,
        description: description || null,
      })
    : null;

  const openProjects = db.projects.filter((p) => p.status !== 'cancelado').sort((a, b) => a.name.localeCompare(b.name));
  const openLeads = db.leads.filter((l) => db.lead_stages.find((s) => s.id === l.stage_id)?.kind !== 'lost').sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <Modal
        title={event ? 'Editar reunião' : 'Nova reunião'}
        onClose={onClose}
        footer={
          <>
            {canDelete && (
              <Button variant="ghost" className="mr-auto text-rose-600 hover:bg-rose-50" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>
                Cancelar reunião
              </Button>
            )}
            {preview && (
              <a href={preview} target="_blank" rel="noreferrer">
                <Button icon={<ExternalLink className="h-4 w-4" />}>Google Agenda</Button>
              </a>
            )}
            <Button variant="primary" loading={busy} onClick={save} icon={<CalendarPlus className="h-4 w-4" />}>
              {event ? 'Salvar' : 'Agendar'}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-6">
          <Field label="Assunto" required error={error} className="sm:col-span-6">
            <Input value={title} onChange={(e) => { setTitle(e.target.value); setError(null); }} placeholder="Ex.: Apresentação do anteprojeto — CASA J.D." autoFocus />
          </Field>
          <Field label="Data" className="sm:col-span-2">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Início" className="sm:col-span-2">
            <Input type="time" value={start} disabled={allDay} onChange={(e) => { setStart(e.target.value); if (e.target.value >= end) setEnd(addHour(e.target.value)); }} />
          </Field>
          <Field label="Término" className="sm:col-span-2">
            <Input type="time" value={end} disabled={allDay} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <div className="sm:col-span-6">
            <Checkbox checked={allDay} onChange={setAllDay} label="Dia inteiro" />
          </div>
          <Field label="Local ou link da chamada" className="sm:col-span-6">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Escritório, obra, Google Meet…" />
          </Field>
          <Field label="Participantes" className="sm:col-span-6">
            <MemberPicker users={db.profiles} value={participants} onChange={setParticipants} />
          </Field>
          <Field label="Projeto (opcional)" className="sm:col-span-3">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">—</option>
              {openProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Oportunidade (opcional)" className="sm:col-span-3">
            <Select value={leadId} onChange={(e) => setLeadId(e.target.value)}>
              <option value="">—</option>
              {openLeads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label="Pauta / observações" className="sm:col-span-6">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </Field>
        </div>
      </Modal>
      {confirmDelete && event && (
        <ConfirmDialog
          title="Cancelar reunião"
          danger
          confirmLabel="Cancelar reunião"
          message={<>Cancelar <b>{event.title}</b>? Os participantes serão avisados.</>}
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await deleteEvent(event.id);
            toast.success('Reunião cancelada.');
            onClose();
          }}
        />
      )}
    </>
  );
}
