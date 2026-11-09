import { FixReceiptDates } from '../components/finance/FixReceiptDates';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, Download, FileText, Plus, Upload } from 'lucide-react';
import { useData } from '../context/DataContext';
import { entryDate, monthKey, monthLabel, monthsWithEntries, sum } from '../lib/finance';
import type { FinanceEntry, FinanceKind } from '../lib/types';
import { cn, downloadFile, formatCurrency, formatDate, formatMoney, matches, MONTHS_FULL, toCsv, today } from '../lib/utils';
import { ActionLink, BarRow, Button, FilterPick, PageHeader, SearchField, SectionHeader, Tabs, Toolbar } from '../components/ui';
import { EntryFormModal } from '../components/finance/EntryFormModal';
import { FinanceBilling } from '../components/finance/FinanceBilling';
import { FinancePayroll } from '../components/finance/FinancePayroll';
import { EntryList } from '../components/finance/EntryList';
import { CashFlowChart, MonthCards, ReceivablesByMonth } from '../components/finance/FinanceOverviewParts';
import { ACCOUNT_KIND_LABEL, useFinance } from '../components/finance/useFinance';
import { FinanceAccounts } from '../components/finance/FinanceAccounts';
import { FinanceProfitability } from '../components/finance/FinanceProfitability';
import { FinanceCategories } from '../components/finance/FinanceCategories';
import { ImportStatementModal } from '../components/finance/ImportStatementModal';
import { useFinanceOverview } from '../components/finance/useFinanceOverview';
import { MonthPicker } from '../components/finance/MonthPicker';

type Tab = 'geral' | 'lancamentos' | 'cobranca' | 'folha' | 'contas' | 'rentabilidade' | 'categorias';
type Editing = { entry?: FinanceEntry; kind?: FinanceKind } | null;

/** Mês escolhido (?mes=AAAA-MM), o mesmo na Visão geral e nos Lançamentos; sem ele, o mês atual. */
function useMonthParam(): [string, (m: string) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('mes') ?? '';
  const month = /^\d{4}-\d{2}$/.test(raw) ? raw : monthKey(today());
  const setMonth = (m: string) => {
    const next = new URLSearchParams(params);
    if (m === monthKey(today())) next.delete('mes');
    else next.set('mes', m);
    setParams(next, { replace: true });
  };
  return [month, setMonth];
}

/** Financeiro do escritório: caixa, contas a receber e a pagar, contas, rentabilidade e categorias. */
export default function FinancePage() {
  const [params, setParams] = useSearchParams();
  const tab = (['geral', 'lancamentos', 'cobranca', 'folha', 'contas', 'rentabilidade', 'categorias'] as Tab[]).includes(params.get('aba') as Tab) ? (params.get('aba') as Tab) : 'geral';
  // Ao trocar de aba, o mês escolhido continua
  const setTab = (t: Tab) => {
    const next: Record<string, string> = t === 'geral' ? {} : { aba: t };
    if (params.get('mes')) next.mes = params.get('mes')!;
    setParams(next, { replace: true });
  };
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
            <Button variant="ghost" icon={<FileText className="h-4 w-4" strokeWidth={1.6} />} onClick={() => navigate(`/financeiro/relatorio${params.get('mes') ? `?mes=${params.get('mes')}` : ''}`)} className="max-md:hidden">
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
          { id: 'cobranca', label: 'Cobrança' },
          { id: 'folha', label: 'Folha' },
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
        {tab !== 'categorias' && <FixReceiptDates />}
        {tab === 'geral' && <Overview onOpen={(entry) => setEditing({ entry })} onTab={setTab} />}
        {tab === 'lancamentos' && <Entries onOpen={(entry) => setEditing({ entry })} onImport={() => setImporting({})} />}
        {tab === 'cobranca' && <FinanceBilling />}
        {tab === 'folha' && <FinancePayroll onOpen={(entry) => setEditing({ entry })} />}
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
  const [month, setMonth] = useMonthParam();
  const marked = useMemo(() => monthsWithEntries(fin.entries), [fin.entries]);
  const isCurrent = month === monthKey(today());
  const name = MONTHS_FULL[Number(month.slice(5, 7)) - 1].toLowerCase();

  const data = useFinanceOverview(undefined, month);

  const maxCat = data.categories[0]?.[1] ?? 1;

  return (
    <div className="flex flex-col gap-12 md:gap-14">
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <MonthPicker value={month} onChange={setMonth} marked={marked} className="-ml-2" />
          {!isCurrent && (
            <span className="text-[12.5px] text-faint" data-month-note>
              {month < monthKey(today()) ? 'mês que já passou: o que de fato entrou e saiu' : 'mês que ainda vem: previsto pelos vencimentos'}
            </span>
          )}
        </div>
        <MonthCards data={data} />
        <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
          <button
            type="button"
            onClick={() => onTab('lancamentos')}
            className="rounded-full border border-success-line bg-success-bg px-3 py-1.5 text-success-fg hover:brightness-95"
          >
            Total a receber em aberto: <b className="font-semibold">{formatMoney(data.receivable)}</b>
          </button>
          {data.overdueIn > 0 && (
            <button type="button" onClick={() => onTab('lancamentos')} className="rounded-full border border-danger-line bg-danger-bg px-3 py-1.5 text-danger-fg hover:brightness-95">
              A receber vencido: <b className="font-semibold">{formatMoney(data.overdueIn)}</b>
            </button>
          )}
          {data.overdueOut > 0 && (
            <button type="button" onClick={() => onTab('lancamentos')} className="rounded-full border border-danger-line bg-danger-bg px-3 py-1.5 text-danger-fg hover:brightness-95">
              A pagar vencido: <b className="font-semibold">{formatMoney(data.overdueOut)}</b>
            </button>
          )}
        </div>
      </div>

      <section aria-labelledby="fluxo">
        <SectionHeader
          id="fluxo"
          title="Fluxo de caixa"
          aside={
            <span className="text-[12.5px] text-faint">
              cada mês: as entradas pagam as contas do mesmo mês · previsto nos próximos · clique num mês para ver
            </span>
          }
        />
        <div className="rounded-[16px] border border-line bg-surface p-5 shadow-card">
          <CashFlowChart months={data.flow} onSelect={setMonth} />
        </div>
      </section>

      <section aria-labelledby="a-receber-mes">
        <SectionHeader
          id="a-receber-mes"
          title="A receber por mês"
          aside={<span className="text-[12.5px] text-faint">parcelas em aberto · próximos 12 meses · {formatMoney(sum(data.ahead.map((m) => m.total)))}</span>}
        />
        <ReceivablesByMonth months={data.ahead} onOpen={onOpen} monthLabel={monthLabel} />
      </section>

      <div className="grid gap-12 lg:grid-cols-[1fr_320px] lg:gap-16">
        <section aria-labelledby="vencimentos" className="panel min-w-0">
          <SectionHeader
            id="vencimentos"
            title="Vencidos e próximos 30 dias"
            aside={<ActionLink to="/financeiro?aba=lancamentos" muted>Todos os lançamentos</ActionLink>}
          />
          <EntryList entries={data.upcoming.slice(0, 12)} onOpen={onOpen} compact empty="Nada vencido nem vencendo nos próximos 30 dias." />
          {data.upcoming.length > 12 && <p className="border-t border-hairline pt-3 text-[12.5px] text-faint">e mais {data.upcoming.length - 12}</p>}
        </section>
        <div className="space-y-12">
          <section aria-labelledby="saldos">
            <SectionHeader id="saldos" title={isCurrent ? 'Saldos' : 'Saldos hoje'} aside={<ActionLink onClick={() => onTab('contas')} muted>Contas</ActionLink>} />
            <ul className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-card">
              {fin.accounts
                .filter((a) => a.active)
                .map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-3 border-b border-line/70 px-4 py-3 last:border-b-0">
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 truncate text-[13.5px] text-ink">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: a.color }} aria-hidden />
                        {a.name}
                      </span>
                      <span className="block pl-3.5 text-[12.5px] text-faint">{ACCOUNT_KIND_LABEL[a.kind]}</span>
                    </span>
                    <span className={cn('shrink-0 text-[14px] font-medium tabular', (fin.balances[a.id] ?? 0) < 0 ? 'text-danger-fg' : 'text-ink')}>
                      {formatMoney(fin.balances[a.id] ?? 0)}
                    </span>
                  </li>
                ))}
              {fin.accounts.length === 0 && <li className="px-4 py-3 text-[13px] text-faint">Cadastre as contas do escritório.</li>}
            </ul>
          </section>
          <section aria-labelledby="por-categoria" className="panel min-w-0">
            <SectionHeader id="por-categoria" title={`Despesas de ${name}`} aside={<span className="text-[12.5px] text-faint">por categoria</span>} />
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
    </div>
  );
}

// ---------------------------------------------------------------- Lançamentos
type KindFilter = 'todos' | FinanceKind;

function Entries({ onOpen, onImport }: { onOpen: (e: FinanceEntry) => void; onImport: () => void }) {
  const { db, maps } = useData();
  const fin = useFinance();
  // ?mes=AAAA-MM: o mesmo mês escolhido na Visão geral (e o link de "A receber por mês")
  const [month, setMonth] = useMonthParam();
  const marked = useMemo(() => monthsWithEntries(fin.entries), [fin.entries]);
  const [kind, setKind] = useState<KindFilter>('todos');
  const [status, setStatus] = useState('');
  const [account, setAccount] = useState('');
  const [category, setCategory] = useState('');
  const [project, setProject] = useState('');
  const [query, setQuery] = useState('');

  // "Vencidos" mostra todos os atrasados, de qualquer mês
  const allMonths = status === 'vencido';
  const filtered = useMemo(
    () =>
      fin.entries
        .filter((e) => {
          if (kind !== 'todos' && e.kind !== kind) return false;
          if (status && fin.status(e) !== status) return false;
          if (account && e.account_id !== account && e.to_account_id !== account) return false;
          if (category && e.category_id !== category) return false;
          if (project && e.project_id !== project) return false;
          const p = e.project_id ? maps.projects[e.project_id] : null;
          return matches(query, e.description, e.document, e.notes, p?.name, e.client_id ? maps.clients[e.client_id]?.name : null);
        })
        .sort((a, b) => entryDate(a).localeCompare(entryDate(b)) || a.description.localeCompare(b.description)),
    [fin, kind, status, account, category, project, query, maps],
  );
  const inMonth = (key: string) => filtered.filter((e) => monthKey(entryDate(e)) === key);
  const rows = allMonths ? filtered : inMonth(month);

  const income = sum(rows.filter((e) => e.kind === 'receita').map((e) => e.amount));
  const expense = sum(rows.filter((e) => e.kind === 'despesa').map((e) => e.amount));
  // As entradas do mês pagam as contas do mesmo mês
  const cycle = !allMonths;
  const incomePaid = sum(rows.filter((e) => e.kind === 'receita' && e.paid_at).map((e) => e.amount));
  const expensePaid = sum(rows.filter((e) => e.kind === 'despesa' && e.paid_at).map((e) => e.amount));
  const leftover = Math.round((income - expense) * 100) / 100;
  const name = (key: string) => MONTHS_FULL[Number(key.slice(5, 7)) - 1].toLowerCase();
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
        <MonthPicker value={month} onChange={setMonth} marked={marked} disabled={allMonths} className="-ml-2" />
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

      {cycle ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-cash-cycle>
          <TotalCard
            label={`Entradas de ${name(month)}`}
            value={formatMoney(income)}
            tone="success"
            sub={`recebido ${formatMoney(incomePaid)}${income - incomePaid > 0.004 ? ` · falta ${formatMoney(income - incomePaid)}` : ''}`}
          />
          <TotalCard
            label={`Contas de ${name(month)}`}
            value={formatMoney(expense)}
            tone="danger"
            sub={`pago ${formatMoney(expensePaid)}${expense - expensePaid > 0.004 ? ` · falta ${formatMoney(expense - expensePaid)}` : ''}`}
          />
          <TotalCard
            label={`Sobra de ${name(month)}`}
            value={formatMoney(leftover)}
            tone={leftover < 0 ? 'danger' : 'neutral'}
            sub={leftover < 0 ? `as entradas de ${name(month)} não cobrem as contas` : `entradas − contas de ${name(month)}`}
          />
          <TotalCard label="Lançamentos" value={String(rows.length)} sub={monthLabel(month)} />
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TotalCard label="Receitas vencidas" value={formatMoney(income)} tone="success" sub="a receber, de todos os meses" />
          <TotalCard label="Despesas vencidas" value={formatMoney(expense)} tone="danger" sub="a pagar, de todos os meses" />
          <TotalCard
            label="Saldo"
            value={formatMoney(Math.round((income - expense) * 100) / 100)}
            tone={income - expense < 0 ? 'danger' : 'neutral'}
            sub="receitas − despesas"
          />
          <TotalCard label="Lançamentos" value={String(rows.length)} sub="vencidos de todos os meses" />
        </div>
      )}

      {cycle ? (
        <div className="mt-6 space-y-8">
          {(kind === 'todos' || kind === 'receita') && (
            <section aria-labelledby="lanc-entradas" data-cycle-section="entradas">
              <h3 id="lanc-entradas" className="flex flex-wrap items-baseline gap-x-2 text-[14px] font-semibold text-ink">
                Entradas de {name(month)}
                <span className="text-[12.5px] font-normal text-faint">pagam as contas de {name(month)}</span>
              </h3>
              <div className="mt-2">
                <EntryList entries={rows.filter((e) => e.kind === 'receita')} onOpen={onOpen} empty={`Nenhuma entrada em ${name(month)} com esses filtros.`} />
              </div>
            </section>
          )}
          {kind !== 'receita' && (
            <section aria-labelledby="lanc-contas" data-cycle-section="contas">
              <h3 id="lanc-contas" className="flex flex-wrap items-baseline gap-x-2 text-[14px] font-semibold text-ink">
                Contas de {name(month)}
                <span className="text-[12.5px] font-normal text-faint">pagas com as entradas de {name(month)}</span>
              </h3>
              <div className="mt-2">
                <EntryList entries={rows.filter((e) => e.kind !== 'receita')} onOpen={onOpen} empty={`Nenhuma conta em ${name(month)} com esses filtros.`} />
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <EntryList entries={rows} onOpen={onOpen} empty={allMonths ? 'Nenhum lançamento vencido.' : 'Nenhum lançamento neste mês com esses filtros.'} />
        </div>
      )}
    </div>
  );
}

/** Total da lista de lançamentos (cartão compacto). */
function TotalCard({ label, value, sub, tone = 'neutral' }: { label: string; value: string; sub?: string; tone?: 'neutral' | 'success' | 'danger' }) {
  return (
    <div className="metric-tile py-3">
      <div className="text-[12.5px] font-medium text-muted">{label}</div>
      <div className={cn('mt-1 text-[19px] font-semibold tabular', tone === 'success' ? 'text-success-fg' : tone === 'danger' ? 'text-danger-fg' : 'text-ink')}>{value}</div>
      {sub && <div className="text-[12px] text-muted">{sub}</div>}
    </div>
  );
}
