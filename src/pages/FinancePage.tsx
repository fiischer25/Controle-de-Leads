import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, ChevronLeft, ChevronRight, Download, FileText, Plus, Upload } from 'lucide-react';
import { useData } from '../context/DataContext';
import { addMonthsKey, entryDate, monthKey, monthsBack, monthTotals, sum } from '../lib/finance';
import type { FinanceEntry, FinanceKind } from '../lib/types';
import { addDays, cn, downloadFile, formatCurrency, formatDate, formatMoney, matches, MONTHS_FULL, toCsv, today } from '../lib/utils';
import { ActionLink, BarRow, Button, FilterPick, IconButton, MetricRow, PageHeader, SearchField, SectionHeader, Tabs, Toolbar } from '../components/ui';
import { MonthBars } from '../components/charts/MonthBars';
import { EntryFormModal } from '../components/finance/EntryFormModal';
import { EntryList } from '../components/finance/EntryList';
import { ACCOUNT_KIND_LABEL, useFinance } from '../components/finance/useFinance';
import { FinanceAccounts } from '../components/finance/FinanceAccounts';
import { FinanceProfitability } from '../components/finance/FinanceProfitability';
import { FinanceCategories } from '../components/finance/FinanceCategories';
import { ImportStatementModal } from '../components/finance/ImportStatementModal';

type Tab = 'geral' | 'lancamentos' | 'contas' | 'rentabilidade' | 'categorias';
type Editing = { entry?: FinanceEntry; kind?: FinanceKind } | null;

function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_FULL[m - 1]} de ${y}`;
}

/** Financeiro do escritório: caixa, contas a receber e a pagar, contas, rentabilidade e categorias. */
export default function FinancePage() {
  const [params, setParams] = useSearchParams();
  const tab = (['geral', 'lancamentos', 'contas', 'rentabilidade', 'categorias'] as Tab[]).includes(params.get('aba') as Tab) ? (params.get('aba') as Tab) : 'geral';
  const setTab = (t: Tab) => setParams(t === 'geral' ? {} : { aba: t }, { replace: true });
  const fin = useFinance();
  const [editing, setEditing] = useState<Editing>(null);
  const [importing, setImporting] = useState<{ account?: string } | null>(null);
  const navigate = useNavigate();

  const overdueIn = sum(fin.entries.filter((e) => e.kind === 'receita' && fin.status(e) === 'vencido').map((e) => e.amount));
  const overdueOut = sum(fin.entries.filter((e) => e.kind === 'despesa' && fin.status(e) === 'vencido').map((e) => e.amount));

  return (
    <div>
      <PageHeader
        title="Financeiro"
        description={
          <>
            {formatMoney(fin.totalBalance)} em contas
            {overdueIn > 0 && (
              <>
                {' · '}
                <span className="text-danger-fg">{formatMoney(overdueIn)} a receber vencido</span>
              </>
            )}
            {overdueOut > 0 && (
              <>
                {' · '}
                <span className="text-danger-fg">{formatMoney(overdueOut)} a pagar vencido</span>
              </>
            )}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" icon={<FileText className="h-4 w-4" strokeWidth={1.6} />} onClick={() => navigate('/financeiro/relatorio')} className="max-md:hidden">
              Relatório
            </Button>
            <Button variant="ghost" icon={<ArrowLeftRight className="h-4 w-4" strokeWidth={1.6} />} onClick={() => setEditing({ kind: 'transferencia' })} className="max-md:hidden">
              Transferência
            </Button>
            <Button variant="ghost" icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => setEditing({ kind: 'receita' })}>
              Receita
            </Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => setEditing({ kind: 'despesa' })}>
              Despesa
            </Button>
          </div>
        }
      />

      <Tabs<Tab>
        tabs={[
          { id: 'geral', label: 'Visão geral' },
          { id: 'lancamentos', label: 'Lançamentos' },
          { id: 'contas', label: 'Contas', count: fin.accounts.filter((a) => a.active).length },
          { id: 'rentabilidade', label: 'Rentabilidade' },
          { id: 'categorias', label: 'Categorias' },
        ]}
        value={tab}
        onChange={setTab}
        underline={1}
        bordered={tab !== 'geral'}
        className="border-hairline"
      />

      <div className={tab === 'geral' ? 'mt-4' : 'mt-8'}>
        {tab === 'geral' && <Overview onOpen={(entry) => setEditing({ entry })} onTab={setTab} />}
        {tab === 'lancamentos' && <Entries onOpen={(entry) => setEditing({ entry })} onImport={() => setImporting({})} />}
        {tab === 'contas' && <FinanceAccounts onImport={(account) => setImporting({ account })} />}
        {tab === 'rentabilidade' && <FinanceProfitability />}
        {tab === 'categorias' && <FinanceCategories />}
      </div>

      {importing && <ImportStatementModal defaultAccount={importing.account} onClose={() => setImporting(null)} />}
      {editing && (
        <EntryFormModal
          key={editing.entry?.id ?? editing.kind}
          entry={editing.entry}
          defaults={editing.kind ? { kind: editing.kind } : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Visão geral
function Overview({ onOpen, onTab }: { onOpen: (e: FinanceEntry) => void; onTab: (t: Tab) => void }) {
  const fin = useFinance();
  const t = today();
  const month = monthKey(t);

  const data = useMemo(() => {
    const totals = monthTotals(fin.entries, month);
    const endOfMonth = addDays(addMonthsKey(`${month}-01`, 1), -1);
    const open = fin.entries.filter((e) => !e.paid_at && e.kind !== 'transferencia');
    // Saldo previsto no fim do mês: saldo atual + a receber − a pagar até o fim do mês (inclui vencidos)
    const dueByEnd = open.filter((e) => e.due_date <= endOfMonth);
    const projected =
      fin.totalBalance + sum(dueByEnd.filter((e) => e.kind === 'receita').map((e) => e.amount)) - sum(dueByEnd.filter((e) => e.kind === 'despesa').map((e) => e.amount));
    const upcoming = open.filter((e) => e.due_date <= addDays(t, 30)).sort((a, b) => a.due_date.localeCompare(b.due_date));
    // A receber por mês (este e os próximos 11): cada parcela no mês do vencimento
    const ahead = monthsBack(monthKey(addMonthsKey(`${month}-01`, 11)), 12)
      .map((key) => {
        const items = open.filter((e) => e.kind === 'receita' && monthKey(e.due_date) === key && e.due_date >= `${month}-01`).sort((a, b) => a.due_date.localeCompare(b.due_date));
        return { key, items, total: sum(items.map((e) => e.amount)) };
      })
      .filter((m) => m.items.length > 0);
    const months = monthsBack(month, 12).map((key) => {
      const m = monthTotals(fin.entries, key);
      const [, mm] = key.split('-').map(Number);
      return { key, label: MONTHS_FULL[mm - 1].slice(0, 3), in: m.inPaid, out: m.outPaid };
    });
    const byCategory: Record<string, number> = {};
    for (const e of fin.entries) {
      if (e.kind !== 'despesa' || monthKey(e.due_date) !== month) continue;
      const k = e.category_id ?? 'none';
      byCategory[k] = (byCategory[k] ?? 0) + e.amount;
    }
    return {
      totals,
      projected: Math.round(projected * 100) / 100,
      upcoming,
      ahead,
      months,
      categories: Object.entries(byCategory).sort((a, b) => b[1] - a[1]),
      overdueIn: sum(open.filter((e) => e.kind === 'receita' && e.due_date < t).map((e) => e.amount)),
      overdueOut: sum(open.filter((e) => e.kind === 'despesa' && e.due_date < t).map((e) => e.amount)),
    };
  }, [fin.entries, fin.totalBalance, month, t]);

  const result = Math.round((data.totals.inPaid - data.totals.outPaid) * 100) / 100;
  const maxCat = data.categories[0]?.[1] ?? 1;

  return (
    <div className="flex flex-col gap-12 md:gap-14">
      <MetricRow
        label={monthLabel(month)}
        items={[
          { label: 'Saldo em contas', value: formatCurrency(fin.totalBalance), sub: `fim do mês: ${formatCurrency(data.projected)}`, hint: formatMoney(fin.totalBalance) },
          { label: 'Recebido no mês', value: formatCurrency(data.totals.inPaid), sub: `de ${formatCurrency(data.totals.inPlanned)} previsto`, hint: formatMoney(data.totals.inPaid) },
          { label: 'Pago no mês', value: formatCurrency(data.totals.outPaid), sub: `de ${formatCurrency(data.totals.outPlanned)} previsto`, hint: formatMoney(data.totals.outPaid) },
          { label: 'Resultado do mês', value: formatCurrency(result), tone: result < 0 ? 'text-danger-fg' : undefined, sub: 'recebido − pago', hint: formatMoney(result) },
          { label: 'A receber vencido', value: formatCurrency(data.overdueIn), tone: data.overdueIn ? 'text-danger-fg' : undefined, hint: formatMoney(data.overdueIn) },
          { label: 'A pagar vencido', value: formatCurrency(data.overdueOut), tone: data.overdueOut ? 'text-danger-fg' : undefined, hint: formatMoney(data.overdueOut) },
        ]}
      />

      <div className="grid gap-12 lg:grid-cols-[1fr_300px] lg:gap-16">
        <section aria-labelledby="vencimentos" className="min-w-0">
          <SectionHeader
            id="vencimentos"
            title="Vencidos e próximos 30 dias"
            aside={<ActionLink to="/financeiro?aba=lancamentos" muted>Todos os lançamentos</ActionLink>}
          />
          <EntryList entries={data.upcoming.slice(0, 12)} onOpen={onOpen} compact empty="Nada vencido nem vencendo nos próximos 30 dias." />
          {data.upcoming.length > 12 && <p className="border-t border-hairline pt-3 text-[12.5px] text-faint">e mais {data.upcoming.length - 12}</p>}
        </section>
        <section aria-labelledby="saldos">
          <SectionHeader id="saldos" title="Saldos" aside={<ActionLink onClick={() => onTab('contas')} muted>Contas</ActionLink>} />
          <ul>
            {fin.accounts
              .filter((a) => a.active)
              .map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-3 border-t border-hairline py-3">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 truncate text-[13.5px] text-ink">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: a.color }} aria-hidden />
                      {a.name}
                    </span>
                    <span className="block pl-3.5 text-[12.5px] text-faint">{ACCOUNT_KIND_LABEL[a.kind]}</span>
                  </span>
                  <span className={cn('shrink-0 text-[13.5px] tabular', (fin.balances[a.id] ?? 0) < 0 ? 'text-danger-fg' : 'text-ink')}>
                    {formatMoney(fin.balances[a.id] ?? 0)}
                  </span>
                </li>
              ))}
            {fin.accounts.length === 0 && <li className="border-t border-hairline py-3 text-[13px] text-faint">Cadastre as contas do escritório.</li>}
          </ul>
        </section>
      </div>

      <section aria-labelledby="a-receber-mes">
        <SectionHeader
          id="a-receber-mes"
          title="A receber por mês"
          aside={<span className="text-[12.5px] text-faint">parcelas em aberto · próximos 12 meses · {formatMoney(sum(data.ahead.map((m) => m.total)))}</span>}
        />
        {data.ahead.length === 0 ? (
          <p className="border-t border-hairline py-4 text-[13px] text-faint">Nenhuma receita em aberto nos próximos 12 meses.</p>
        ) : (
          <div className="space-y-8">
            {data.ahead.map((m) => (
              <div key={m.key}>
                <div className="flex items-baseline justify-between gap-3 pb-1.5">
                  <span className="font-display text-[14.5px] font-semibold text-ink">
                    {monthLabel(m.key)}{' '}
                    <span className="text-[12.5px] font-normal text-faint">
                      · {m.items.length} {m.items.length === 1 ? 'parcela' : 'parcelas'}
                    </span>
                  </span>
                  <span className="flex items-baseline gap-4">
                    <span className="text-[13.5px] tabular text-ink">{formatMoney(m.total)}</span>
                    <ActionLink to={`/financeiro?aba=lancamentos&mes=${m.key}`} muted>
                      Ver o mês
                    </ActionLink>
                  </span>
                </div>
                <EntryList entries={m.items} onOpen={onOpen} compact />
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-3 lg:gap-12">
        <section aria-labelledby="entradas" className="min-w-0">
          <SectionHeader id="entradas" title="Entradas" aside={<span className="text-[12.5px] text-faint">recebido por mês</span>} />
          <div className="border-t border-hairline pt-4">
            <MonthBars title="Últimos 12 meses" total={sum(data.months.map((m) => m.in))} months={data.months.map((m) => ({ key: m.key, label: m.label, value: m.in }))} caption="" format={formatCurrency} />
          </div>
        </section>
        <section aria-labelledby="saidas" className="min-w-0">
          <SectionHeader id="saidas" title="Saídas" aside={<span className="text-[12.5px] text-faint">pago por mês</span>} />
          <div className="border-t border-hairline pt-4">
            <MonthBars title="Últimos 12 meses" total={sum(data.months.map((m) => m.out))} months={data.months.map((m) => ({ key: m.key, label: m.label, value: m.out }))} caption="" format={formatCurrency} />
          </div>
        </section>
        <section aria-labelledby="por-categoria" className="min-w-0 md:col-span-2 lg:col-span-1">
          <SectionHeader id="por-categoria" title="Despesas do mês" aside={<span className="text-[12.5px] text-faint">por categoria</span>} />
          <div className="space-y-4 border-t border-hairline pt-4">
            {data.categories.length === 0 && <p className="text-[13px] text-faint">Nenhuma despesa com vencimento neste mês.</p>}
            {data.categories.map(([id, value]) => {
              const c = fin.categoryMap[id];
              return <BarRow key={id} label={c?.name ?? 'Sem categoria'} value={value} max={maxCat} color={c?.color} display={formatCurrency(value)} title={formatMoney(value)} />;
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Lançamentos
type KindFilter = 'todos' | FinanceKind;

function Entries({ onOpen, onImport }: { onOpen: (e: FinanceEntry) => void; onImport: () => void }) {
  const { db, maps } = useData();
  const fin = useFinance();
  const t = today();
  const [params] = useSearchParams();
  // ?mes=AAAA-MM abre direto no mês (link de "A receber por mês")
  const [month, setMonth] = useState(/^\d{4}-\d{2}$/.test(params.get('mes') ?? '') ? params.get('mes')! : monthKey(t));
  const [kind, setKind] = useState<KindFilter>('todos');
  const [status, setStatus] = useState('');
  const [account, setAccount] = useState('');
  const [category, setCategory] = useState('');
  const [project, setProject] = useState('');
  const [query, setQuery] = useState('');

  // "Vencidos" mostra todos os atrasados, de qualquer mês
  const allMonths = status === 'vencido';
  const rows = useMemo(
    () =>
      fin.entries
        .filter((e) => {
          if (!allMonths && monthKey(entryDate(e)) !== month) return false;
          if (kind !== 'todos' && e.kind !== kind) return false;
          if (status && fin.status(e) !== status) return false;
          if (account && e.account_id !== account && e.to_account_id !== account) return false;
          if (category && e.category_id !== category) return false;
          if (project && e.project_id !== project) return false;
          const p = e.project_id ? maps.projects[e.project_id] : null;
          return matches(query, e.description, e.document, e.notes, p?.name, e.client_id ? maps.clients[e.client_id]?.name : null);
        })
        .sort((a, b) => entryDate(a).localeCompare(entryDate(b)) || a.description.localeCompare(b.description)),
    [fin, allMonths, month, kind, status, account, category, project, query, maps],
  );

  const income = sum(rows.filter((e) => e.kind === 'receita').map((e) => e.amount));
  const expense = sum(rows.filter((e) => e.kind === 'despesa').map((e) => e.amount));
  const projectsWithEntries = useMemo(() => {
    const ids = new Set(db.finance_entries.map((e) => e.project_id).filter(Boolean) as string[]);
    return db.projects.filter((p) => ids.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [db.finance_entries, db.projects]);

  const exportCsv = () =>
    downloadFile(
      `financeiro-${allMonths ? 'vencidos' : month}.csv`,
      toCsv(
        rows.map((e) => ({
          Tipo: e.kind === 'receita' ? 'Receita' : e.kind === 'despesa' ? 'Despesa' : 'Transferência',
          Descrição: e.description,
          Vencimento: formatDate(e.due_date),
          Pagamento: e.paid_at ? formatDate(e.paid_at) : '',
          Situação: fin.status(e),
          Valor: (e.kind === 'despesa' ? -e.amount : e.amount).toFixed(2).replace('.', ','),
          Conta: e.account_id ? (fin.accountMap[e.account_id]?.name ?? '') : '',
          Categoria: e.category_id ? (fin.categoryMap[e.category_id]?.name ?? '') : '',
          Projeto: e.project_id ? (maps.projects[e.project_id]?.name ?? '') : '',
          Cliente: e.client_id ? (maps.clients[e.client_id]?.name ?? '') : '',
          Parcela: e.installments ? `${e.installment}/${e.installments}` : '',
          Documento: e.document ?? '',
        })),
      ),
      'text/csv',
    );

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className={cn('flex items-center gap-1', allMonths && 'opacity-40')}>
          <IconButton label="Mês anterior" onClick={() => setMonth(monthKey(addMonthsKey(`${month}-01`, -1)))} disabled={allMonths}>
            <ChevronLeft className="h-4 w-4" />
          </IconButton>
          <span className="min-w-[150px] text-center font-display text-[15px] font-semibold text-ink">{monthLabel(month)}</span>
          <IconButton label="Próximo mês" onClick={() => setMonth(monthKey(addMonthsKey(`${month}-01`, 1)))} disabled={allMonths}>
            <ChevronRight className="h-4 w-4" />
          </IconButton>
        </div>
        {month !== monthKey(t) && !allMonths && (
          <button type="button" onClick={() => setMonth(monthKey(t))} className="text-[13px] text-faint hover:text-ink">
            Mês atual
          </button>
        )}
        <div className="flex-1" />
        <Tabs<KindFilter>
          tabs={[
            { id: 'todos', label: 'Tudo' },
            { id: 'receita', label: 'Receitas' },
            { id: 'despesa', label: 'Despesas' },
            { id: 'transferencia', label: 'Transferências' },
          ]}
          value={kind}
          onChange={setKind}
          size="sm"
          underline={1}
          bordered={false}
        />
      </div>

      <Toolbar
        search={<SearchField value={query} onChange={setQuery} placeholder="Buscar descrição, projeto, NF…" label="Buscar lançamentos" />}
        filters={
          <>
            <FilterPick
              label="Situação"
              allLabel="Todas"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'pendente', label: 'Pendentes' },
                { value: 'vencido', label: 'Vencidos (todos os meses)' },
                { value: 'pago', label: 'Pagos e recebidos' },
              ]}
            />
            <FilterPick label="Conta" allLabel="Todas as contas" value={account} onChange={setAccount} options={fin.accounts.map((a) => ({ value: a.id, label: a.name }))} />
            <FilterPick
              label="Categoria"
              allLabel="Todas as categorias"
              value={category}
              onChange={setCategory}
              options={fin.categories.map((c) => ({ value: c.id, label: `${c.name}${c.kind === 'receita' ? ' (receita)' : ''}` }))}
            />
            {projectsWithEntries.length > 0 && (
              <FilterPick label="Projeto" allLabel="Todos os projetos" value={project} onChange={setProject} options={projectsWithEntries.map((p) => ({ value: p.id, label: p.name }))} />
            )}
          </>
        }
        aside={
          <>
            <Button variant="ghost" size="sm" icon={<Upload className="h-3.5 w-3.5" />} onClick={onImport}>
              Importar extrato
            </Button>
            <Button variant="ghost" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={exportCsv} disabled={rows.length === 0}>
              CSV
            </Button>
          </>
        }
      />

      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted">
        <span>
          Receitas <span className="tabular text-success-fg">{formatMoney(income)}</span>
        </span>
        <span>
          Despesas <span className="tabular text-ink">{formatMoney(expense)}</span>
        </span>
        <span>
          Saldo{' '}
          <span className={cn('tabular font-medium', income - expense < 0 ? 'text-danger-fg' : 'text-ink')}>{formatMoney(Math.round((income - expense) * 100) / 100)}</span>
        </span>
        <span className="text-faint">
          {rows.length} {rows.length === 1 ? 'lançamento' : 'lançamentos'}
        </span>
      </div>

      <div className="mt-3">
        <EntryList entries={rows} onOpen={onOpen} empty={allMonths ? 'Nenhum lançamento vencido.' : 'Nenhum lançamento neste mês com esses filtros.'} />
      </div>
    </div>
  );
}
