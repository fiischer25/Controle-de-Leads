import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { useData } from '../context/DataContext';
import { budgetTotals, itemUnitCost, salePrice } from '../lib/obras';
import { addDays, formatDate, formatMoney, formatNumber, today } from '../lib/utils';
import { Button, Checkbox } from '../components/ui';

/** Proposta do orçamento em A4, para imprimir ou "Salvar como PDF" e mandar ao cliente. */
export default function BudgetPrintPage() {
  const { id } = useParams();
  const { db, me, settings } = useData();
  const budget = db.budgets.find((b) => b.id === id);
  const [detailed, setDetailed] = useState(true);
  const [split, setSplit] = useState(false);

  // A proposta é sempre clara (impressão), mesmo com o tema escuro ligado
  useEffect(() => {
    const html = document.documentElement;
    const wasDark = html.classList.contains('dark');
    html.classList.remove('dark');
    const previousTitle = document.title;
    if (budget) document.title = `Proposta ${budget.code} ${budget.name} · ${settings.office_name}`;
    return () => {
      if (wasDark) html.classList.add('dark');
      document.title = previousTitle;
    };
  }, [budget, settings.office_name]);

  if (!budget) {
    return (
      <div className="p-10 text-center text-muted">
        Orçamento não encontrado. <Link to="/orcamentos" className="underline">Voltar</Link>
      </div>
    );
  }

  const t = budgetTotals(budget.data, budget.area_m2);
  const date = budget.sent_at?.slice(0, 10) ?? today();
  const k = 1 + t.bdi / 100;

  return (
    <div className="min-h-screen bg-canvas print:bg-white">
      <style>{'@page { size: A4; margin: 14mm 12mm; } @media print { body { background: #fff; } }'}</style>
      <div className="sticky top-0 z-10 border-b border-line bg-canvas/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[860px] flex-wrap items-center gap-3 px-5 py-3">
          <Link to={`/orcamentos/${budget.id}`} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" /> Orçamento
          </Link>
          <div className="flex-1" />
          <Checkbox checked={detailed} onChange={setDetailed} label={<span className="text-[13px]">Itens de cada parte</span>} />
          <Checkbox checked={split} onChange={setSplit} label={<span className="text-[13px]">Separar material e mão de obra</span>} />
          <Button variant="primary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
            Imprimir / salvar PDF
          </Button>
        </div>
      </div>

      <article className="mx-auto my-4 max-w-[860px] bg-white px-4 py-6 text-[12px] leading-[1.45] text-stone-900 shadow-surface sm:my-8 sm:px-10 sm:py-10 print:my-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-stone-300 pb-5">
          <div>
            {settings.logo_url ? (
              <img src={settings.logo_url} alt={settings.office_name} className="mb-2 h-10 w-auto object-contain" />
            ) : (
              <div className="mb-1 text-[14px] font-semibold tracking-[0.12em]">{settings.office_name.toUpperCase()}</div>
            )}
            <h1 className="font-display text-[24px] font-semibold leading-tight">Proposta de orçamento</h1>
            <div className="text-[14px] text-stone-600">
              {budget.name} · {budget.code}
            </div>
          </div>
          <div className="text-right text-[11px] text-stone-500">
            {formatDate(date)}
            {budget.data.validity_days > 0 && (
              <>
                <br />
                Válida até {formatDate(addDays(date, budget.data.validity_days))}
              </>
            )}
            <br />
            {me.name}
          </div>
        </header>

        <section className="mt-5 grid gap-x-8 gap-y-1.5 sm:grid-cols-2 print:grid-cols-2">
          <Fact label="Cliente" value={budget.client_name} />
          <Fact label="Contato" value={[budget.client_phone, budget.client_email].filter(Boolean).join(' · ')} />
          <Fact label="Local da obra" value={[budget.address, budget.city].filter(Boolean).join(' · ')} />
          <Fact label="Área" value={budget.area_m2 ? `${formatNumber(budget.area_m2)} m²` : null} />
          <Fact label="Prazo estimado" value={t.days ? `${t.days} dias úteis` : null} />
        </section>

        <section className="mt-7">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-stone-400 text-left text-[10.5px] uppercase tracking-[0.06em] text-stone-500">
                <th className="py-1.5 font-medium">Descrição</th>
                {detailed && <th className="w-12 py-1.5 text-center font-medium">Un.</th>}
                {detailed && <th className="w-14 py-1.5 text-right font-medium">Qtd.</th>}
                {detailed && split && <th className="w-24 py-1.5 text-right font-medium">Material</th>}
                {detailed && split && <th className="w-24 py-1.5 text-right font-medium">Mão de obra</th>}
                {detailed && !split && <th className="w-24 py-1.5 text-right font-medium">Unitário</th>}
                <th className="w-28 py-1.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            {budget.data.sections.map((s, i) => {
              const st = t.sections[i];
              const items = s.items.filter((x) => x.description.trim());
              return (
                <tbody key={s.id} className="break-inside-avoid">
                  <tr className="border-b border-stone-200 bg-stone-50">
                    <td className="py-2 pl-1 font-semibold" colSpan={detailed ? (split ? 5 : 4) : 1}>
                      {i + 1}. {s.name}
                      {s.days ? <span className="ml-2 font-normal text-stone-500">· {s.days} dias úteis</span> : null}
                    </td>
                    <td className="py-2 pr-1 text-right font-semibold tabular">{formatMoney(st.price)}</td>
                  </tr>
                  {detailed &&
                    items.map((x) => (
                      <tr key={x.id} className="border-b border-stone-100 align-top">
                        <td className="py-1.5 pl-4 pr-2">{x.description}</td>
                        <td className="py-1.5 text-center text-stone-600">{x.unit}</td>
                        <td className="py-1.5 text-right tabular">{formatNumber(x.qty, 2)}</td>
                        {split ? (
                          <>
                            <td className="py-1.5 text-right tabular">{formatMoney(x.qty * salePrice(x.material, t.bdi))}</td>
                            <td className="py-1.5 text-right tabular">{formatMoney(x.qty * salePrice(x.labor, t.bdi))}</td>
                          </>
                        ) : (
                          <td className="py-1.5 text-right tabular">{formatMoney(salePrice(itemUnitCost(x), t.bdi))}</td>
                        )}
                        <td className="py-1.5 pr-1 text-right tabular">{formatMoney(x.qty * itemUnitCost(x) * k)}</td>
                      </tr>
                    ))}
                </tbody>
              );
            })}
          </table>
          <div className="mt-4 ml-auto w-full max-w-[300px] space-y-1 text-[12.5px]">
            {split && (
              <>
                <Sum label="Material" value={formatMoney(t.material * k)} />
                <Sum label="Mão de obra" value={formatMoney(t.labor * k)} />
              </>
            )}
            {t.discount > 0 && (
              <>
                <Sum label="Subtotal" value={formatMoney(t.subtotal)} />
                <Sum label="Desconto" value={`− ${formatMoney(t.discount)}`} />
              </>
            )}
            <div className="flex items-baseline justify-between border-t border-stone-400 pt-1.5 text-[15px] font-semibold">
              <span>Total</span>
              <span className="tabular">{formatMoney(t.total)}</span>
            </div>
            {t.perM2 != null && <div className="text-right text-[11px] text-stone-500">{formatMoney(t.perM2)} por m²</div>}
          </div>
        </section>

        {(budget.data.payment_terms.trim() || budget.data.notes.trim() || budget.data.exclusions.trim()) && (
          <section className="mt-8 space-y-4 break-inside-avoid">
            {budget.data.payment_terms.trim() && <Block title="Forma de pagamento" text={budget.data.payment_terms} />}
            {budget.data.notes.trim() && <Block title="Escopo e observações" text={budget.data.notes} />}
            {budget.data.exclusions.trim() && <Block title="Não incluso" text={budget.data.exclusions} />}
          </section>
        )}

        <section className="mt-14 grid grid-cols-2 gap-10 break-inside-avoid text-center text-[11px] text-stone-600">
          <div className="border-t border-stone-400 pt-1.5">{settings.office_name}</div>
          <div className="border-t border-stone-400 pt-1.5">{budget.client_name || 'Cliente'} — de acordo</div>
        </section>
      </article>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 text-stone-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Sum({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-stone-600">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

function Block({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-stone-500">{title}</div>
      <p className="whitespace-pre-line">{text}</p>
    </div>
  );
}
