import { useState } from 'react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { INTERACTION_TYPES } from '../../lib/constants';
import type { InteractionType } from '../../lib/types';
import { addBusinessDays, formatCurrency, today } from '../../lib/utils';
import { Button, Field, Input, Listbox, Modal, Textarea } from '../ui';

/**
 * "Registrar contato": grava o contato no histórico da oportunidade e já agenda
 * a data do próximo retorno (ou limpa o lembrete).
 */
export function ContactLogModal({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const { maps, addInteraction, updateLead } = useData();
  const toast = useToast();
  const lead = maps.leads[leadId];
  const [type, setType] = useState<InteractionType>('ligacao');
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [next, setNext] = useState(addBusinessDays(today(), 3));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!lead) return null;
  const stage = maps.stages[lead.stage_id];

  const submit = async () => {
    if (!description.trim()) return setError('Conte rapidamente o que foi conversado.');
    setBusy(true);
    try {
      const at = date === today() ? new Date().toISOString() : new Date(`${date}T12:00:00`).toISOString();
      await addInteraction(lead.id, type, description.trim(), at);
      await updateLead(lead.id, { next_contact_date: next || null });
      toast.success(next ? 'Contato registrado e retorno agendado.' : 'Contato registrado.');
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Registrar contato"
      subtitle={[lead.name, stage?.name, lead.proposal_value ? formatCurrency(lead.proposal_value) : null].filter(Boolean).join(' · ')}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} loadingText="Salvando…" onClick={submit}>
            Registrar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <Listbox
              value={type}
              onChange={(v) => setType(v as InteractionType)}
              options={Object.entries(INTERACTION_TYPES).map(([value, label]) => ({ value, label }))}
              aria-label="Tipo de contato"
            />
          </Field>
          <Field label="Data">
            <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="O que foi conversado?" required error={error}>
          <Textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setError(null);
            }}
            rows={3}
            invalid={!!error}
            autoFocus
            placeholder="Ex.: pediu ajuste na proposta, retornar com nova versão."
          />
        </Field>
        <Field label="Próximo retorno" hint="Deixe em branco para não agendar um novo retorno.">
          <Input type="date" value={next} min={today()} onChange={(e) => setNext(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
