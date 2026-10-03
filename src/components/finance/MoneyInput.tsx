import { Input } from '../ui';

const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Campo de valor em reais: digita-se só números, como em calculadora
 * ("123456" → "1.234,56"). Vazio = null.
 */
export function MoneyInput({
  value,
  onChange,
  invalid,
  allowNegative,
  className,
  autoFocus,
  'aria-label': ariaLabel,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  invalid?: boolean;
  allowNegative?: boolean;
  className?: string;
  autoFocus?: boolean;
  'aria-label'?: string;
}) {
  const negative = allowNegative && value != null && value < 0;
  const text = value == null ? '' : `${negative ? '-' : ''}${fmt.format(Math.abs(value))}`;
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-faint">R$</span>
      <Input
        inputMode="decimal"
        value={text}
        placeholder="0,00"
        invalid={invalid}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        className={`pl-9 text-right tabular ${className ?? ''}`}
        onChange={(e) => {
          const raw = e.target.value;
          const digits = raw.replace(/\D/g, '');
          if (!digits) return onChange(null);
          const neg = allowNegative && raw.trim().startsWith('-');
          const v = Number(digits) / 100;
          onChange(neg ? -v : v);
        }}
      />
    </div>
  );
}
