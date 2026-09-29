import { useState } from 'react';
import { useData, type ClientInput } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import type { Client } from '../../lib/types';
import { Button, Modal } from '../ui';
import { ClientFields, emptyClient, validateClient, type ClientErrors } from './ClientFields';

export function ClientFormModal({
  client,
  onClose,
  onSaved,
}: {
  client?: Client;
  onClose: () => void;
  onSaved?: (client: Client) => void;
}) {
  const { createClient, updateClient } = useData();
  const toast = useToast();
  const [value, setValue] = useState<ClientInput>(() => {
    if (!client) return emptyClient();
    const { id: _id, lead_id: _l, created_by: _c, created_at: _ca, updated_at: _u, ...rest } = client;
    void _id; void _l; void _c; void _ca; void _u;
    return rest;
  });
  const [errors, setErrors] = useState<ClientErrors>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const errs = validateClient(value);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      if (client) {
        await updateClient(client.id, value);
        toast.success('Cliente atualizado.');
        onSaved?.({ ...client, ...value });
      } else {
        const saved = await createClient(value);
        toast.success('Cliente cadastrado.');
        onSaved?.(saved);
      }
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={client ? 'Editar cliente' : 'Novo cliente'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Salvar cliente
          </Button>
        </>
      }
    >
      <ClientFields value={value} onChange={setValue} errors={errors} />
    </Modal>
  );
}
