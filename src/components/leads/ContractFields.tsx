import { planSummary } from '../../lib/paymentPlan';
import { formatMoney } from '../../lib/utils';
import { Checkbox, Field, Select } from '../ui';
import { MoneyInput } from '../finance/MoneyInput';
import { PastPaidOption } from '../finance/PastPaidOption';
import { PaymentPlanEditor } from '../finance/PaymentPlanEditor';
import type { Contract } from './useContract';

/**
 * Campos do contrato: valor fechado, conta que recebe, parcelas e lançamento no Financeiro.
 * `showLaunch={false}`: quem usa lança sempre (ex.: Novo projeto), sem a opção.
 */
export function ContractFields({ c, autoFocus = false, showLaunch = true }: { c: Contract; autoFocus?: boolean; showLaunch?: boolean }) {
  const proposal = c.lead?.proposal_value ?? null;
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Valor fechado"
          required
          hint={proposal && proposal !== c.total ? `Proposta: ${formatMoney(proposal)}` : 'Valor total do contrato.'}
        >
          <MoneyInput value={c.total} onChange={c.setTotal} aria-label="Valor fechado" autoFocus={autoFocus} />
        </Field>
        {c.finance && c.accounts.length > 0 && (
          <Field label="Conta que recebe">
            <Select value={c.account} onChange={(e) => c.setAccount(e.target.value)} aria-label="Conta que recebe">
              <option value="">Sem conta definida</option>
              {c.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <div className="mt-4">
        <PaymentPlanEditor total={c.total} value={c.draft} onChange={c.setDraft} />
      </div>

      {showLaunch && (
        <div className="mt-5 rounded-[12px] bg-canvas px-4 py-3">
          {c.received > 0 ? (
            <p className="text-[13px] text-muted">
              {c.received} de {c.launched.length} parcelas já foram recebidas, então as parcelas no Financeiro não são alteradas por aqui: ajuste as
              demais por lá. O contrato é salvo normalmente.
            </p>
          ) : (
            <>
              <Checkbox
                checked={c.launch}
                onChange={c.setLaunch}
                label={
                  c.launched.length > 0
                    ? `Atualizar as ${c.launched.length} parcelas no Financeiro com estes valores e datas`
                    : c.existingPlan
                      ? 'Lançar ou atualizar as parcelas em contas a receber no Financeiro'
                      : 'Lançar as parcelas em contas a receber no Financeiro'
                }
              />
              <p className="mt-1 pl-6 text-[12.5px] text-faint">
                Entram na categoria de honorários, com as datas acima, e ficam ligadas ao cliente e ao projeto. Ao editar depois, as parcelas
                lançadas são substituídas pelas novas, desde que nenhuma tenha sido recebida.
              </p>
            </>
          )}
        </div>
      )}
      {showLaunch && c.launch && c.received === 0 && <PastPaidOption rows={c.draft.rows} checked={c.pastPaid} onChange={c.setPastPaid} />}
      {c.existingPlan && (
        <p className="mt-3 text-[12.5px] text-faint">
          Combinado anteriormente: {formatMoney(c.existingPlan.total)} · {planSummary(c.existingPlan.rows)}.
        </p>
      )}
    </div>
  );
}
