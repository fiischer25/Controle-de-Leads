import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { useData } from '../context/DataContext';
import { accountBalances, addMonthsKey, entryStatus, monthKey, monthTotals, sum } from '../lib/finance';
import type { FinanceEntry } from '../lib/types';
import { addDays, cn, formatDate, formatMoney, MONTHS_FULL, today } from '../lib/utils';
import { Button, Checkbox, IconButton } from '../components/ui';
import { ACCOUNT_KIND_LABEL, useFinance } from '../components/finance/useFinance';

function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_FULL[m - 1]} de ${y}`;
}

const pct = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}%` : '—');

/**
 * Relatório financeiro do mês em formato A4, para imprimir ou "Salvar como PDF" no navegador:
 * resumo de caixa, saldos por conta, receitas e despesas por categoria, recebido por projeto,
 * contas a receber e a pagar em aberto e (opcional) todos os lançamentos do mês.
 */
export default function FinanceReportPage() {
  const { db, maps, me, settings } = useData();
  const fin = useFinance();
  const [params, setParams] = useSearchParams();
  const t = today();
  const month = /^\d{4}-\d{2}$/.test(params.get('mes') ?? '') ? params.get('mes')! : monthKey(t);
  const [detailed, setDetailed] = useState(true);
  const setMonth = (m: string) => setParams({ mes: m }, { replace: true });

  // O relatório é sempre claro (impressão), mesmo com o tema escuro ligado
  useEffect(() => {
    const html = document.documentElement;
    const wasDark = html.classList.contains('dark');
    html.classList.remove('dark');
    const previousTitle = document.title;
    document.title = `Relatório financeiro ${month} · ${settings.office_name}`;
    return () => {
      if (wasDark) html.classList.add('dark');
      document.title = previousTitle;
    };
  }, [month, settings.office_name]);

  const r = useMemo(() => {
    const start = `${month}-01`;
    const end = addDays(addMonthsKey(start, 1), -1);
    const until = end < t ? end : t;
    const before = accountBalances(fin.accounts, fin.entries, addDays(start, -1));
    const after = accountBalances(fin.accounts, fin.entries, until);
    const totals = monthTotals(fin.entries, month);
    const paidInMonth = fin.entries.filter((e) => e.paid_at && monthKey(e.paid_at) === month);
    const group = (kind: 'receita' | 'despesa') => {
      const map: Record<string, number> = {};
      for (const e of paidInMonth) if (e.kind === kind) map[e.category_id ?? ''] = (map[e.category_id ?? ''] ?? 0) + e.amount;
      return Object.entries(map)
        .map(([id, v]) => ({ name: fin.categoryMap[id]?.name ?? 'Sem categoria', value: Math.round(v * 100) / 100 }))
        .sort((a, b) => b.value - a.value);
    };
    const byProject: Record<string, number> = {};
    for (const e of paidInMonth) if (e.kind === 'receita' && e.project_id) byProject[e.project_id] = (byProject[e.project_id] ?? 0) + e.amount;
    // Em aberto: vencidos e com vencimento até o fim do mês seguinte
    const horizon = addDays(addMonthsKey(start, 2), -1);
    const open = (kind: 'receita' | 'despesa') =>
      fin.entries.filter((e) => e.kind === kind && !e.paid_at && e.due_date <= horizon).sort((a, b) => a.due_date.localeCompare(b.due_date));
    const accounts = fin.accounts.filter((a) => a.active || before[a.id] || after[a.id]);
    const startTotal = sum(accounts.map((a) => before[a.id] ?? 0));
    const endTotal = sum(accounts.map((a) => after[a.id] ?? 0));
    // Recebimentos/pagamentos sem conta definida não mexem nos saldos: avisamos a diferença
    const noAccount = sum(paidInMonth.filter((e) => !e.account_id && e.kind !== 'transferencia').map((e) => (e.kind === 'receita' ? e.amount : -e.amount)));
    return {
      end,
      until,
      horizon,
      accounts,
      before,
      after,
      startTotal,
      endTotal,
      totals,
      result: Math.round((totals.inPaid - totals.outPaid) * 100) / 100,
      income: group('receita'),
      expense: group('despesa'),
      projects: Object.entries(byProject)
        .map(([id, v]) => ({ project: maps.projects[id], value: Math.round(v * 100) / 100 }))
        .sort((a, b) => b.value - a.value),
      receivable: open('receita'),
      payable: open('despesa'),
      entries: [...paidInMonth].sort((a, b) => (a.paid_at ?? '').localeCompare(b.paid_at ?? '') || a.description.localeCompare(b.description)),
      noAccount,
    };
  }, [fin.accounts, fin.entries, fin.categoryMap, maps.projects, month, t]);

  const now = new Date();
  const generated = `${formatDate(t)} às ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const partyOf = (e: FinanceEntry) => {
    const p = e.project_id ? maps.projects[e.project_id] : null;
    return p?.name ?? (e.client_id ? maps.clients[e.client_id]?.name : null) ?? '—';
  };

  return (
    <div className="min-h-screen bg-canvas print:bg-white">
      <style>{'@page { size: A4; margin: 14mm 12mm; } @media print { body { background: #fff; } }'}</style>

      {/* Barra de ações (não sai na impressão) */}
      <div className="sticky top-0 z-10 border-b border-line bg-canvas/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[860px] flex-wrap items-center gap-3 px-5 py-3">
          <Link to="/financeiro" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" /> Financeiro
          </Link>
          <div className="flex items-center gap-1">
            <IconButton label="Mês anterior" onClick={() => setMonth(monthKey(addMonthsKey(`${month}-01`, -1)))}>
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
            <span className="min-w-[140px] text-center text-[14px] font-medium text-ink">{monthLabel(month)}</span>
            <IconButton label="Próximo mês" onClick={() => setMonth(monthKey(addMonthsKey(`${month}-01`, 1)))}>
              <ChevronRight className="h-4 w-4" />
            </IconButton>
          </div>
          <div className="flex-1" />
          <Checkbox checked={detailed} onChange={setDetailed} label={<span className="text-[13px]">Incluir lista de lançamentos</span>} />
          <Button variant="primary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
            Imprimir / salvar PDF
          </Button>
        </div>
        <p className="mx-auto max-w-[860px] px-5 pb-2 text-[12px] text-faint">
          Na janela de impressão, escolha <b>Salvar como PDF</b> no destino.
        </p>
      </div>

      <article className="mx-auto my-8 max-w-[860px] bg-white px-10 py-10 text-[12px] leading-[1.45] text-stone-900 shadow-surface print:my-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-stone-300 pb-5">
          <div>
            {settings.logo_url ? (
              <img src={settings.logo_url} alt={settings.office_name} className="mb-2 h-10 w-auto object-contain" />
            ) : (
              <div className="mb-1 text-[14px] font-semibold tracking-[0.12em]">{settings.office_name.toUpperCase()}</div>
            )}
            <h1 className="font-display text-[24px] font-semibold leading-tight">Relatório financeiro</h1>
            <div className="text-[14px] text-stone-600">{monthLabel(month)}</div>
          </div>
          <div className="text-right text-[11px] text-stone-500">
            Gerado em {generated}
            <br />
            por {me.name}
          </div>
        </header>

        {/* Resumo */}
        <section className="mt-6 grid grid-cols-5 gap-3">
          <Box label={`Saldo em ${formatDate(addDays(`${month}-01`, -1)).slice(0, 5)}`} value={r.startTotal} />
          <Box label="Entradas" value={r.totals.inPaid} tone="text-emerald-800" sub={`previsto ${formatMoney(r.totals.inPlanned)}`} />
          <Box label="Saídas" value={r.totals.outPaid} sub={`previsto ${formatMoney(r.totals.outPlanned)}`} />
          <Box label="Resultado" value={r.result} tone={r.result < 0 ? 'text-red-800' : undefined} />
          <Box label={`Saldo em ${formatDate(r.until).slice(0, 5)}`} value={r.endTotal} />
        </section>
        {Math.abs(r.noAccount) >= 0.01 && (
          <p className="mt-2 text-[11px] text-stone-500">
            {formatMoney(r.noAccount)} em lançamentos pagos sem conta definida entram no resultado, mas não nos saldos.
          </p>
        )}

        <Section title="Saldos por conta">
          <Table
            head={['Conta', 'Tipo', 'Saldo inicial', 'Saldo final']}
            align={['left', 'left', 'right', 'right']}
            rows={r.accounts.map((a) => [a.name, ACCOUNT_KIND_LABEL[a.kind], formatMoney(r.before[a.id] ?? 0), formatMoney(r.after[a.id] ?? 0)])}
            foot={['Total', '', formatMoney(r.startTotal), formatMoney(r.endTotal)]}
          />
        </Section>

        <div className="grid grid-cols-2 gap-8">
          <Section title="Receitas por categoria">
            <Table
              head={['Categoria', 'Recebido', '%']}
              align={['left', 'right', 'right']}
              rows={r.income.map((c) => [c.name, formatMoney(c.value), pct(c.value, r.totals.inPaid)])}
              foot={['Total', formatMoney(r.totals.inPaid), '']}
              empty="Nenhum recebimento no mês."
            />
          </Section>
          <Section title="Despesas por categoria">
            <Table
              head={['Categoria', 'Pago', '%']}
              align={['left', 'right', 'right']}
              rows={r.expense.map((c) => [c.name, formatMoney(c.value), pct(c.value, r.totals.outPaid)])}
              foot={['Total', formatMoney(r.totals.outPaid), '']}
              empty="Nenhum pagamento no mês."
            />
          </Section>
        </div>

        <Section title="Recebido por projeto">
          <Table
            head={['Projeto', 'Cliente', 'Recebido']}
            align={['left', 'left', 'right']}
            rows={r.projects.map(({ project, value }) => [project?.name ?? '—', project ? (maps.clients[project.client_id]?.name ?? '—') : '—', formatMoney(value)])}
            empty="Nenhum honorário recebido no mês."
          />
        </Section>

        <Section title={`A receber em aberto (vencidos e até ${formatDate(r.horizon)})`}>
          <OpenTable entries={r.receivable} today={t} partyOf={partyOf} empty="Nada a receber em aberto." />
        </Section>
        <Section title={`A pagar em aberto (vencidos e até ${formatDate(r.horizon)})`}>
          <OpenTable entries={r.payable} today={t} partyOf={partyOf} empty="Nada a pagar em aberto." />
        </Section>

        {detailed && (
          <Section title="Lançamentos realizados no mês" breakBefore>
            <Table
              head={['Data', 'Descrição', 'Categoria', 'Conta', 'Valor']}
              align={['left', 'left', 'left', 'left', 'right']}
              rows={r.entries.map((e) => [
                formatDate(e.paid_at).slice(0, 5),
                e.description + (e.installments ? ` (${e.installment}/${e.installments})` : ''),
                e.kind === 'transferencia' ? 'Transferência' : (fin.categoryMap[e.category_id ?? '']?.name ?? '—'),
                e.kind === 'transferencia'
                  ? `${fin.accountMap[e.account_id ?? '']?.name ?? '—'} → ${fin.accountMap[e.to_account_id ?? '']?.name ?? '—'}`
                  : (fin.accountMap[e.account_id ?? '']?.name ?? '—'),
                `${e.kind === 'despesa' ? '−' : e.kind === 'receita' ? '+' : ''}${formatMoney(e.amount)}`,
              ])}
              empty="Nenhum lançamento pago no mês."
            />
          </Section>
        )}

        <footer className="mt-10 border-t border-stone-300 pt-3 text-[10.5px] text-stone-500">
          {settings.office_name} · Relatório gerado pelo sistema de gestão. Valores pelo regime de caixa (data do pagamento ou recebimento).
          {db.finance_entries.length === 0 && ' Nenhum lançamento cadastrado ainda.'}
        </footer>
      </article>
    </div>
  );
}

function Box({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: string }) {
  return (
    <div className="rounded-[8px] border border-stone-200 px-3 py-2.5">
      <div className="text-[10.5px] uppercase tracking-[0.06em] text-stone-500">{label}</div>
      <div className={cn('mt-1 text-[15px] font-semibold tabular', tone)}>{formatMoney(value)}</div>
      {sub && <div className="mt-0.5 text-[10.5px] text-stone-500">{sub}</div>}
    </div>
  );
}

function Section({ title, children, breakBefore }: { title: string; children: ReactNode; breakBefore?: boolean }) {
  return (
    <section className={cn('mt-7 break-inside-avoid', breakBefore && 'print:break-before-page')}>
      <h2 className="mb-2 text-[13px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Table({
  head,
  rows,
  foot,
  align,
  empty = 'Sem dados.',
}: {
  head: string[];
  rows: ReactNode[][];
  foot?: ReactNode[];
  align: Array<'left' | 'right'>;
  empty?: string;
}) {
  if (rows.length === 0) return <p className="border-t border-stone-200 py-2 text-stone-500">{empty}</p>;
  const cls = (i: number) => (align[i] === 'right' ? 'text-right tabular' : 'text-left');
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-stone-300 text-[10.5px] uppercase tracking-[0.05em] text-stone-500">
          {head.map((h, i) => (
            <th key={i} className={cn('py-1.5 pr-3 font-medium last:pr-0', cls(i))}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="break-inside-avoid border-b border-stone-200">
            {r.map((c, j) => (
              <td key={j} className={cn('py-1.5 pr-3 align-top last:pr-0', cls(j))}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {foot && (
        <tfoot>
          <tr className="font-semibold">
            {foot.map((c, j) => (
              <td key={j} className={cn('pt-2 pr-3 last:pr-0', cls(j))}>
                {c}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

function OpenTable({ entries, today, partyOf, empty }: { entries: FinanceEntry[]; today: string; partyOf: (e: FinanceEntry) => string; empty: string }) {
  return (
    <Table
      head={['Vencimento', 'Descrição', 'Projeto / cliente', 'Valor']}
      align={['left', 'left', 'left', 'right']}
      rows={entries.map((e) => [
        <span key="d" className={entryStatus(e, today) === 'vencido' ? 'font-medium text-red-800' : undefined}>
          {formatDate(e.due_date)}
          {entryStatus(e, today) === 'vencido' ? ' · vencido' : ''}
        </span>,
        e.description + (e.installments ? ` (${e.installment}/${e.installments})` : ''),
        partyOf(e),
        formatMoney(e.amount),
      ])}
      foot={entries.length ? ['Total', '', '', formatMoney(sum(entries.map((e) => e.amount)))] : undefined}
      empty={empty}
    />
  );
}
