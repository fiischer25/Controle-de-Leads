import { useState } from 'react';
import { useData, type LeadInput } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { BR_STATES, LEAD_CATEGORIES } from '../../lib/constants';
import type { Lead, LeadCategory } from '../../lib/types';
import { funnelOrder } from '../../lib/status';
import { byPosition, digitsOnly, maskPhone, normalize } from '../../lib/utils';
import { Button, Field, Input, Modal, Select, Textarea, UserSelect } from '../ui';
import { MoneyInput } from '../finance/MoneyInput';

export function LeadFormModal({
  lead,
  defaultStageId,
  onClose,
  onSaved,
}: {
  lead?: Lead;
  defaultStageId?: string;
  onClose: () => void;
  onSaved?: (lead: Lead) => void;
}) {
  const { db, me, createLead, updateLead } = useData();
  const toast = useToast();
  const stages = funnelOrder(db.lead_stages);
  const [v, setV] = useState<LeadInput>(() => ({
    name: lead?.name ?? '',
    phone: lead?.phone ?? '',
    email: lead?.email ?? null,
    city: lead?.city ?? '',
    state: lead?.state ?? 'PR',
    area_m2: lead?.area_m2 ?? null,
    category: lead?.category ?? 'Residencial',
    project_type_id: lead?.project_type_id ?? null,
    source_id: lead?.source_id ?? null,
    referred_by: lead?.referred_by ?? null,
    proposal_value: lead?.proposal_value ?? null,
    stage_id: lead?.stage_id ?? defaultStageId ?? stages.find((s) => s.kind === 'open')?.id ?? '',
    owner_id: lead ? lead.owner_id : me.id,
    next_contact_date: lead?.next_contact_date ?? null,
    expected_close_date: lead?.expected_close_date ?? null,
    lost_reason: lead?.lost_reason ?? null,
    notes: lead?.notes ?? null,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof LeadInput>(k: K, value: LeadInput[K]) => setV((p) => ({ ...p, [k]: value }));

  const source = v.source_id ? db.lead_sources.find((s) => s.id === v.source_id) : null;
  const isReferral = source ? normalize(source.name).includes('indica') || normalize(source.name).includes('parceiro') : false;

  const save = async () => {
    const e: Record<string, string> = {};
    if (!v.name.trim()) e.name = 'Informe o nome';
    if (digitsOnly(v.phone).length < 10) e.phone = 'Telefone incompleto';
    if (!v.city.trim()) e.city = 'Informe a cidade do projeto';
    if (!v.stage_id) e.stage_id = 'Selecione a etapa';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (lead) {
        await updateLead(lead.id, v);
        toast.success('Oportunidade atualizada.');
        onSaved?.({ ...lead, ...v });
      } else {
        const saved = await createLead(v);
        toast.success('Oportunidade cadastrada.');
        onSaved?.(saved);
      }
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={lead ? 'Editar oportunidade' : 'Nova oportunidade'}
      subtitle={lead ? undefined : 'Cadastre o primeiro contato. Os dados completos do cliente só são exigidos ao converter.'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {lead ? 'Salvar alterações' : 'Cadastrar oportunidade'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-6">
        <Field label="Nome do lead" required error={errors.name} className="sm:col-span-4">
          <Input value={v.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} autoFocus />
        </Field>
        <Field label="Telefone / WhatsApp" required error={errors.phone} className="sm:col-span-2">
          <Input value={v.phone} onChange={(e) => set('phone', maskPhone(e.target.value))} invalid={!!errors.phone} inputMode="tel" placeholder="(41) 99999-9999" />
        </Field>
        <Field label="E-mail" className="sm:col-span-3">
          <Input type="email" value={v.email ?? ''} onChange={(e) => set('email', e.target.value || null)} />
        </Field>
        <Field label="Cidade do projeto" required error={errors.city} className="sm:col-span-2">
          <Input value={v.city} onChange={(e) => set('city', e.target.value)} invalid={!!errors.city} />
        </Field>
        <Field label="UF" className="sm:col-span-1">
          <Select value={v.state ?? ''} onChange={(e) => set('state', e.target.value || null)}>
            <option value="">—</option>
            {BR_STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tipo de projeto" className="sm:col-span-2">
          <Select value={v.project_type_id ?? ''} onChange={(e) => set('project_type_id', e.target.value || null)}>
            <option value="">Não definido</option>
            {db.project_types
              .filter((t) => t.active || t.id === v.project_type_id)
              .sort(byPosition)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Categoria" className="sm:col-span-2">
          <Select value={v.category ?? ''} onChange={(e) => set('category', (e.target.value || null) as LeadCategory | null)}>
            <option value="">—</option>
            {LEAD_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tamanho (m²)" className="sm:col-span-2">
          <Input type="number" min={0} value={v.area_m2 ?? ''} onChange={(e) => set('area_m2', e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <Field label="Como chegou até nós" className="sm:col-span-3">
          <Select value={v.source_id ?? ''} onChange={(e) => set('source_id', e.target.value || null)}>
            <option value="">Não informado</option>
            {db.lead_sources
              .filter((s) => s.active || s.id === v.source_id)
              .sort(byPosition)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label={isReferral ? 'Indicado por' : 'Indicação / campanha'} className="sm:col-span-3">
          <Input value={v.referred_by ?? ''} onChange={(e) => set('referred_by', e.target.value || null)} placeholder={isReferral ? 'Quem indicou?' : 'Opcional'} />
        </Field>
        <Field label="Valor da proposta (R$)" className="sm:col-span-2">
          <MoneyInput value={v.proposal_value} onChange={(n) => set('proposal_value', n)} aria-label="Valor da proposta" />
        </Field>
        <Field label="Etapa" required error={errors.stage_id} className="sm:col-span-2">
          <Select value={v.stage_id} onChange={(e) => set('stage_id', e.target.value)}>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Responsável" className="sm:col-span-2">
          <UserSelect users={db.profiles} value={v.owner_id} onChange={(id) => set('owner_id', id)} />
        </Field>
        <Field label="Próximo contato" className="sm:col-span-3" hint="Gera lembrete no Início e na Agenda.">
          <Input type="date" value={v.next_contact_date ?? ''} onChange={(e) => set('next_contact_date', e.target.value || null)} />
        </Field>
        <Field label="Previsão de fechamento" className="sm:col-span-3">
          <Input type="date" value={v.expected_close_date ?? ''} onChange={(e) => set('expected_close_date', e.target.value || null)} />
        </Field>
        <Field label="Observações" className="sm:col-span-6">
          <Textarea value={v.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} placeholder="Necessidades, estilo, prazos desejados…" />
        </Field>
      </div>
    </Modal>
  );
}
