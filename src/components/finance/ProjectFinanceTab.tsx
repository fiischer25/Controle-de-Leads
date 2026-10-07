import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { projectFinance } from '../../lib/finance';
import type { FinanceEntry, FinanceKind, Project } from '../../lib/types';
import { formatCurrency, formatMinutes, formatMoney, today } from '../../lib/utils';
import { ActionLink, Button, MetricRow, SectionHeader } from '../ui';
import { EntryFormModal } from './EntryFormModal';
import { EntryList } from './EntryList';
import { FeePlanModal } from './FeePlanModal';
import { FixReceiptDates } from './FixReceiptDates';
import { useFinance } from './useFinance';

/** Aba Financeiro do projeto: honorários (parcelas), despesas do projeto e resultado. */
export function ProjectFinanceTab({ project }: { project: Project }) {
  const { db, maps } = useData();
  const fin = useFinance();
  const [editing, setEditing] = useState<{ entry?: FinanceEntry; kind?: FinanceKind } | null>(null);
  const [planning, setPlanning] = useState(false);
  const t = today();

  const f = useMemo(
    () => projectFinance({ projectId: project.id, entries: fin.entries, tasks: db.tasks, timeEntries: db.time_entries, costs: db.finance_member_costs, today: t }),
    [project.id, fin.entries, db.tasks, db.time_entries, db.finance_member_costs, t],
  );
  const byDue = (a: FinanceEntry, b: FinanceEntry) => a.due_date.localeCompare(b.due_date);
  const income = fin.entries.filter((e) => e.project_id === project.id && e.kind === 'receita').sort(byDue);
  const expenses = fin.entries.filter((e) => e.project_id === project.id && e.kind === 'despesa').sort(byDue);
  const honorarios = fin.categories.find((c) => c.kind === 'receita' && c.active && c.name.toLowerCase().startsWith('honorários'));
  const missing = f.missingCost.map((id) => maps.profiles[id]?.name.split(' ')[0]).filter(Boolean);

  return (
    <div className="flex flex-col gap-12">
      <FixReceiptDates projectId={project.id} />
      <MetricRow
        items={[
          { label: 'Honorários', value: formatCurrency(f.contracted), hint: formatMoney(f.contracted), sub: income.length ? `${income.length} ${income.length === 1 ? 'parcela' : 'parcelas'}` : 'nenhuma parcela' },
          { label: 'Recebido', value: formatCurrency(f.received), hint: formatMoney(f.received), sub: f.contracted ? `${Math.round((f.received / f.contracted) * 100)}% do contrato` : undefined },
          { label: 'A receber', value: formatCurrency(f.receivable), hint: formatMoney(f.receivable), tone: f.overdue ? 'text-danger-fg' : undefined, sub: f.overdue ? `${formatMoney(f.overdue)} vencido` : undefined },
          { label: 'Despesas do projeto', value: formatCurrency(f.expenses), hint: formatMoney(f.expenses) },
          { label: 'Custo das horas', value: formatCurrency(f.hoursCost), hint: formatMoney(f.hoursCost), sub: formatMinutes(f.minutes) },
          {
            label: 'Resultado',
            value: formatCurrency(f.result),
            hint: formatMoney(f.result),
            tone: f.result < 0 ? 'text-danger-fg' : undefined,
            sub: f.margin === null ? 'sem honorários' : `margem de ${Math.round(f.margin * 100)}%`,
          },
        ]}
      />
      {missing.length > 0 && (
        <p className="-mt-8 text-[12.5px] text-warning-fg">
          Sem custo/hora cadastrado: {missing.join(', ')}. <ActionLink to="/financeiro?aba=rentabilidade" className="text-[length:inherit]">Cadastrar</ActionLink>
        </p>
      )}

      <section aria-labelledby="honorarios" className="panel">
        <SectionHeader
          id="honorarios"
          title="Honorários"
          aside={
            <span className="flex items-center gap-2">
              <Button variant="ghost" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing({ kind: 'receita' })}>
                Parcela
              </Button>
              <Button variant={income.length ? 'ghost' : 'primary'} size="sm" onClick={() => setPlanning(true)}>
                Plano de honorários
              </Button>
            </span>
          }
        />
        <EntryList
          entries={income}
          onOpen={(entry) => setEditing({ entry })}
          showProject={false}
          empty="Nenhuma parcela lançada. Use o plano de honorários para dividir o contrato (ex.: 30% · 40% · 30%)."
        />
      </section>

      <section aria-labelledby="despesas-projeto" className="panel">
        <SectionHeader
          id="despesas-projeto"
          title="Despesas do projeto"
          aside={
            <Button variant="ghost" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing({ kind: 'despesa' })}>
              Despesa
            </Button>
          }
        />
        <EntryList entries={expenses} onOpen={(entry) => setEditing({ entry })} showProject={false} empty="Plotagens, deslocamentos, terceiros… lance aqui o que for deste projeto." />
      </section>

      {editing && (
        <EntryFormModal
          key={editing.entry?.id ?? editing.kind}
          entry={editing.entry}
          defaults={
            editing.kind
              ? {
                  kind: editing.kind,
                  project_id: project.id,
                  client_id: project.client_id,
                  category_id: editing.kind === 'receita' ? (honorarios?.id ?? null) : null,
                  description: editing.kind === 'receita' ? `Honorários ${project.name}` : '',
                }
              : undefined
          }
          onClose={() => setEditing(null)}
        />
      )}
      {planning && <FeePlanModal project={project} onClose={() => setPlanning(false)} />}
    </div>
  );
}
