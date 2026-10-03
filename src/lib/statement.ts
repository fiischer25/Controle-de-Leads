// Importação de extrato bancário (OFX e CSV) e conciliação com os lançamentos do Financeiro.
// Funções puras: leitura do arquivo, interpretação de datas e valores no padrão brasileiro e
// sugestão de qual lançamento em aberto corresponde a cada transação.

import type { FinanceEntry } from './types';

export interface StatementTxn {
  /** Identificador estável da transação (FITID do OFX ou derivado da linha do CSV). */
  ref: string;
  /** AAAA-MM-DD */
  date: string;
  /** Positivo = entrada; negativo = saída. */
  amount: number;
  description: string;
}

// ---------------------------------------------------------------- texto do arquivo
/** Decodifica o arquivo respeitando o charset (bancos brasileiros costumam usar Windows-1252). */
export function decodeStatement(buf: ArrayBuffer): string {
  const head = new TextDecoder('latin1').decode(buf.slice(0, 600));
  if (/CHARSET:\s*1252|ENCODING:\s*USASCII|encoding="(windows-1252|iso-8859-1)"/i.test(head)) {
    return new TextDecoder('windows-1252').decode(buf);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

export function isOfx(text: string): boolean {
  return /<OFX>|OFXHEADER/i.test(text.slice(0, 2000));
}

// ---------------------------------------------------------------- valores e datas
/** "1.234,56", "-1234.56", "R$ 1.234,56", "(123,45)", "123,45 D" → número (null se não for valor). */
export function parseAmount(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let negative = false;
  // Sufixo D (débito) / C (crédito), comum em extratos: "123,45 D"
  const dc = s.match(/^(.*\d\)?)\s*([DdCc])$/);
  if (dc) {
    s = dc[1].trim();
    if (dc[2].toUpperCase() === 'D') negative = !negative;
  }
  if (/^\(.*\)$/.test(s)) {
    negative = !negative;
    s = s.slice(1, -1);
  }
  s = s.replace(/R\$|\s/g, '');
  if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot >= 0) {
    const decimals = s.length - lastDot - 1;
    const dots = (s.match(/\./g) ?? []).length;
    normalized = dots > 1 || decimals === 3 ? s.replace(/\./g, '') : s;
  } else normalized = s;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round((negative ? -n : n) * 100) / 100;
}

/** "03/10/2026", "03/10/26", "2026-10-03", "20261003", "03-10-2026", "03.10.2026" → "2026-10-03". */
export function parseDate(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return valid(y, +m[2], +m[1]);
  }
  return null;
}

function valid(y: number, mo: number, d: number): string | null {
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return dt.toISOString().slice(0, 10);
}

function cleanDescription(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------- OFX
export function parseOfx(text: string): StatementTxn[] {
  const out: StatementTxn[] = [];
  const field = (block: string, tag: string) => block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'))?.[1]?.trim() ?? '';
  const blocks = text.match(/<STMTTRN>[\s\S]*?(<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi) ?? [];
  blocks.forEach((b, i) => {
    const date = parseDate(field(b, 'DTPOSTED'));
    const amount = parseAmount(field(b, 'TRNAMT'));
    if (!date || amount == null || amount === 0) return;
    const memo = field(b, 'MEMO');
    const name = field(b, 'NAME');
    const description = cleanDescription(memo && name && !memo.includes(name) ? `${name} · ${memo}` : memo || name || 'Transação');
    const fitid = field(b, 'FITID');
    out.push({ ref: fitid ? `ofx:${fitid}` : `ofx:${date}|${amount}|${description}|${i}`, date, amount, description });
  });
  return out;
}

// ---------------------------------------------------------------- CSV
export interface CsvTable {
  headers: string[];
  rows: string[][];
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      cells.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

/** Lê o CSV: detecta o separador (; , ou tab) e pula linhas de cabeçalho do banco antes da tabela. */
export function parseCsv(text: string): CsvTable {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  const sample = lines.slice(0, 15).join('\n');
  const count = (d: string) => sample.split(d).length;
  const delimiter = [';', '\t', ','].sort((a, b) => count(b) - count(a))[0];
  const table = lines.map((l) => splitCsvLine(l, delimiter));
  const isData = (r: string[]) => r.some((c) => parseDate(c)) && r.some((c) => !parseDate(c) && parseAmount(c) != null);
  const first = table.findIndex(isData);
  if (first < 0) return { headers: [], rows: [] };
  const width = Math.max(...table.slice(first).map((r) => r.length));
  const headerRow = first > 0 && !isData(table[first - 1]) ? table[first - 1] : [];
  const headers = Array.from({ length: width }, (_, i) => headerRow[i]?.trim() || `Coluna ${i + 1}`);
  return { headers, rows: table.slice(first).filter((r) => r.length > 1) };
}

export interface CsvMapping {
  date: number;
  description: number;
  /** Coluna única de valor (com sinal)… */
  amount: number | null;
  /** …ou colunas separadas de crédito e débito. */
  credit: number | null;
  debit: number | null;
  /** Coluna com identificador da transação, se houver. */
  ref: number | null;
  /** Valores positivos são saídas (ex.: fatura de cartão). */
  invert: boolean;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Sugere as colunas pelo nome do cabeçalho e, se preciso, pelo conteúdo. */
export function guessMapping(t: CsvTable): CsvMapping {
  const h = t.headers.map(norm);
  const find = (re: RegExp, except: number[] = []) => h.findIndex((x, i) => re.test(x) && !except.includes(i));
  const byContent = (test: (v: string) => boolean, except: number[]) => {
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < t.headers.length; i++) {
      if (except.includes(i)) continue;
      const score = t.rows.slice(0, 30).filter((r) => test(r[i] ?? '')).length;
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    }
    return best;
  };
  let date = find(/^data|date|^dt/);
  if (date < 0) date = byContent((v) => !!parseDate(v), []);
  const ref = find(/identificador|^id$|fitid|n.? ?doc|documento/, [date]);
  const credit = find(/credito|entrada/, [date]);
  const debit = find(/debito|saida/, [date, credit]);
  let amount = find(/valor|amount|quantia|montante/, [date, credit, debit]);
  if (amount < 0 && (credit < 0 || debit < 0)) amount = byContent((v) => !parseDate(v) && parseAmount(v) != null, [date, ref]);
  let description = find(/descri|hist|memo|lancamento|titulo|title|estabelecimento|favorecido|detalhe/, [date, amount, ref]);
  if (description < 0) {
    description = byContent((v) => v.length > 3 && !parseDate(v) && parseAmount(v) == null, [date, amount, ref, credit, debit]);
  }
  const useSplit = amount < 0 && credit >= 0 && debit >= 0;
  return {
    date,
    description,
    amount: useSplit ? null : amount,
    credit: useSplit ? credit : null,
    debit: useSplit ? debit : null,
    ref: ref >= 0 ? ref : null,
    invert: false,
  };
}

export function csvTransactions(t: CsvTable, m: CsvMapping): StatementTxn[] {
  const seen = new Map<string, number>();
  const out: StatementTxn[] = [];
  for (const r of t.rows) {
    const date = parseDate(r[m.date]);
    let amount: number | null;
    if (m.amount != null) amount = parseAmount(r[m.amount]);
    else {
      const c = m.credit != null ? Math.abs(parseAmount(r[m.credit]) ?? 0) : 0;
      const d = m.debit != null ? Math.abs(parseAmount(r[m.debit]) ?? 0) : 0;
      amount = Math.round((c - d) * 100) / 100;
    }
    if (!date || amount == null || amount === 0) continue;
    if (m.invert) amount = -amount;
    const description = cleanDescription(r[m.description] ?? '') || 'Transação';
    let ref: string;
    if (m.ref != null && r[m.ref]) ref = `csv:${r[m.ref]}`;
    else {
      // Linhas idênticas no mesmo dia recebem um contador para não se confundirem
      const base = `${date}|${amount}|${norm(description)}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      ref = `csv:${base}|${n}`;
    }
    out.push({ ref, date, amount, description });
  }
  return out;
}

// ---------------------------------------------------------------- conciliação
export interface ReconcileRow {
  txn: StatementTxn;
  /** Já importada antes nesta conta. */
  duplicate: boolean;
  /** Lançamento em aberto que corresponde (mesmo tipo e valor, vencimento próximo). */
  match: FinanceEntry | null;
  /** Categoria sugerida pelo histórico de lançamentos parecidos. */
  categoryId: string | null;
}

/** Janela entre o vencimento e a data da transação para considerar a mesma conta. */
export const MATCH_WINDOW_DAYS = 10;

const GENERIC = new Set([
  'pix', 'ted', 'doc', 'tef', 'pagamento', 'pagto', 'pgto', 'compra', 'debito', 'credito', 'transferencia', 'enviado', 'enviada',
  'recebido', 'recebida', 'cartao', 'boleto', 'tarifa', 'para', 'de', 'do', 'da', 'dos', 'das', 'em', 'com', 'ltda', 'me', 'sa',
  'conta', 'mensal', 'parcela', 'via', 'internet', 'banking', 'app',
]);

function tokens(s: string): string[] {
  return norm(s)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter((w) => w.length > 2 && !GENERIC.has(w) && !/^\d+$/.test(w));
}

function daysBetween(a: string, b: string) {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

export function reconcile(txns: StatementTxn[], entries: FinanceEntry[], accountId: string): ReconcileRow[] {
  const imported = new Set(entries.filter((e) => e.account_id === accountId && e.bank_ref).map((e) => e.bank_ref));
  const open = entries.filter((e) => !e.paid_at && e.kind !== 'transferencia' && (!e.account_id || e.account_id === accountId));
  const used = new Set<string>();
  const history = entries
    .filter((e) => e.category_id && e.kind !== 'transferencia')
    .sort((a, b) => (b.paid_at ?? b.due_date).localeCompare(a.paid_at ?? a.due_date));

  return [...txns]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((txn) => {
      const kind = txn.amount > 0 ? 'receita' : 'despesa';
      const value = Math.abs(txn.amount);
      const duplicate = imported.has(txn.ref);
      let match: FinanceEntry | null = null;
      if (!duplicate) {
        const candidates = open
          .filter((e) => !used.has(e.id) && e.kind === kind && Math.abs(e.amount - value) < 0.005 && daysBetween(e.due_date, txn.date) <= MATCH_WINDOW_DAYS)
          .sort((a, b) => daysBetween(a.due_date, txn.date) - daysBetween(b.due_date, txn.date));
        match = candidates[0] ?? null;
        if (match) used.add(match.id);
      }
      // Categoria: a do lançamento mais recente com mais palavras em comum
      const words = tokens(txn.description);
      let categoryId: string | null = null;
      let best = 0;
      for (const e of history) {
        if (e.kind !== kind) continue;
        const shared = tokens(e.description).filter((w) => words.includes(w)).length;
        if (shared > best) {
          best = shared;
          categoryId = e.category_id;
        }
      }
      return { txn, duplicate, match, categoryId: match?.category_id ?? categoryId };
    });
}
