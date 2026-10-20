import { useState } from 'react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import type { ObraSupplier } from '../../lib/types';
import { nowIso, uid } from '../../lib/utils';
import { Button, Checkbox, Field, Input, Modal, Textarea } from '../ui';

/** Cadastro de fornecedor/prestador (empreiteiro, eletricista, loja de material…). */
export function SupplierModal({ supplier, initialName, onClose, onSaved }: { supplier: ObraSupplier | null; initialName?: string; onClose: () => void; onSaved?: (s: ObraSupplier) => void }) {
  const { insertRows, patch } = useData();
  const toast = useToast();
  const [form, setForm] = useState<ObraSupplier>(
    () =>
      supplier ?? { id: uid(), name: initialName ?? '', trade: null, contact: null, phone: null, email: null, document: null, pix: null, notes: null, active: true, created_at: nowIso() },
  );
  const [busy, setBusy] = useState(false);
  const set = (c: Partial<ObraSupplier>) => setForm((f) => ({ ...f, ...c }));
  const save = async () => {
    if (!form.name.trim()) return toast.error('Informe o nome do fornecedor.');
    setBusy(true);
    try {
      const row = { ...form, name: form.name.trim() };
      if (supplier) await patch('obra_suppliers', supplier.id, row);
      else await insertRows('obra_suppliers', [row]);
      toast.success('Fornecedor salvo.');
      onSaved?.(row);
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const text = (k: keyof ObraSupplier, label: string, props: { className?: string; placeholder?: string; inputMode?: 'tel' | 'email' } = {}) => (
    <Field label={label} className={props.className}>
      <Input value={(form[k] as string | null) ?? ''} inputMode={props.inputMode} placeholder={props.placeholder} onChange={(e) => set({ [k]: e.target.value || null } as Partial<ObraSupplier>)} />
    </Field>
  );
  return (
    <Modal
      title={supplier ? 'Editar fornecedor' : 'Novo fornecedor'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" required className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
        </Field>
        {text('trade', 'Especialidade', { placeholder: 'Ex.: Elétrica, Pintura, Marcenaria' })}
        {text('contact', 'Contato')}
        {text('phone', 'Telefone / WhatsApp', { inputMode: 'tel' })}
        {text('email', 'E-mail', { inputMode: 'email' })}
        {text('document', 'CPF / CNPJ')}
        {text('pix', 'Chave Pix')}
        <Field label="Observações" className="sm:col-span-2">
          <Textarea value={form.notes ?? ''} onChange={(e) => set({ notes: e.target.value || null })} />
        </Field>
        {supplier && (
          <Checkbox className="sm:col-span-2" checked={form.active} onChange={(v) => set({ active: v })} label="Ativo (aparece ao lançar pagamentos)" />
        )}
      </div>
    </Modal>
  );
}
