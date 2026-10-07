import { Wallet } from 'lucide-react';
import { Button, SectionHeader } from '../ui';
import { ContractFields } from './ContractFields';
import { FEES_SECTION_ID, type Contract } from './useContract';

/**
 * Honorários do projeto novo (Novo projeto e Virar cliente): valor e parcelas, em geral lidos do
 * contrato. Ao criar o projeto, as parcelas são lançadas automaticamente em contas a receber.
 */
export function FeesSection({
  fees,
  on,
  onToggle,
  error,
  fromContract,
}: {
  fees: Contract;
  on: boolean;
  onToggle: (on: boolean) => void;
  error: string;
  fromContract: boolean;
}) {
  if (!on)
    return (
      <button
        type="button"
        onClick={() => onToggle(true)}
        className="mt-8 flex w-full items-center gap-2 rounded-[10px] border border-dashed border-line-strong px-3 py-3 text-left text-[13px] text-faint hover:border-stone-300 hover:text-muted"
      >
        <Wallet className="h-4 w-4 shrink-0" strokeWidth={1.6} />
        Definir os honorários agora (valor e parcelas)
      </button>
    );
  return (
    <section id={FEES_SECTION_ID} aria-labelledby={`${FEES_SECTION_ID}-titulo`} className="mt-8 border-t border-hairline-surface pt-6">
      <SectionHeader
        id={`${FEES_SECTION_ID}-titulo`}
        title="Honorários"
        aside={
          <Button size="xs" variant="ghost" onClick={() => onToggle(false)}>
            Não lançar agora
          </Button>
        }
      />
      <p className="-mt-2 mb-4 text-[13px] text-muted">
        {fromContract ? 'Lidos do contrato: confira. ' : ''}Ao criar o projeto, as parcelas entram automaticamente nos honorários do projeto, em contas
        a receber no Financeiro.
      </p>
      <ContractFields c={fees} showLaunch={false} />
      {error && <p className="mt-3 text-[13px] text-danger-fg">{error}</p>}
    </section>
  );
}
