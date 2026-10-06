// Leitura de contrato: prepara o arquivo (PDF, foto ou Word), chama a função contract-extract
// e transforma o resultado em dados do cliente, forma de pagamento e projeto.
// O formato do resultado é o de supabase/functions/contract-extract/index.ts.

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

/** O arquivo não tem texto (foto, PDF escaneado) ou o texto não tem os dados: sugerir o Claude.ai. */
export class ContractNeedsAiError extends Error {}

/** Texto de um PDF (com texto, não escaneado), lido no navegador. */
async function pdfText(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 40); i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join(''));
  }
  await doc.destroy();
  return pages.join('\n\n');
}

/** Texto do contrato (PDF, Word ou .txt); null para fotos. */
export async function contractText(file: File): Promise<string | null> {
  if (file.size > MAX_BYTES) throw new Error('Arquivo grande demais (até 15 MB).');
  const lower = file.name.toLowerCase();
  if (file.type === 'application/pdf' || lower.endsWith('.pdf')) return pdfText(await file.arrayBuffer());
  if (lower.endsWith('.docx')) return docxText(await file.arrayBuffer());
  if (lower.endsWith('.doc')) throw new Error('Arquivos .doc antigos não são lidos. Salve como PDF ou .docx e envie de novo.');
  if (file.type === 'text/plain' || lower.endsWith('.txt')) return file.text();
  if (file.type.startsWith('image/') || /\.(jpe?g|png|webp|hei[cf])$/.test(lower)) return null;
  throw new Error('Formato não suportado. Envie o contrato em PDF ou Word (.docx).');
}

let aiCheck: Promise<boolean> | null = null;
/** A leitura com IA (função contract-extract, paga) está ativa? Conferido uma vez por sessão. */
export function contractAiReady(): Promise<boolean> {
  aiCheck ??= backend
    .invokeFunction('contract-extract', { ping: true })
    .then((d) => !!(d as { ok?: boolean } | null)?.ok)
    .catch(() => false);
  return aiCheck;
}

export type ContractMethod = 'ia' | 'gratuita' | 'claude';

/** Completa rua, bairro, cidade e UF pelo CEP (ViaCEP) quando o contrato não traz. */
export async function completeAddressFromCep(x: ContractExtraction): Promise<ContractExtraction> {
  const c = x.client;
  const cep = digitsOnly(c.cep);
  if (cep.length !== 8 || (c.street && c.neighborhood && c.city && c.state)) return x;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const data = await (await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: ctrl.signal })).json();
    if (data?.erro) return x;
    return {
      ...x,
      client: {
        ...c,
        street: c.street || data.logradouro || '',
        neighborhood: c.neighborhood || data.bairro || '',
        city: c.city || data.localidade || '',
        state: c.state || data.uf || '',
      },
    };
  } catch {
    return x; // sem internet: a pessoa completa à mão
  } finally {
    clearTimeout(timer);
  }
}

async function readWithAi(file: File): Promise<ContractExtraction> {
  const payload = await contractPayload(file);
  const data = (await backend.invokeFunction('contract-extract', { ...payload })) as { result?: ContractExtraction; error?: string } | null;
  if (data?.error) throw new Error(data.error);
  if (!data?.result) throw new Error('Não foi possível ler o contrato.');
  return data.result;
}

/**
 * Lê o contrato. Com a leitura com IA ativada, usa a IA; senão, a leitura gratuita no navegador
 * (PDF com texto ou Word). Foto ou escaneado sem IA: ContractNeedsAiError (usar o Claude.ai).
 */
export async function readContract(file: File): Promise<{ extraction: ContractExtraction; method: ContractMethod }> {
  if (await contractAiReady()) return { extraction: await completeAddressFromCep(await readWithAi(file)), method: 'ia' };
  const text = await contractText(file);
  if (text === null) {
    throw new ContractNeedsAiError('Fotos não são lidas pela leitura gratuita. Use “Ler com o Claude.ai” abaixo ou envie o contrato em PDF/Word.');
  }
  if (text.replace(/\s/g, '').length < 150) {
    throw new ContractNeedsAiError('Este PDF parece escaneado (sem texto). Use “Ler com o Claude.ai” abaixo ou envie o PDF original/Word.');
  }
  const { parseContractText } = await import('./contractParse');
  const extraction = parseContractText(text);
  const found = Object.keys(contractClientFields(extraction)).length;
  if (found < 2 && !extraction.contract.total) {
    throw new ContractNeedsAiError('Não reconheci os dados neste contrato. Use “Ler com o Claude.ai” abaixo.');
  }
  return { extraction: await completeAddressFromCep(extraction), method: 'gratuita' };
}

// ---------- Ler com o Claude.ai (assinatura da pessoa, sem custo de API) ----------

export const CLAUDE_PROMPT = `Leia o contrato anexado (prestação de serviços de arquitetura) e responda SOMENTE com um JSON no formato abaixo, sem nenhum texto antes ou depois.

Regras:
- "client" é o CONTRATANTE (quem paga), nunca o escritório/arquiteto (CONTRATADA).
- Campo que não estiver no contrato: "" para texto e 0 para número.
- Datas no formato AAAA-MM-DD. Valores em reais como número (R$ 12.500,00 → 12500).
- Liste cada parcela separadamente ("10 parcelas mensais" vira 10 itens, com as datas mês a mês). Parcela "na assinatura" vence na data de assinatura; parcela ligada a um evento sem data (ex.: entrega do anteprojeto) fica com "due_date": "".
- Em "warnings", escreva em português o que precisa ser conferido (dados ilegíveis, valores que não somam).

{
  "client": { "name": "", "document": "", "rg": "", "birth_date": "", "email": "", "phone": "", "profession": "", "cep": "", "street": "", "number": "", "complement": "", "neighborhood": "", "city": "", "state": "" },
  "contract": { "total": 0, "signed_date": "", "installments": [ { "label": "", "amount": 0, "percent": 0, "due_date": "" } ] },
  "project": { "site_address": "", "site_city": "", "area_m2": 0, "scope": "" },
  "notes": "",
  "warnings": []
}`;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};
const isoDate = (v: unknown) => {
  const s = str(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : '';
};

/** Garante o formato do resultado vindo de fora (resposta colada do Claude.ai). */
export function normalizeExtraction(raw: unknown): ContractExtraction {
  const r = (raw ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const c = r.client ?? {};
  const k = r.contract ?? {};
  const p = r.project ?? {};
  return {
    client: {
      name: str(c.name), document: str(c.document), rg: str(c.rg), birth_date: isoDate(c.birth_date), email: str(c.email).toLowerCase(),
      phone: str(c.phone), profession: str(c.profession), cep: str(c.cep), street: str(c.street), number: str(c.number),
      complement: str(c.complement), neighborhood: str(c.neighborhood), city: str(c.city), state: str(c.state).toUpperCase().slice(0, 2),
    },
    contract: {
      total: num(k.total),
      signed_date: isoDate(k.signed_date),
      installments: (Array.isArray(k.installments) ? k.installments : []).slice(0, 120).map((i: Record<string, unknown>) => ({
        label: str(i?.label),
        amount: num(i?.amount),
        percent: Math.min(100, num(i?.percent)),
        due_date: isoDate(i?.due_date),
      })),
    },
    project: { site_address: str(p.site_address), site_city: str(p.site_city), area_m2: num(p.area_m2), scope: str(p.scope) },
    notes: str((raw as Record<string, unknown> | null)?.notes),
    warnings: (Array.isArray((raw as Record<string, unknown> | null)?.warnings) ? ((raw as Record<string, unknown>).warnings as unknown[]) : [])
      .map(str)
      .filter(Boolean)
      .slice(0, 10),
  };
}

/** Resposta colada do Claude.ai (pode vir com ```json ... ```) → dados do contrato. */
export function parseClaudeAnswer(answer: string): ContractExtraction {
  const start = answer.indexOf('{');
  const end = answer.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Não encontrei os dados na resposta. Copie a resposta inteira do Claude (o bloco que começa com { ).');
  let parsed: unknown;
  try {
    parsed = JSON.parse(answer.slice(start, end + 1));
  } catch {
    throw new Error('A resposta está incompleta. No Claude, clique em “Copiar” embaixo da resposta e cole aqui de novo.');
  }
  const x = normalizeExtraction(parsed);
  if (!x.client.name && !x.contract.total && !x.contract.installments.length) throw new Error('A resposta não trouxe dados do contrato.');
  return x;
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
