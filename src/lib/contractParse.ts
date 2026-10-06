// Leitura gratuita de contrato (sem IA): reconhece no texto do PDF/Word as partes que seguem o
// padrão dos contratos brasileiros — qualificação do CONTRATANTE (nome, CPF/CNPJ, RG, endereço,
// CEP, e-mail, telefone), valor, percentuais, parcelas mensais, datas e área da obra.
// Funciona melhor com o modelo de contrato do escritório; o resultado sempre deve ser conferido.

import type { ContractExtraction } from './contract';
import { digitsOnly, isValidDocument } from './utils';

const MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, 'março': 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

const STATES: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', 'amapá': 'AP', amapa: 'AP', amazonas: 'AM', bahia: 'BA', 'ceará': 'CE', ceara: 'CE',
  'distrito federal': 'DF', 'espírito santo': 'ES', 'espirito santo': 'ES', 'goiás': 'GO', goias: 'GO', 'maranhão': 'MA',
  maranhao: 'MA', 'mato grosso do sul': 'MS', 'mato grosso': 'MT', 'minas gerais': 'MG', 'pará': 'PA', para: 'PA',
  'paraíba': 'PB', paraiba: 'PB', 'paraná': 'PR', parana: 'PR', pernambuco: 'PE', 'piauí': 'PI', piaui: 'PI',
  'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS', 'rondônia': 'RO', rondonia: 'RO',
  roraima: 'RR', 'santa catarina': 'SC', 'são paulo': 'SP', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
};
const UFS = new Set(Object.values(STATES));

const NUMBER_WORDS: Record<string, number> = {
  uma: 1, um: 1, duas: 2, dois: 2, 'três': 3, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18,
  dezenove: 19, vinte: 20, 'vinte e quatro': 24, trinta: 30, 'trinta e seis': 36,
};

const pad = (n: number) => String(n).padStart(2, '0');

function validDate(y: number, m: number, d: number): string {
  if (y < 100) y += 2000;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso ? iso : '';
}

/** "10/10/2026", "10.10.26" ou "10 de outubro de 2026" → "2026-10-10". */
export function brDate(s: string): string {
  const num = s.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (num) return validDate(Number(num[3]), Number(num[2]), Number(num[1]));
  const ext = s.match(/\b(\d{1,2})º?\s+de\s+([a-zç]+)\s+de\s+(\d{4})\b/i);
  if (ext && MONTHS[ext[2].toLowerCase()]) return validDate(Number(ext[3]), MONTHS[ext[2].toLowerCase()], Number(ext[1]));
  return '';
}

/** "12.500,00" → 12500. */
export function brMoney(s: string): number {
  const v = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : 0;
}

const MONEY = /R\$\s*([\d.]+(?:,\d{1,2})?)/;
const MONEY_G = /R\$\s*([\d.]+(?:,\d{1,2})?)/g;
const PERCENT_G = /(\d{1,3}(?:,\d+)?)\s*%/g;

function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && /^(da|de|do|das|dos|e)$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, '').trim();

/**
 * Corrige o texto extraído do PDF: hífens soltos em números e palavras ("123.456.789 - 09",
 * "e - mail", "Aplicam - se") e espaços repetidos.
 */
export function normalizeContractText(t: string): string {
  return t
    .replace(/\u00a0/g, ' ')
    .replace(/(\d)\s+-\s+(\d)/g, '$1-$2')
    .replace(/\b(\d{1,2}) (\d{1,2}\.\d{3}\.\d{3}-\d{2})\b/g, (m, a: string, b: string) => (a.length + b.indexOf('.') === 3 ? a + b : m))
    .replace(/\b([eE])\s+-\s+(mail)/g, '$1-$2')
    .replace(/([a-zà-ú])\s+-\s+([a-zà-ú])/g, '$1-$2')
    .replace(/[ \t]+/g, ' ')
    .replace(/ +\n/g, '\n');
}

/** Corta no fim da frase, sem confundir abreviações ("Av. Brasil", "R. XV", "nº 10"). */
function untilSentenceEnd(s: string, max = 300): string {
  const end = s.search(/;|\.\s+(?=\d+(?:\.\d+)*\.?\s|[A-ZÀ-Ú]{2,}\b|[A-ZÀ-Ú][a-zà-ú]+\s+[a-zà-ú])|\.\s*\n|\n\s*\n|doravante/);
  return (end >= 0 ? s.slice(0, end) : s).slice(0, max);
}

/** Trecho com a qualificação do contratante (nome, documentos, endereço). */
function contractorBlock(text: string): string {
  const doc = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/;
  // "CONTRATANTE: Fulano, brasileiro, ..."
  for (const m of text.matchAll(/CONTRATANTES?\s*[:–-]\s*/g)) {
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 1200);
    const end = after.search(/CONTRATAD[AO]|CL[ÁA]USULA|t[êe]m,? entre si|Pelo presente|\n\s*\n\s*\n/);
    const block = end > 0 ? after.slice(0, end) : after;
    if (doc.test(block)) return block;
  }
  // "Fulano, brasileiro, ..., doravante denominado CONTRATANTE"
  for (const m of text.matchAll(/(?:doravante|simplesmente|neste ato)?\s*(?:denominad[oa]s?|chamad[oa]s?)\s+(?:simplesmente\s+)?(?:de\s+)?CONTRATANTES?/gi)) {
    const before = text.slice(Math.max(0, m.index! - 1200), m.index!);
    const start = Math.max(before.lastIndexOf(';'), before.lastIndexOf('\n\n'));
    // Tira o preâmbulo: "Pelo presente instrumento particular,", "De um lado,"
    const block = before.slice(start + 1).replace(/^[\s\S]*?(?:instrumento particular|pelo presente|de um lado|entre as partes|as partes)[^,]*,\s*/i, '');
    if (doc.test(block)) return block;
  }
  return '';
}

function parseAddress(q: string) {
  const out = { street: '', number: '', complement: '', neighborhood: '', city: '', state: '' };
  const addr = q.match(/(?:residentes?|domiciliad[oa]s?|com sede|estabelecid[oa])(?:\s+e\s+domiciliad[oa]s?)?\s+(?:na|no|à|ao|em)\s+([\s\S]+)/i);
  const a = addr ? untilSentenceEnd(addr[1].replace(/\s+/g, ' ')) : '';
  if (a) {
    const num = a.match(/^(.+?),?\s+(?:n[º°o.]*|número|nr\.?)\s*([\d]+[A-Za-z]?|s\/n)/i) ?? a.match(/^(.+?),\s*(\d+[A-Za-z]?)\b/);
    if (num) {
      out.street = clean(num[1]);
      out.number = num[2];
    } else out.street = clean(a.split(',')[0]);
    const comp = a.match(/\b((?:apto|apartamento|ap\.|casa|bloco|bl\.|sala|conjunto|cj\.?|torre|lote|quadra)\s*[\w\d.ºª-]+(?:\s*,?\s*(?:bloco|bl\.|torre)\s*[\w\d-]+)?)/i);
    if (comp) out.complement = clean(comp[1]);
    const bairro = a.match(/bairro\s*:?\s*([^,;]+)/i);
    if (bairro) out.neighborhood = clean(bairro[1]);
  }
  const scope = a || q;
  const cityUf = [...scope.matchAll(/([A-ZÀ-Ú][A-Za-zÀ-ú' ]{1,40}?)\s*[/–-]\s*([A-Z]{2})\b/g)].filter((m) => UFS.has(m[2]));
  if (cityUf.length) {
    const m = cityUf[cityUf.length - 1];
    out.city = clean(m[1].replace(/^(?:na cidade de|cidade de|em|munic[íi]pio de)\s+/i, ''));
    out.state = m[2];
  } else {
    const city = scope.match(/(?:cidade|munic[íi]pio)\s+de\s+([^,/;]+)/i);
    if (city) out.city = clean(city[1]);
    const st = scope.match(/estado\s+d[oe]\s+([A-Za-zÀ-ú ]+?)(?:,|;|\.|$)/i);
    if (st) out.state = STATES[st[1].trim().toLowerCase()] ?? '';
  }
  // Bairro sem a palavra "bairro": parte antes da cidade ("..., Centro, Curitiba/PR")
  if (!out.neighborhood && a && out.city) {
    const parts = a.split(',').map((p) => p.trim());
    const ci = parts.findIndex((p) => p.startsWith(out.city));
    const cand = ci > 0 ? parts[ci - 1] : '';
    if (cand && !/\d|apto|apartamento|casa|bloco|sala|CEP/i.test(cand)) out.neighborhood = cand;
  }
  return out;
}

/**
 * CPF/CNPJ: o da qualificação; se tiver dígito inválido e o mesmo nome aparecer com outro
 * documento válido (ex.: na assinatura), usa esse e avisa.
 */
function pickDocument(text: string, block: string, name: string, warnings: string[]): string {
  const re = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b|\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
  const first = block.match(re)?.[0] ?? '';
  if (!first || isValidDocument(first)) return first;
  if (name) {
    const lower = text.toLowerCase();
    for (let i = lower.indexOf(name.toLowerCase()); i >= 0; i = lower.indexOf(name.toLowerCase(), i + 1)) {
      const near = text.slice(i, i + name.length + 120).match(re)?.[0];
      if (near && isValidDocument(near) && digitsOnly(near) !== digitsOnly(first)) {
        warnings.push(`O CPF/CNPJ da qualificação do contrato (${first}) tem dígito inválido; usei o da assinatura (${near}). Confira.`);
        return near;
      }
    }
  }
  warnings.push(`O CPF/CNPJ do contrato (${first}) tem dígito inválido. Confira com o cliente.`);
  return first;
}

function parseClient(text: string, warnings: string[]): ContractExtraction['client'] {
  const q = contractorBlock(text);
  const client: ContractExtraction['client'] = {
    name: '', document: '', rg: '', birth_date: '', email: '', phone: '', profession: '',
    cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '',
  };
  if (!q) return client;
  const first = q.split(/,|\s+inscrit|\s+portador/)[0];
  client.name = titleCase(clean(first.replace(/^(?:o|a|sr\.?|sra\.?|nome:?)\s+/i, '')));
  client.document = pickDocument(text, q, client.name, warnings);
  const rg = q.match(/\b(?:RG|R\.G\.|identidade|C[ée]dula de Identidade)\b[^\d]{0,25}([\d.\-xX]{5,15})/i);
  if (rg) client.rg = rg[1].replace(/[.-]$/, '');
  const email = q.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/) ?? text.match(/e-?mail\s*:?\s*([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/i);
  if (email) client.email = (email[1] ?? email[0]).toLowerCase();
  const phone = q.match(/(?:telefone|celular|fone|whatsapp|tel\.?)\s*(?:n[º°o.]*)?\s*:?\s*(\+?55\s*)?(\(?\d{2}\)?\s*9?\s?\d{4}[-\s.]?\d{4})/i) ?? q.match(/(\+?55\s*)?(\(\d{2}\)\s*9?\s?\d{4}[-\s.]?\d{4})/);
  if (phone) client.phone = phone[2];
  const cep = q.match(/CEP\s*(?:n[º°o.]*)?\s*:?\s*(\d{2}\.?\d{3}-?\d{3})/i);
  if (cep) client.cep = cep[1].replace('.', '');
  const birth = q.match(/nascid[oa]\s+(?:em|aos?)\s+([^,;]+)/i);
  if (birth) client.birth_date = brDate(birth[1]);
  // Profissão: depois do estado civil ("brasileiro, casado, engenheiro, portador...")
  const tokens = q.split(',').map((t) => t.trim());
  const civil = tokens.findIndex((t) => /^(solteir|casad|divorciad|vi[úu]v|separad|em uni[ãa]o|convivente)/i.test(t));
  if (civil >= 0 && tokens[civil + 1] && !/portador|inscrit|RG|CPF|CNPJ|residente|domiciliad|nascid|\d/i.test(tokens[civil + 1])) {
    client.profession = titleCase(clean(tokens[civil + 1])).replace(/^./, (c) => c.toUpperCase());
  }
  Object.assign(client, parseAddress(q));
  return client;
}

/** Rótulo da parcela a partir do trecho ("na assinatura" → "Assinatura do contrato"). */
function labelFor(s: string, i: number): string {
  if (/assinatura|ato da contrata|sinal|entrada/i.test(s) && !/entrega/i.test(s)) return /entrada|sinal/i.test(s) ? 'Entrada' : 'Assinatura do contrato';
  const ev = s.match(/(?:na|no|ao|à|após|apos|quando da|até|ate|mediante)\s+(?:a\s+|o\s+)?((?:entrega|aprova|apresenta|conclus|in[íi]cio|finaliza|t[ée]rmino|aceite|libera)[^,;.%]{0,60})/i);
  if (ev) {
    const t = clean(ev[1]).replace(/\s+(?:e|,)\s*$/, '');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  return `Parcela ${i + 1}`;
}

const EXCLUDE = /multa|juros|mora\b|rescis|reajust|corre[çc][ãa]o|IPCA|IGP|INCC|desconto|atraso|penalidade|cl[áa]usula penal|taxa|RRT|ART\b/i;

/**
 * Tabela de vencimentos, uma parcela por linha:
 * "ENTRADA - R$ 9.747,50, no dia 25/11/2026." / "1ª PARCELA - R$ 5.848,50, no dia 15/12/2026."
 */
function parseSchedule(text: string, signed: string) {
  const rows: ContractExtraction['contract']['installments'] = [];
  const line = /^[ \t]*((?:entrada|sinal|saldo|assinatura|\d{1,2}\s*[ªaº°]?\s*parcela|parcela\s*(?:n[º°]\s*)?\d{1,2}(?:\s*(?:de|\/)\s*\d{1,2})?)[^\n]{0,25}?)\s*[-–:]\s*R\$\s*([\d.]+,\d{2})([^\n]*)/gim;
  for (const m of text.matchAll(line)) {
    const raw = clean(m[1]);
    const label = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    const due = brDate(m[3]) || (/entrada|sinal|assinatura/i.test(raw) && !/\d{1,2}\/\d/.test(m[3]) ? signed : '');
    rows.push({ label, amount: brMoney(m[2]), percent: 0, due_date: due });
  }
  return rows;
}

function parsePayments(text: string, signed: string) {
  const schedule = parseSchedule(text, signed);
  if (schedule.length) return schedule;
  const rows: ContractExtraction['contract']['installments'] = [];
  const sentences = text
    .replace(/\r/g, '')
    .split(/;|\n(?=\s*(?:[a-z]\)|[IVX]+\s*[-–.)]|\d+[.)]\s|[-•]))|\.\s+(?=[A-ZÀ-Ú])|\n\s*\n/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  for (const s of sentences) {
    if (EXCLUDE.test(s)) continue;
    // Parcelas mensais: "10 (dez) parcelas mensais e sucessivas de R$ 1.000,00"
    const monthly = s.match(/(\d{1,2}|[a-zçê]+(?:\s+e\s+[a-z]+)?)\s*(?:\([^)]*\))?\s*(?:parcelas|presta[çc][õo]es|pagamentos)\s+(?:mensais|iguais|sucessivas|consecutivas)/i);
    if (monthly) {
      const n = /^\d+$/.test(monthly[1]) ? Number(monthly[1]) : NUMBER_WORDS[monthly[1].toLowerCase()] ?? 0;
      const each = s.slice(monthly.index! + monthly[0].length).match(MONEY);
      const amount = each ? brMoney(each[1]) : 0;
      if (n >= 2 && n <= 60) {
        // Entrada na mesma frase: "entrada de R$ 5.000,00 e o saldo em 5 parcelas..."
        const entry = s.match(/(?:entrada|sinal)[^R]{0,30}R\$\s*([\d.]+,\d{2})/i);
        if (entry) rows.push({ label: 'Entrada', amount: brMoney(entry[1]), percent: 0, due_date: brDate(s.slice(0, s.search(/parcelas/i))) || signed });
        let first = brDate(s.slice(s.search(/parcelas|presta/i)));
        const day = s.match(/(?:todo|cada)\s+dia\s+(\d{1,2})/i);
        if (!first && day && signed) {
          const [y, m] = signed.split('-').map(Number);
          first = validDate(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, Number(day[1]));
        }
        for (let k = 0; k < n; k++) {
          let due = '';
          if (first) {
            const [y, m, d] = first.split('-').map(Number);
            const mm = m - 1 + k;
            due = validDate(y + Math.floor(mm / 12), (mm % 12) + 1, d) || validDate(y + Math.floor(mm / 12), (mm % 12) + 1, 28);
          }
          rows.push({ label: `Parcela ${k + 1} de ${n}`, amount, percent: 0, due_date: due });
        }
        continue;
      }
    }
    // Percentuais: "30% na assinatura, 40% na entrega do anteprojeto e 30% na entrega do executivo"
    const percents = [...s.matchAll(PERCENT_G)].filter((m) => {
      const v = Number(m[1].replace(',', '.'));
      return v > 0 && v <= 100;
    });
    const payWords = /pag|parcela|honor[áa]rio|assinatura|entrega|entrada|sinal|saldo|restante|quita/i;
    if (percents.length && payWords.test(s) && !(percents.length === 1 && Number(percents[0][1].replace(',', '.')) === 100 && !/vista|única|unica/i.test(s))) {
      percents.forEach((m, j) => {
        const end = j + 1 < percents.length ? percents[j + 1].index! : s.length;
        const part = s.slice(m.index!, end);
        const money = part.match(MONEY);
        const label = labelFor(part, rows.length);
        const date = brDate(part);
        rows.push({
          label,
          amount: money ? brMoney(money[1]) : 0,
          percent: Number(m[1].replace(',', '.')),
          due_date: date || (label === 'Assinatura do contrato' || label === 'Entrada' ? signed : ''),
        });
      });
      continue;
    }
    // Valores com evento: "R$ 9.000,00 na assinatura" / "parcela de R$ 12.000,00 na entrega..."
    const moneys = [...s.matchAll(MONEY_G)];
    if (moneys.length === 1 && /parcela|entrada|sinal|na assinatura|no ato|na entrega|ap[óo]s a entrega|saldo|restante/i.test(s) && !/valor total|valor global|total de/i.test(s)) {
      const label = labelFor(s, rows.length);
      rows.push({
        label,
        amount: brMoney(moneys[0][1]),
        percent: 0,
        due_date: brDate(s) || (label === 'Assinatura do contrato' || label === 'Entrada' ? signed : ''),
      });
    }
  }
  return rows;
}

function parseTotal(text: string): number {
  const flat = text.replace(/\s+/g, ' ');
  const labelled = flat.match(/(?:valor total|valor global|valor dos honor[áa]rios|honor[áa]rios (?:totais|no valor|totalizam)|totaliza(?:m|ndo)?|pagar[áa] (?:a[oà]s?|à) CONTRATAD[AO]S?|pre[çc]o (?:total|global)|import[âa]ncia (?:total|de))[^R]{0,80}R\$\s*([\d.]+,\d{2})/i);
  if (labelled) return brMoney(labelled[1]);
  const all = [...flat.matchAll(MONEY_G)].filter((m) => !EXCLUDE.test(flat.slice(Math.max(0, m.index! - 80), m.index!))).map((m) => brMoney(m[1]));
  return all.length ? Math.max(...all) : 0;
}

/** Lê o texto de um contrato e devolve os dados no mesmo formato da leitura com IA. */
export function parseContractText(text: string): ContractExtraction {
  const flat = normalizeContractText(text);
  const docWarnings: string[] = [];
  const client = parseClient(flat, docWarnings);
  const signedMatch = [...flat.matchAll(/\b(\d{1,2})º?\s+de\s+([A-Za-zçÇ]+)\s+de\s+(\d{4})\b/gi)].filter((m) => MONTHS[m[2].toLowerCase()]).pop();
  const signed = signedMatch ? brDate(`${signedMatch[1]} de ${signedMatch[2].toLowerCase()} de ${signedMatch[3]}`) : '';
  const total = parseTotal(flat);
  const installments = parsePayments(flat, signed);
  const area = flat.match(/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*(?:m²|m2|metros quadrados)/i);
  const site = flat.match(/(?:im[óo]vel|obra|unidade|resid[êe]ncia|apartamento|casa|terreno)\s+(?:situad[oa]|localizad[oa]|sito)\s+(?:na|no|à|ao|em)\s+([\s\S]{5,400})/i);
  const objeto = flat.match(/(?:tem (?:como|por) objeto|objeto d[oe]st[ea] (?:contrato|instrumento) (?:é|consiste em|:)|(?<![A-Za-zÀ-ú])O objeto (?:é|consiste em))\s*:?\s*([\s\S]{10,600})/i);

  const siteAddr = site
    ? clean(
        untilSentenceEnd(site[1].replace(/\s+/g, ' '), 200)
          .replace(/,?\s*CEP:?\s*[\d.-]{8,10}.*$/i, '')
          .replace(/,\s*(?:com|de propriedade|objeto|matr[íi]cula|cuja|que)\b.*$/i, ''),
      )
    : '';
  const siteCity = siteAddr.match(/([A-ZÀ-Ú][A-Za-zÀ-ú' ]{1,40}?)\s*[/–-]\s*([A-Z]{2})\b/);
  const warnings = ['Leitura automática gratuita (sem IA): confira todos os campos antes de salvar.'];
  if (!client.document) warnings.push('Não encontrei o CPF/CNPJ do contratante. Preencha à mão.');
  warnings.push(...docWarnings);
  if (total && installments.length) {
    const sumAmounts = installments.reduce((a, r) => a + r.amount, 0);
    const sumPct = installments.reduce((a, r) => a + r.percent, 0);
    if (Math.abs(sumAmounts - total) > 0.01 && Math.abs(sumPct - 100) > 0.1) warnings.push('As parcelas encontradas não somam o valor total: confira a forma de pagamento.');
  }
  if (total && !installments.length) warnings.push('Encontrei o valor, mas não as parcelas: escolha a forma de pagamento.');

  return {
    client,
    contract: { total, signed_date: signed, installments },
    project: {
      site_address: siteAddr,
      site_city: siteCity ? clean(siteCity[1]) : '',
      area_m2: area ? brMoney(area[1]) : 0,
      scope: objeto ? clean(untilSentenceEnd(objeto[1].replace(/\s+/g, ' '))).replace(/^(?:a|o|os|as)\s+/i, '').replace(/^./, (c) => c.toUpperCase()) : '',
    },
    notes: '',
    warnings,
  };
}
