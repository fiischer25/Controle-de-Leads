// Leitura de contrato: o Claude lê o contrato (PDF, foto ou texto do Word) e devolve os dados
// do cliente, o valor e as parcelas num JSON fixo (structured outputs), que o sistema usa para
// preencher o cadastro e a forma de pagamento. Campo não encontrado vem vazio ("" ou 0).

import type Anthropic from 'npm:@anthropic-ai/sdk@0.129.0';

export const CONTRACT_MODEL = 'claude-opus-5-5';

/** Tipos aceitos. Word (.docx) chega como texto, extraído no navegador. */
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_TEXT_CHARS = 200_000;

export interface ContractInput {
  name?: string;
  media_type: string;
  /** Base64 do PDF ou da imagem. */
  data?: string;
  /** Texto do contrato (Word ou .txt). */
  text?: string;
}

export interface ContractInstallment {
  label: string;
  amount: number;
  percent: number;
  due_date: string;
}

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
    installments: ContractInstallment[];
  };
  project: {
    site_address: string;
    site_city: string;
    area_m2: number;
    scope: string;
  };
  notes: string;
  warnings: string[];
}

const str = (description: string) => ({ type: 'string', description });
const num = (description: string) => ({ type: 'number', description });
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/** Sem campos opcionais nem uniões: o que não estiver no contrato vem "" (texto) ou 0 (número). */
export const CONTRACT_SCHEMA = obj({
  client: obj({
    name: str('Nome completo do contratante (cliente) ou razão social.'),
    document: str('CPF ou CNPJ do contratante, só com os números ou como escrito.'),
    rg: str('RG do contratante.'),
    birth_date: str('Data de nascimento no formato AAAA-MM-DD.'),
    email: str('E-mail do contratante.'),
    phone: str('Telefone/celular do contratante, com DDD.'),
    profession: str('Profissão do contratante.'),
    cep: str('CEP do endereço do contratante.'),
    street: str('Rua/avenida do endereço do contratante (sem o número).'),
    number: str('Número do endereço do contratante.'),
    complement: str('Complemento (apto, bloco, sala).'),
    neighborhood: str('Bairro do contratante.'),
    city: str('Cidade do contratante.'),
    state: str('UF do contratante, 2 letras (ex.: PR).'),
  }),
  contract: obj({
    total: num('Valor total dos honorários do contrato, em reais. 0 se não houver.'),
    signed_date: str('Data de assinatura do contrato, AAAA-MM-DD.'),
    installments: {
      type: 'array',
      description: 'Parcelas do pagamento, na ordem. Parcelas mensais iguais devem ser listadas uma a uma.',
      items: obj({
        label: str('Descrição curta: "Assinatura do contrato", "Entrega do anteprojeto", "Parcela 3 de 10"…'),
        amount: num('Valor da parcela em reais. 0 se o contrato só der o percentual.'),
        percent: num('Percentual do total. 0 se o contrato só der o valor.'),
        due_date: str('Vencimento AAAA-MM-DD. Vazio se depender de um evento sem data (ex.: entrega).'),
      }),
    },
  }),
  project: obj({
    site_address: str('Endereço do imóvel/obra objeto do contrato, se for diferente ou estiver explícito.'),
    site_city: str('Cidade do imóvel/obra.'),
    area_m2: num('Área do projeto em m². 0 se não houver.'),
    scope: str('Resumo do objeto/escopo do contrato em até 3 frases.'),
  }),
  notes: str('Outras condições relevantes (multa, prazo, reajuste), em até 3 frases. Vazio se não houver.'),
  warnings: {
    type: 'array',
    description: 'Pontos que a pessoa deve conferir: dados ilegíveis, valores que não somam, datas deduzidas.',
    items: { type: 'string' },
  },
});

export function systemPrompt(): string {
  return `Você extrai dados de contratos de prestação de serviços de um escritório de arquitetura brasileiro, para preencher o cadastro do cliente e a forma de pagamento no sistema de gestão.

Regras:
- O cliente é o CONTRATANTE (quem paga). Nunca use os dados do escritório/arquiteto (CONTRATADA).
- Se houver mais de um contratante, use o primeiro e cite os demais em warnings.
- Copie os dados como estão no contrato; não invente. Campo ausente: "" para texto e 0 para número.
- Datas sempre no formato AAAA-MM-DD. Valores em reais como número (R$ 12.500,00 → 12500).
- Parcelas: liste cada parcela separadamente, na ordem. "10 parcelas mensais de R$ 1.000 a partir de 10/11/2026" vira 10 linhas com as datas mês a mês.
- Entrada/sinal "na assinatura" vence na data de assinatura, se ela existir.
- Parcela atrelada a um evento sem data (entrega do anteprojeto, aprovação na prefeitura) fica com due_date vazio e a descrição do evento em label.
- Preencha amount e percent quando o contrato trouxer os dois; se trouxer só um, deixe o outro 0.
- Se as parcelas não somarem o valor total, ou algo estiver ilegível ou ambíguo, explique em warnings (frases curtas, em português).`;
}

/** Monta a mensagem com o contrato: PDF, imagem ou texto. Lança erro com mensagem amigável. */
export function contractContent(input: ContractInput): Anthropic.Beta.BetaContentBlockParam[] {
  const ask: Anthropic.Beta.BetaContentBlockParam = {
    type: 'text',
    text: `Extraia os dados deste contrato${input.name ? ` (arquivo "${input.name}")` : ''}.`,
  };
  if (input.media_type === 'application/pdf' || (IMAGE_TYPES as readonly string[]).includes(input.media_type)) {
    const data = (input.data ?? '').replace(/^data:[^,]*,/, '');
    if (!data) throw new ContractError('Arquivo vazio.');
    if (Math.floor((data.length * 3) / 4) > MAX_FILE_BYTES) throw new ContractError('Arquivo grande demais (até 15 MB).');
    if (input.media_type === 'application/pdf') {
      return [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }, ask];
    }
    return [
      { type: 'image', source: { type: 'base64', media_type: input.media_type as (typeof IMAGE_TYPES)[number], data } },
      ask,
    ];
  }
  if (input.media_type === 'text/plain') {
    const text = (input.text ?? '').trim();
    if (text.length < 40) throw new ContractError('Não encontrei texto no arquivo. Envie o contrato em PDF ou foto.');
    if (text.length > MAX_TEXT_CHARS) throw new ContractError('Contrato longo demais para ler de uma vez.');
    return [{ type: 'document', source: { type: 'text', media_type: 'text/plain', data: text } }, ask];
  }
  throw new ContractError('Formato não suportado. Envie o contrato em PDF, foto (JPG/PNG) ou Word (.docx).');
}

/** Erro com mensagem que pode ser mostrada para a pessoa. */
export class ContractError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const money = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0);
const isoDate = (v: unknown) => {
  const s = clean(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : '';
};

/** Garante o formato (datas válidas, números positivos, textos aparados) mesmo se algo vier fora do esperado. */
export function normalizeExtraction(raw: unknown): ContractExtraction {
  const r = (raw ?? {}) as Record<string, Record<string, unknown> & { installments?: unknown[] }>;
  const c = r.client ?? {};
  const k = r.contract ?? {};
  const p = r.project ?? {};
  return {
    client: {
      name: clean(c.name),
      document: clean(c.document),
      rg: clean(c.rg),
      birth_date: isoDate(c.birth_date),
      email: clean(c.email).toLowerCase(),
      phone: clean(c.phone),
      profession: clean(c.profession),
      cep: clean(c.cep),
      street: clean(c.street),
      number: clean(c.number),
      complement: clean(c.complement),
      neighborhood: clean(c.neighborhood),
      city: clean(c.city),
      state: clean(c.state).toUpperCase().slice(0, 2),
    },
    contract: {
      total: money(k.total),
      signed_date: isoDate(k.signed_date),
      installments: (Array.isArray(k.installments) ? k.installments : []).slice(0, 120).map((i) => {
        const row = (i ?? {}) as Record<string, unknown>;
        return {
          label: clean(row.label),
          amount: money(row.amount),
          percent: typeof row.percent === 'number' && row.percent > 0 && row.percent <= 100 ? Math.round(row.percent * 100) / 100 : 0,
          due_date: isoDate(row.due_date),
        };
      }),
    },
    project: {
      site_address: clean(p.site_address),
      site_city: clean(p.site_city),
      area_m2: money(p.area_m2),
      scope: clean(p.scope),
    },
    notes: clean((raw as Record<string, unknown> | null)?.notes),
    warnings: (Array.isArray((raw as Record<string, unknown> | null)?.warnings) ? ((raw as Record<string, unknown>).warnings as unknown[]) : [])
      .map(clean)
      .filter(Boolean)
      .slice(0, 10),
  };
}

/** Chama o Claude com o contrato e devolve os dados normalizados. */
export async function extractContract(
  anthropic: Pick<Anthropic, 'beta'>,
  input: ContractInput,
  today: string,
): Promise<ContractExtraction> {
  const content = contractContent(input);
  const response = await anthropic.beta.messages.create({
    model: CONTRACT_MODEL,
    max_tokens: 12000,
    // Se o modelo principal recusar ou estiver indisponível, a API tenta um modelo alternativo
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: CONTRACT_SCHEMA } },
    system: systemPrompt(),
    messages: [{ role: 'user', content: [...content, { type: 'text', text: `Data de hoje: ${today}.` }] }],
  });

  if (response.stop_reason === 'refusal') throw new ContractError('Não foi possível ler este arquivo como contrato.', 422);
  if (response.stop_reason === 'max_tokens') throw new ContractError('O contrato é longo demais para ler de uma vez.', 422);
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ContractError('Não consegui entender o contrato. Tente outro arquivo (PDF de preferência).', 422);
  }
  return normalizeExtraction(parsed);
}
