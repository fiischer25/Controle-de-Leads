/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import type { ClientInput } from '../../context/DataContext';
import { BR_STATES } from '../../lib/constants';
import { digitsOnly, isValidDocument, isValidEmail, maskCep, maskDocument, maskPhone } from '../../lib/utils';
import { Field, Input, Select, Textarea } from '../ui';

export type ClientErrors = Partial<Record<keyof ClientInput, string>>;

export const REQUIRED_CLIENT_FIELDS: Array<[keyof ClientInput, string]> = [
  ['name', 'Nome completo'],
  ['document', 'CPF/CNPJ'],
  ['email', 'E-mail'],
  ['phone', 'Telefone'],
  ['cep', 'CEP'],
  ['street', 'Rua'],
  ['number', 'Número'],
  ['neighborhood', 'Bairro'],
  ['city', 'Cidade'],
  ['state', 'UF'],
];

export function emptyClient(partial: Partial<ClientInput> = {}): ClientInput {
  return {
    name: '', document: '', rg: null, birth_date: null, email: '', phone: '', profession: null,
    cep: '', street: '', number: '', complement: null, neighborhood: '', city: '', state: 'PR', notes: null,
    ...partial,
  };
}

export function validateClient(c: ClientInput): ClientErrors {
  const errors: ClientErrors = {};
  for (const [key, label] of REQUIRED_CLIENT_FIELDS) {
    const v = c[key];
    if (typeof v !== 'string' || !v.trim()) errors[key] = `${label} é obrigatório`;
  }
  if (c.document && !isValidDocument(c.document)) errors.document = 'CPF/CNPJ inválido';
  if (c.email && !isValidEmail(c.email)) errors.email = 'E-mail inválido';
  if (c.phone && digitsOnly(c.phone).length < 10) errors.phone = 'Telefone incompleto';
  if (c.cep && digitsOnly(c.cep).length !== 8) errors.cep = 'CEP deve ter 8 dígitos';
  return errors;
}

export function ClientFields({
  value,
  onChange,
  errors,
}: {
  value: ClientInput;
  onChange: (v: ClientInput) => void;
  errors: ClientErrors;
}) {
  const [cepLoading, setCepLoading] = useState(false);
  const set = <K extends keyof ClientInput>(key: K, v: ClientInput[K]) => onChange({ ...value, [key]: v });

  const lookupCep = async (cep: string) => {
    const digits = digitsOnly(cep);
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        onChange({
          ...value,
          cep: maskCep(digits),
          street: data.logradouro || value.street,
          neighborhood: data.bairro || value.neighborhood,
          city: data.localidade || value.city,
          state: data.uf || value.state,
        });
      }
    } catch {
      /* sem internet: preenchimento manual */
    } finally {
      setCepLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400">Dados pessoais</h4>
        <div className="grid gap-4 sm:grid-cols-6">
          <Field label="Nome completo / Razão social" required error={errors.name} className="sm:col-span-4">
            <Input value={value.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} />
          </Field>
          <Field label="CPF / CNPJ" required error={errors.document} className="sm:col-span-2">
            <Input value={value.document} onChange={(e) => set('document', maskDocument(e.target.value))} invalid={!!errors.document} inputMode="numeric" />
          </Field>
          <Field label="E-mail" required error={errors.email} className="sm:col-span-3">
            <Input type="email" value={value.email} onChange={(e) => set('email', e.target.value)} invalid={!!errors.email} />
          </Field>
          <Field label="Telefone / WhatsApp" required error={errors.phone} className="sm:col-span-3">
            <Input value={value.phone} onChange={(e) => set('phone', maskPhone(e.target.value))} invalid={!!errors.phone} inputMode="tel" />
          </Field>
          <Field label="RG / IE" className="sm:col-span-2">
            <Input value={value.rg ?? ''} onChange={(e) => set('rg', e.target.value || null)} />
          </Field>
          <Field label="Data de nascimento" className="sm:col-span-2">
            <Input type="date" value={value.birth_date ?? ''} onChange={(e) => set('birth_date', e.target.value || null)} />
          </Field>
          <Field label="Profissão" className="sm:col-span-2">
            <Input value={value.profession ?? ''} onChange={(e) => set('profession', e.target.value || null)} />
          </Field>
        </div>
      </section>
      <section>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400">Endereço</h4>
        <div className="grid gap-4 sm:grid-cols-6">
          <Field label="CEP" required error={errors.cep} className="sm:col-span-2" hint="Preenche o endereço automaticamente">
            <div className="relative">
              <Input
                value={value.cep}
                onChange={(e) => {
                  const masked = maskCep(e.target.value);
                  set('cep', masked);
                  if (digitsOnly(masked).length === 8) lookupCep(masked);
                }}
                invalid={!!errors.cep}
                inputMode="numeric"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400">
                {cepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              </span>
            </div>
          </Field>
          <Field label="Rua" required error={errors.street} className="sm:col-span-4">
            <Input value={value.street} onChange={(e) => set('street', e.target.value)} invalid={!!errors.street} />
          </Field>
          <Field label="Número" required error={errors.number} className="sm:col-span-1">
            <Input value={value.number} onChange={(e) => set('number', e.target.value)} invalid={!!errors.number} />
          </Field>
          <Field label="Complemento" className="sm:col-span-2">
            <Input value={value.complement ?? ''} onChange={(e) => set('complement', e.target.value || null)} />
          </Field>
          <Field label="Bairro" required error={errors.neighborhood} className="sm:col-span-3">
            <Input value={value.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} invalid={!!errors.neighborhood} />
          </Field>
          <Field label="Cidade" required error={errors.city} className="sm:col-span-4">
            <Input value={value.city} onChange={(e) => set('city', e.target.value)} invalid={!!errors.city} />
          </Field>
          <Field label="UF" required error={errors.state} className="sm:col-span-2">
            <Select value={value.state} onChange={(e) => set('state', e.target.value)} invalid={!!errors.state}>
              <option value="">—</option>
              {BR_STATES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
        </div>
      </section>
      <Field label="Observações sobre o cliente">
        <Textarea value={value.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} rows={2} />
      </Field>
    </div>
  );
}
