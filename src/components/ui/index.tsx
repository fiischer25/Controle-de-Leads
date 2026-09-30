 
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Clock, Loader2, X } from 'lucide-react';
import type { Profile } from '../../lib/types';
import { cn, deadlineState, dueLabel, formatDateShort, initials, type DeadlineState } from '../../lib/utils';

// ---------------------------------------------------------------- Button
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
type Size = 'xs' | 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'bg-ink-900 text-white hover:bg-ink-700',
  dark: 'bg-ink-900 text-white hover:bg-ink-700',
  secondary: 'bg-white text-ink-900 border border-line hover:border-stone-300 hover:bg-stone-50',
  ghost: 'text-stone-500 hover:bg-stone-100/80 hover:text-ink-900',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
};
const sizes: Record<Size, string> = {
  xs: 'h-7 px-2 text-xs gap-1',
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-ink-900 disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- Form fields
export function Field({
  label,
  required,
  error,
  hint,
  className,
  children,
}: {
  label?: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="ml-0.5 text-stone-400">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-stone-500">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return <input ref={ref} className={cn('input', invalid && 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20', className)} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 3, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} className={cn('input resize-y', className)} {...rest} />;
  },
);

export function Select({
  className,
  invalid,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select className={cn('input pr-8', invalid && 'border-rose-400', className)} {...rest}>
      {children}
    </select>
  );
}

export function UserSelect({
  users,
  value,
  onChange,
  placeholder = 'Sem responsável',
  className,
  invalid,
}: {
  users: Profile[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
}) {
  return (
    <Select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={className} invalid={invalid}>
      <option value="">{placeholder}</option>
      {users
        .filter((u) => u.active || u.id === value)
        .map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
            {u.job_title ? ` · ${u.job_title}` : ''}
          </option>
        ))}
    </Select>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-stone-700', className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-stone-300 accent-ink-900"
      />
      {label}
    </label>
  );
}

// ---------------------------------------------------------------- Overlays
function useEscape(onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ref.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function useBodyLock() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEscape(onClose);
  useBodyLock();
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/25 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-pop animate-fade-in sm:rounded-2xl',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-7 pb-2 pt-6">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold tracking-tight text-ink-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p>}
          </div>
          <IconButton label="Fechar" onClick={onClose} className="-mr-2">
            <X className="h-5 w-5" />
          </IconButton>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-7 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-7 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  onClose,
  children,
  width = 'max-w-2xl',
}: {
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  useEscape(onClose);
  useBodyLock();
  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end bg-ink-900/20 backdrop-blur-[2px]">
      <div className="absolute inset-0" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        className={cn('relative flex h-full w-full flex-col bg-white shadow-pop animate-slide-in', width)}
      >
        {children}
      </aside>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={title}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        {danger && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
        )}
        <div className="text-sm text-stone-600">{message}</div>
      </div>
    </Modal>
  );
}

/** Popover simples ancorado ao gatilho. */
export function Popover({
  trigger,
  children,
  align = 'right',
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          className={cn(
            'absolute z-30 mt-2 min-w-[12rem] rounded-xl border border-line bg-white p-1 shadow-pop animate-fade-in',
            align === 'right' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
        danger ? 'text-rose-600 hover:bg-rose-50' : 'text-stone-700 hover:bg-canvas',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- Display
export function Avatar({
  user,
  size = 'md',
  className,
  ring,
}: {
  user: Pick<Profile, 'name' | 'color'> | null | undefined;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  ring?: boolean;
}) {
  const dims = { xs: 'h-5 w-5 text-[9px]', sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-xs', lg: 'h-11 w-11 text-sm' }[size];
  if (!user) {
    return (
      <span
        className={cn('inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-stone-300 bg-stone-50 text-stone-400', dims, className)}
        title="Sem responsável"
      >
        ?
      </span>
    );
  }
  return (
    <span
      title={user.name}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white',
        ring && 'ring-2 ring-white',
        dims,
        className,
      )}
      style={{ backgroundColor: user.color }}
    >
      {initials(user.name)}
    </span>
  );
}

export function AvatarStack({ users, max = 4, size = 'sm' }: { users: Profile[]; max?: number; size?: 'xs' | 'sm' | 'md' }) {
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  if (users.length === 0) return <span className="text-xs text-stone-400">—</span>;
  return (
    <div className="flex -space-x-1.5">
      {shown.map((u) => (
        <Avatar key={u.id} user={u} size={size} ring />
      ))}
      {rest > 0 && (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-stone-200 text-[10px] font-semibold text-stone-600 ring-2 ring-white">
          +{rest}
        </span>
      )}
    </div>
  );
}

export function Badge({ className, children, dot }: { className?: string; children: ReactNode; dot?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium',
        className ?? 'bg-stone-100 text-stone-600',
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />}
      {children}
    </span>
  );
}

export function ColorDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', className)} style={{ backgroundColor: color }} />;
}

const deadlineStyles: Record<DeadlineState, string> = {
  none: 'bg-stone-50 text-stone-500 ring-stone-200',
  ok: 'bg-stone-50 text-stone-600 ring-stone-200',
  soon: 'bg-amber-50 text-amber-800 ring-amber-200',
  today: 'bg-orange-50 text-orange-800 ring-orange-200',
  overdue: 'bg-rose-50 text-rose-700 ring-rose-200',
  done: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

/** Selo de prazo: sempre texto + ícone, nunca só cor. */
export function DueBadge({
  due,
  done,
  soonDays,
  compact,
}: {
  due: string | null;
  done: boolean;
  soonDays: number;
  compact?: boolean;
}) {
  const state = deadlineState(due, done, soonDays);
  if (state === 'none' && compact) return null;
  const text = compact
    ? state === 'overdue'
      ? `Atrasado · ${formatDateShort(due)}`
      : formatDateShort(due)
    : state === 'done'
      ? `Entregue · ${formatDateShort(due)}`
      : dueLabel(due);
  return (
    <Badge className={deadlineStyles[state]}>
      {state === 'overdue' ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
      {text}
    </Badge>
  );
}

export function ProgressBar({ value, className, color }: { value: number; className?: string; color?: string }) {
  return (
    <div className={cn('h-1 w-full overflow-hidden rounded-full bg-stone-100', className)}>
      <div
        className="h-full rounded-full bg-ink-900 transition-[width] duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {icon && <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-canvas text-stone-400">{icon}</div>}
      <p className="font-display text-base font-medium text-ink-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-stone-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="font-display text-[26px] font-semibold tracking-[-0.025em] text-ink-900 sm:text-[30px]">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-stone-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('card', className)}>{children}</div>;
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-6 pb-3 pt-5">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="text-stone-300">{icon}</span>}
        <div className="min-w-0">
          <h3 className="font-display text-[15px] font-semibold tracking-tight text-ink-900">{title}</h3>
          {subtitle && <p className="text-xs text-stone-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<{ id: T; label: ReactNode; count?: number }>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('scrollbar-thin flex gap-5 overflow-x-auto border-b border-line', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            '-mb-px flex items-center gap-2 whitespace-nowrap border-b px-0.5 py-3 text-sm transition-colors',
            value === t.id ? 'border-ink-900 font-medium text-ink-900' : 'border-transparent text-stone-500 hover:text-ink-900',
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={cn('rounded-full px-1.5 text-xs tabular', value === t.id ? 'bg-ink-900 text-white' : 'bg-stone-100 text-stone-500')}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: T; label: ReactNode; icon?: ReactNode }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors',
            value === o.id ? 'bg-canvas text-ink-900' : 'text-stone-500 hover:text-ink-900',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-stone-400', className)} />;
}

/** Barra horizontal rotulada, usada nos gráficos do painel. */
export function BarRow({
  label,
  value,
  max,
  color = '#2e2b28',
  suffix,
  onClick,
  title,
}: {
  label: ReactNode;
  value: number;
  max: number;
  color?: string;
  suffix?: ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title}
      className={cn('group block w-full text-left', onClick && 'cursor-pointer')}
    >
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate text-stone-700 group-hover:text-ink-900">{label}</span>
        <span className="tabular shrink-0 font-medium text-ink-900">
          {value}
          {suffix && <span className="ml-1 font-normal text-stone-500">{suffix}</span>}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
        <div
          className="h-full rounded-full transition-[width] duration-500 group-hover:brightness-110"
          style={{ width: `${Math.max(pct, value > 0 ? 2 : 0)}%`, backgroundColor: color }}
        />
      </div>
    </Tag>
  );
}
