// Leitura de contrato: prepara o arquivo (PDF, foto ou Word), chama a função contract-extract
// e transforma o resultado em dados do cliente, forma de pagamento e projeto.
// O formato do resultado é o de supabase/functions/_shared/contract.ts.

import type { ClientInput, ProjectInput } from '../context/DataContext';
import { backend } from './backend';
import { BR_STATES } from './constants';
import { addMonthsKey, type FeePreset, type PlanRow } from './finance';
import type { PlanDraft } from './paymentPlan';
import { digitsOnly, formatCurrency, maskCep, maskDocument, maskPhone } from './utils';

export interface ContractExtraction {
  client: {
    name: string;
    document: string;
    rg: string;
    birth_date: string;
    email: string;
    phone: string;
    profession: string;
    cep: string;
    street: string;
    number: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: string;
  };
  contract: {
    total: number;
    signed_date: string;
    installments: Array<{ label: string; amount: number; percent: number; due_date: string }>;
  };
  project: { site_address: string; site_city: string; area_m2: number; scope: string };
  notes: string;
  warnings: string[];
}

export interface ContractPayload {
  name: string;
  media_type: string;
  data?: string;
  text?: string;
}

export const CONTRACT_ACCEPT = '.pdf,.docx,.txt,.jpg,.jpeg,.png,.webp,application/pdf,image/*';
const MAX_BYTES = 15 * 1024 * 1024;
/** Fotos são reduzidas para este lado máximo (a API aceita imagens de até 5 MB). */
const MAX_IMAGE_SIDE = 2200;

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function imagePayload(file: File): Promise<ContractPayload> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Não consegui abrir a imagem. Envie em JPG ou PNG.'));
      el.src = url;
    });
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', 0.88).split(',')[1];
    return { name: file.name, media_type: 'image/jpeg', data };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Lê um arquivo de dentro de um .zip (o .docx é um zip). */
async function unzipEntry(buf: ArrayBuffer, wanted: string): Promise<Uint8Array | null> {
  const view = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  for (let n = 0; n < count && view.getUint32(p, true) === 0x02014b50; n++) {
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buf, p + 46, nameLen));
    if (name === wanted) {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const raw = new Uint8Array(buf, start, size);
      if (method === 0) return raw;
      if (method !== 8) return null;
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** Texto de um .docx (parágrafos em linhas, células separadas por tabulação). */
export async function docxText(buf: ArrayBuffer): Promise<string> {
  const xml = await unzipEntry(buf, 'word/document.xml');
  if (!xml) throw new Error('Não consegui abrir o arquivo do Word. Salve como PDF e envie de novo.');
  return new TextDecoder()
    .decode(xml)
    .replace(/<w:tab\/>|<\/w:tc>/g, '\t')
    .replace(/<w:br[^>]*\/>|<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Prepara o arquivo do contrato para envio. */
export async function contractPayload(file: File): Promise<ContractPayload> {
  if (file.size > MAX_BYTES) throw new Error('Arquivo grande demais (até 15 MB).');
  const name = file.name;
  const lower = name.toLowerCase();
  if (file.type === 'application/pdf' || lower.endsWith('.pdf')) {
    return { name, media_type: 'application/pdf', data: base64(await file.arrayBuffer()) };
  }
  if (lower.endsWith('.docx')) return { name, media_type: 'text/plain', text: await docxText(await file.arrayBuffer()) };
  if (lower.endsWith('.doc')) throw new Error('Arquivos .doc antigos não são lidos. Salve como PDF ou .docx e envie de novo.');
  if (file.type === 'text/plain' || lower.endsWith('.txt')) return { name, media_type: 'text/plain', text: await file.text() };
  if (/heic|heif/.test(file.type) || /\.hei[cf]$/.test(lower)) throw new Error('Foto em HEIC não é aceita. Envie em JPG ou PDF.');
  if (file.type.startsWith('image/')) return imagePayload(file);
  throw new Error('Formato não suportado. Envie o contrato em PDF, foto (JPG/PNG) ou Word (.docx).');
}

/** Lê o contrato: arquivo → dados extraídos. */
export async function readContract(file: File): Promise<ContractExtraction> {
  const payload = await contractPayload(file);
  let data: { result?: ContractExtraction; error?: string } | null;
  try {
    data = (await backend.invokeFunction('contract-extract', { ...payload })) as typeof data;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/não está publicada|failed to send|fetch/i.test(msg)) {
      throw new Error('A leitura de contratos ainda não foi ativada: publique a função contract-extract no Supabase (veja o README).');
    }
    throw e;
  }
  if (data?.error) throw new Error(data.error);
  if (!data?.result) throw new Error('Não foi possível ler o contrato.');
  return data.result;
}

// ---------- Aplicar o resultado ----------

const filled = (s: string | undefined | null) => !!s && s.trim().length > 0;

function cleanPhone(v: string): string {
  let d = digitsOnly(v);
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  return d.length >= 10 ? maskPhone(d) : '';
}

/** Dados do cliente encontrados no contrato, prontos para os campos do cadastro. */
export function contractClientFields(x: ContractExtraction): Partial<ClientInput> {
  const c = x.client;
  const out: Partial<ClientInput> = {};
  if (filled(c.name)) out.name = c.name;
  if (digitsOnly(c.document).length === 11 || digitsOnly(c.document).length === 14) out.document = maskDocument(c.document);
  if (filled(c.rg)) out.rg = c.rg;
  if (filled(c.birth_date)) out.birth_date = c.birth_date;
  if (filled(c.email)) out.email = c.email;
  const phone = cleanPhone(c.phone);
  if (phone) out.phone = phone;
  if (filled(c.profession)) out.profession = c.profession;
  if (digitsOnly(c.cep).length === 8) out.cep = maskCep(c.cep);
  if (filled(c.street)) out.street = c.street;
  if (filled(c.number)) out.number = c.number;
  if (filled(c.complement)) out.complement = c.complement;
  if (filled(c.neighborhood)) out.neighborhood = c.neighborhood;
  if (filled(c.city)) out.city = c.city;
  if (BR_STATES.includes(c.state)) out.state = c.state;
  return out;
}

/** Cliente com os dados do contrato por cima (o que o contrato não traz fica como estava). */
export function applyContractToClient(x: ContractExtraction, base: ClientInput): ClientInput {
  return { ...base, ...contractClientFields(x) };
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

function presetFor(rows: PlanRow[], total: number): FeePreset {
  const pct = rows.map((r) => (r.amount != null ? (r.amount / total) * 100 : r.percent));
  if (rows.length === 1) return 'avista';
  if (rows.length === 2 && pct.every((p) => near(p, 50, 0.5))) return '50-50';
  if (rows.length === 3 && near(pct[0], 30, 0.5) && near(pct[1], 40, 0.5) && near(pct[2], 30, 0.5)) return '30-40-30';
  return 'mensal';
}

/**
 * Forma de pagamento do contrato: valor total e parcelas. Usa os valores em R$ quando somam o
 * total, senão os percentuais quando somam 100%. Parcela sem data vence um mês depois da anterior.
 * Null quando o contrato não traz valor.
 */
export function contractPlan(x: ContractExtraction, fallbackFirst: string): { total: number; draft: PlanDraft | null; guessedDates: number } | null {
  const inst = x.contract.installments;
  const amountsSum = inst.reduce((a, r) => a + r.amount, 0);
  const total = x.contract.total > 0 ? x.contract.total : inst.length && inst.every((r) => r.amount > 0) ? Math.round(amountsSum * 100) / 100 : 0;
  if (!total) return null;
  if (!inst.length) return { total, draft: null, guessedDates: 0 };

  const allAmounts = inst.every((r) => r.amount > 0) && near(amountsSum, total, 0.01);
  const allPercents = inst.every((r) => r.percent > 0) && near(inst.reduce((a, r) => a + r.percent, 0), 100, 0.1);
  let prev = inst.find((r) => r.due_date)?.due_date || x.contract.signed_date || fallbackFirst;
  let guessedDates = 0;
  const rows: PlanRow[] = inst.map((r, i) => {
    let due = r.due_date;
    if (!due) {
      due = i === 0 ? prev : addMonthsKey(prev, 1);
      guessedDates++;
    }
    prev = due;
    const useAmount = allAmounts || (!allPercents && r.amount > 0);
    return {
      label: r.label || `Parcela ${i + 1}`,
      percent: useAmount ? Math.round((r.amount / total) * 10000) / 100 : r.percent,
      due_date: due,
      amount: useAmount ? r.amount : null,
    };
  });
  const preset = presetFor(rows, total);
  return { total, draft: { preset, months: rows.length, first: rows[0].due_date, rows }, guessedDates };
}

/** Projeto com área, endereço da obra e escopo do contrato (sem apagar o que já foi preenchido). */
export function applyContractToProject<T extends Pick<ProjectInput, 'area_m2' | 'site_address' | 'site_city' | 'description'>>(x: ContractExtraction, p: T): T {
  const pr = x.project;
  return {
    ...p,
    area_m2: pr.area_m2 > 0 ? pr.area_m2 : p.area_m2,
    site_address: filled(pr.site_address) ? pr.site_address : p.site_address,
    site_city: filled(pr.site_city) ? pr.site_city : p.site_city,
    description: filled(p.description) ? p.description : filled(pr.scope) ? pr.scope : p.description,
  };
}

/** Resumo do que foi lido: "9 dados do cliente · R$ 30.000 em 3 parcelas". */
export function contractSummary(x: ContractExtraction): string {
  const n = Object.keys(contractClientFields(x)).length;
  const parts = [n ? `${n} ${n === 1 ? 'dado' : 'dados'} do cliente` : 'nenhum dado do cliente'];
  const plan = contractPlan(x, '2000-01-01');
  if (plan) {
    const k = x.contract.installments.length;
    parts.push(k ? `${formatCurrency(plan.total)} em ${k} ${k === 1 ? 'parcela' : 'parcelas'}` : `valor de ${formatCurrency(plan.total)}`);
  } else parts.push('sem valor');
  return parts.join(' · ');
}

/** Avisos para conferir: os do contrato e as datas deduzidas. */
export function contractWarnings(x: ContractExtraction, fallbackFirst: string): string[] {
  const out = [...x.warnings];
  const plan = contractPlan(x, fallbackFirst);
  if (plan && plan.guessedDates > 0) {
    out.push(
      plan.guessedDates === 1
        ? '1 parcela não tem data no contrato: o vencimento foi sugerido, confira.'
        : `${plan.guessedDates} parcelas não têm data no contrato: os vencimentos foram sugeridos mês a mês, confira.`,
    );
  }
  return out;
}

// ---------- Contrato lido no fechamento, usado em seguida no "Virar cliente" ----------

const pending = new Map<string, { extraction: ContractExtraction; fileName: string }>();

export function rememberContract(leadId: string, extraction: ContractExtraction, fileName: string) {
  pending.set(leadId, { extraction, fileName });
}

export function recalledContract(leadId: string) {
  return pending.get(leadId) ?? null;
}

export function forgetContract(leadId: string) {
  pending.delete(leadId);
}
