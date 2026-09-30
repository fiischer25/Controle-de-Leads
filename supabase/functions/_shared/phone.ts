/** Chave de comparação de telefones brasileiros: DDD + últimos 8 dígitos.
 * Cobre "+55 41 99999-8888", "(41) 99999-8888" e o formato do WhatsApp sem o 9º dígito (554199998888). */
export function phoneKey(raw: string | null | undefined): string | null {
  let d = (raw ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  d = d.replace(/^0+/, '');
  if (d.length < 10) return null;
  return d.slice(0, 2) + d.slice(-8);
}

export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = phoneKey(a);
  return !!ka && ka === phoneKey(b);
}

/** Número no formato internacional para a API do WhatsApp (somente dígitos, com 55). */
export function toWhatsAppNumber(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (d.length < 10) return null;
  return d.startsWith('55') && d.length >= 12 ? d : `55${d}`;
}
