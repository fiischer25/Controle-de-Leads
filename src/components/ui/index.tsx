import {
  Children,
  forwardRef,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type CSSProperties,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronRight, Clock, Loader2, Pause, Search, X } from 'lucide-react';
import type { Profile, ProjectStatus, TaskStatus } from '../../lib/types';
import {
  avatarTone,
  CSS_COLOR,
  PROJECT_STATUS_STYLE,
  TASK_STATUS_STYLE,
  TONE_BADGE,
  TONE_DOT,
  TONE_OUTLINE,
  type StatusStyle,
  type Tone,
} from '../../lib/status';
import { cn, deadlineState, dueLabel, formatDateShort, initials, matches } from '../../lib/utils';

// ================================================================ Camadas (Esc, foco, rolagem)
// Pilha de camadas abertas (modais, gavetas, menus). Só a do topo reage ao Esc,
// para que fechar um menu dentro de um modal não feche o modal junto.
const layerStack: number[] = [];
let layerSeq = 0;

function useLayer(active: boolean, onEscape: () => void) {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const id = ++layerSeq;
    layerStack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && layerStack[layerStack.length - 1] === id) {
        e.preventDefault();
        ref.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = layerStack.indexOf(id);
      if (i >= 0) layerStack.splice(i, 1);
    };
  }, [active]);
  return useCallback(() => layerStack[layerStack.length - 1], []);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/** Diálogo modal: Esc fecha (só o do topo), foco preso dentro, foco volta ao gatilho e a página não rola. */
function useDialog(containerRef: RefObject<HTMLElement>, onClose: () => void) {
  useLayer(true, onClose);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const raf = requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el || el.contains(document.activeElement)) return; // autoFocus já resolveu
      (el.querySelector<HTMLElement>('[data-autofocus]') ?? el).focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      const el = containerRef.current;
      if (e.key !== 'Tab' || !el) return;
      // Só a camada do topo prende o foco.
      if (layerStack.length && el.dataset.layer !== String(layerStack[layerStack.length - 1])) return;
      const items = focusables(el);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement as HTMLElement | null;
      if (!current || !el.contains(current)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (current === first || current === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    if (containerRef.current) containerRef.current.dataset.layer = String(layerStack[layerStack.length - 1]);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
    };
  }, [containerRef]);
}

// ================================================================ Button
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
type Size = 'xs' | 'sm' | 'md' | 'touch';

const variants: Record<Variant, string> = {
  primary:
    'bg-ink text-surface hover:bg-stone-800 disabled:bg-stone-200 disabled:text-stone-500 data-[loading=true]:bg-stone-800 data-[loading=true]:text-surface',
  dark: 'bg-ink text-surface hover:bg-stone-800 disabled:bg-stone-200 disabled:text-stone-500 data-[loading=true]:bg-stone-800 data-[loading=true]:text-surface',
  secondary:
    'border border-line-strong bg-surface text-ink shadow-xs hover:border-stone-300 hover:bg-canvas disabled:border-line disabled:bg-subtle disabled:text-stone-400 disabled:shadow-none',
  ghost: 'text-stone-800 hover:bg-ink/5 hover:text-ink disabled:text-stone-400 disabled:hover:bg-transparent',
  danger:
    'border border-danger-line bg-surface text-danger-fg hover:border-danger-solid/50 hover:bg-danger-bg disabled:border-line disabled:bg-subtle disabled:text-stone-400',
};
const sizes: Record<Size, string> = {
  xs: 'h-7 gap-1.5 rounded-sm px-2 text-xs',
  sm: 'h-8 gap-1.5 rounded-[9px] px-3 text-sm',
  md: 'h-9 gap-2 rounded-md px-3.5 text-body',
  touch: 'h-11 gap-2 rounded-[12px] px-4 text-[15px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Texto exibido enquanto carrega (ex.: "Salvando…"). Sem ele, mantém o rótulo. */
  loadingText?: ReactNode;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, loadingText, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-colors duration-150 disabled:cursor-not-allowed [&_svg]:shrink-0',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden /> : icon}
      {loading && loadingText ? loadingText : children}
    </button>
  );
});

/** Botão só-ícone: 36×36 (ou 32 no tamanho sm), sempre com aria-label e dica. */
export function IconButton({
  label,
  className,
  children,
  size = 'md',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'xs' | 'sm' | 'md' | 'touch' }) {
  const custom = /(^|\s)(h|w|size)-/.test(className ?? '');
  const dims = { xs: 'h-7 w-7 rounded-sm', sm: 'h-8 w-8 rounded-[9px]', md: 'h-9 w-9 rounded-md', touch: 'h-11 w-11 rounded-[12px]' }[size];
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center text-stone-600 transition-colors hover:bg-ink/5 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:shrink-0',
        custom ? 'rounded-sm' : dims,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Ação em texto bronze com seta (padrão das listas do Início). */
export function ActionLink({
  to,
  onClick,
  children,
  className,
  muted,
}: {
  to?: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  /** Versão discreta (cinza), para links secundários como "Ver todos". */
  muted?: boolean;
}) {
  const cls = cn(
    'inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-xs text-[13px] font-medium transition-colors',
    muted ? 'font-normal text-faint hover:text-ink' : 'text-accent-fg hover:text-brand-900',
    className,
  );
  const inner = (
    <>
      {children}
      {!muted && <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={cls} onClick={(e) => e.stopPropagation()}>
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {inner}
    </button>
  );
}

// ================================================================ Campos
export function Field({
  label,
  required,
  error,
  hint,
  className,
  htmlFor,
  children,
}: {
  label?: ReactNode;
  required?: boolean;
  error?: string | null;
  hint?: ReactNode;
  className?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
          {required && <span className="ml-0.5 text-faint">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-danger-fg" role="alert">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return <input ref={ref} aria-invalid={invalid || undefined} className={cn('input', className)} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, rows = 3, invalid, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} aria-invalid={invalid || undefined} className={cn('input resize-y', className)} {...rest} />;
  },
);

// ---------------------------------------------------------------- Listbox (select customizado)
export interface ListboxOption {
  value: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

interface MenuPosition {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

function computeMenuPosition(trigger: HTMLElement, minWidth = 180): MenuPosition {
  const r = trigger.getBoundingClientRect();
  const width = Math.max(r.width, minWidth);
  const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
  const below = window.innerHeight - r.bottom - 12;
  const above = r.top - 12;
  if (below < 220 && above > below) return { left, width, bottom: window.innerHeight - r.top + 4, maxHeight: Math.min(320, above) };
  return { left, width, top: r.bottom + 4, maxHeight: Math.min(320, below) };
}

/**
 * Select customizado (não usa <select> nativo): gatilho igual ao campo + ChevronDown,
 * menu com radius 12, itens de 32px e Check bronze no selecionado.
 * Teclado: setas, Home/End, Enter/Espaço, Esc e busca pela primeira letra.
 */
export function Listbox({
  value,
  options,
  onChange,
  placeholder = 'Selecione',
  className,
  invalid,
  disabled,
  id,
  name,
  'aria-label': ariaLabel,
  searchable,
  renderValue,
}: {
  value: string;
  options: ListboxOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  'aria-label'?: string;
  /** Campo de busca no menu (padrão: quando há mais de 12 opções). */
  searchable?: boolean;
  renderValue?: (option: ListboxOption | undefined) => ReactNode;
}) {
  const autoId = useId();
  const listId = `${id ?? autoId}-list`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<MenuPosition | null>(null);
  const typeahead = useRef({ text: '', at: 0 });
  const withSearch = searchable ?? options.length > 12;

  const selected = options.find((o) => o.value === value);
  const visible = useMemo(
    () => (withSearch && query ? options.filter((o) => matches(query, o.label)) : options),
    [options, query, withSearch],
  );

  const close = useCallback((focusTrigger = true) => {
    setOpen(false);
    setQuery('');
    if (focusTrigger) triggerRef.current?.focus({ preventScroll: true });
  }, []);
  useLayer(open, () => close());

  const openMenu = () => {
    if (disabled) return;
    const i = Math.max(0, options.findIndex((o) => o.value === value));
    setActive(i);
    if (triggerRef.current) setPos(computeMenuPosition(triggerRef.current));
    setOpen(true);
  };

  // Mantém o menu ancorado ao gatilho ao rolar/redimensionar; fecha ao clicar fora.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => triggerRef.current && setPos(computeMenuPosition(triggerRef.current));
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close(false);
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open, close]);

  useEffect(() => {
    if (open && withSearch) searchRef.current?.focus({ preventScroll: true });
  }, [open, withSearch]);

  useEffect(() => {
    if (open) itemRefs.current[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (opt: ListboxOption | undefined) => {
    if (!opt || opt.disabled) return;
    if (opt.value !== value) onChange(opt.value);
    close();
  };

  const move = (delta: number) => {
    if (visible.length === 0) return;
    let i = active;
    for (let n = 0; n < visible.length; n++) {
      i = (i + delta + visible.length) % visible.length;
      if (!visible[i].disabled) break;
    }
    setActive(i);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'Home':
        e.preventDefault();
        setActive(0);
        break;
      case 'End':
        e.preventDefault();
        setActive(visible.length - 1);
        break;
      case 'Enter':
        e.preventDefault();
        choose(visible[active]);
        break;
      case ' ':
        if (withSearch) return;
        e.preventDefault();
        choose(visible[active]);
        break;
      case 'Tab':
        close(false);
        break;
      default:
        if (!withSearch && e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
          const now = Date.now();
          const t = typeahead.current;
          t.text = now - t.at > 600 ? e.key : t.text + e.key;
          t.at = now;
          const i = visible.findIndex((o) => !o.disabled && matches(t.text, o.label) && o.label.toLowerCase().startsWith(t.text.toLowerCase()));
          if (i >= 0) setActive(i);
        }
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        name={name}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && !withSearch && visible[active] ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        className={cn('input flex items-center gap-2 pr-2 text-left', className)}
      >
        <span className={cn('flex min-w-0 flex-1 items-center gap-2 truncate', !selected && 'text-faint')}>
          {renderValue ? renderValue(selected) : (
            <>
              {selected?.icon}
              <span className="truncate">{selected ? selected.label : placeholder}</span>
            </>
          )}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-faint transition-transform', open && 'rotate-180')} strokeWidth={1.6} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[70] flex flex-col overflow-hidden rounded-[12px] border border-line bg-surface p-1 shadow-md animate-fade-in"
            style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
          >
            {withSearch && (
              <div className="relative mb-1 shrink-0">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onKeyDown}
                  placeholder="Buscar…"
                  aria-controls={listId}
                  aria-activedescendant={visible[active] ? `${listId}-${active}` : undefined}
                  className="h-8 w-full rounded-sm bg-canvas pl-8 pr-2 text-[13.5px] text-ink outline-none placeholder:text-faint focus-visible:shadow-none"
                />
              </div>
            )}
            <div id={listId} role="listbox" aria-label={ariaLabel} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
              {visible.length === 0 && <div className="px-2.5 py-2 text-[13px] text-faint">Nada encontrado.</div>}
              {visible.map((o, i) => (
                <div
                  key={`${o.value}-${i}`}
                  id={`${listId}-${i}`}
                  ref={(el) => (itemRefs.current[i] = el)}
                  role="option"
                  aria-selected={o.value === value}
                  aria-disabled={o.disabled || undefined}
                  onMouseEnter={() => !o.disabled && setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                  className={cn(
                    'flex h-8 cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 text-[13.5px] text-ink',
                    i === active && 'bg-canvas',
                    o.disabled && 'cursor-default text-faint',
                  )}
                >
                  {o.icon}
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.value === value && <Check className="h-4 w-4 shrink-0 text-brand-600" strokeWidth={1.8} />}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

function optionsFromChildren(children: ReactNode, out: ListboxOption[] = []): ListboxOption[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>;
    if (el.type === 'option') {
      const label = textOf(el.props.children);
      out.push({ value: String(el.props.value ?? label), label, disabled: el.props.disabled });
    } else if (el.type === Fragment || el.type === 'optgroup') {
      optionsFromChildren(el.props.children, out);
    }
  });
  return out;
}

/**
 * Compatível com a API de <select> (filhos <option>, onChange com e.target.value),
 * mas renderiza o Listbox customizado do design system.
 */
export function Select({
  value,
  onChange,
  children,
  className,
  invalid,
  disabled,
  id,
  name,
  placeholder,
  'aria-label': ariaLabel,
}: {
  value?: string | number | null;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
  className?: string;
  invalid?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  placeholder?: string;
  'aria-label'?: string;
}) {
  const options = optionsFromChildren(children);
  return (
    <Listbox
      value={String(value ?? '')}
      options={options}
      onChange={(v) => {
        const target = { value: v, name: name ?? '' };
        onChange?.({ target, currentTarget: target } as unknown as ChangeEvent<HTMLSelectElement>);
      }}
      className={className}
      invalid={invalid}
      disabled={disabled}
      id={id}
      name={name}
      placeholder={placeholder}
      aria-label={ariaLabel}
    />
  );
}

export function UserSelect({
  users,
  value,
  onChange,
  placeholder = 'Sem responsável',
  className,
  invalid,
  'aria-label': ariaLabel,
}: {
  users: Profile[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
  'aria-label'?: string;
}) {
  const options: ListboxOption[] = [
    { value: '', label: placeholder, icon: <Avatar user={null} size="xs" /> },
    ...users
      .filter((u) => u.active || u.id === value)
      .map((u) => ({ value: u.id, label: u.job_title ? `${u.name} · ${u.job_title}` : u.name, icon: <Avatar user={u} size="xs" /> })),
  ];
  return (
    <Listbox
      value={value ?? ''}
      options={options}
      onChange={(v) => onChange(v || null)}
      className={className}
      invalid={invalid}
      aria-label={ariaLabel}
    />
  );
}

// ---------------------------------------------------------------- Checkbox / Switch / TaskCheck
export function Checkbox({
  checked,
  onChange,
  label,
  className,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-body text-stone-700', disabled && 'cursor-not-allowed opacity-60', className)}>
      <span className="relative inline-flex h-4 w-4 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer h-4 w-4 cursor-pointer appearance-none rounded-[5px] border border-line-strong bg-surface transition-colors checked:border-ink checked:bg-ink hover:border-stone-500 disabled:cursor-not-allowed"
        />
        <Check className="pointer-events-none absolute inset-0 m-auto h-3 w-3 text-surface opacity-0 peer-checked:opacity-100" strokeWidth={3} />
      </span>
      {label}
    </label>
  );
}

/** Interruptor 32×18: desligado cinza, ligado ink. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2.5 text-body text-stone-700', disabled && 'cursor-not-allowed opacity-60', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative h-[18px] w-8 shrink-0 rounded-full transition-colors duration-150', checked ? 'bg-ink' : 'bg-stone-300')}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full shadow-sm transition-transform duration-150',
            checked ? 'translate-x-3.5 bg-surface' : 'bg-white',
          )}
        />
      </button>
      {label}
    </label>
  );
}

/** Concluir tarefa: círculo de 18px. Aberta, hover (mostra o check), feita e atrasada. */
export function TaskCheck({
  done,
  overdue,
  onToggle,
  className,
}: {
  done: boolean;
  overdue?: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={done ? 'Reabrir tarefa' : 'Concluir tarefa'}
      title={done ? 'Reabrir tarefa' : 'Concluir tarefa'}
      aria-pressed={done}
      className={cn(
        'group/check relative flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors before:absolute before:-inset-2.5 before:content-[""]',
        done
          ? 'border-success-solid bg-success-solid text-surface'
          : cn(overdue ? 'border-danger-solid' : 'border-stone-400', 'text-stone-700 hover:border-stone-700 hover:bg-stone-100'),
        className,
      )}
    >
      <Check
        className={cn('h-[11px] w-[11px]', done ? 'opacity-100' : 'opacity-0 group-hover/check:opacity-100')}
        strokeWidth={3}
      />
    </button>
  );
}

// ================================================================ Camadas visuais
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
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(ref, onClose);
  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-modal', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-overlay/[0.28] backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-lg outline-none animate-slide-up focus-visible:shadow-lg sm:rounded-2xl sm:animate-fade-in',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-1 pt-5 sm:px-7 sm:pt-6">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-h2 text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          <IconButton label="Fechar" onClick={onClose} className="-mr-2 -mt-1">
            <X className="h-[18px] w-[18px]" strokeWidth={1.6} />
          </IconButton>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-5 sm:px-7">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4 sm:px-7">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  onClose,
  children,
  width = 'max-w-drawer',
  label,
}: {
  onClose: () => void;
  children: ReactNode;
  width?: string;
  label?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useDialog(ref, onClose);
  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end bg-overlay/[0.28] backdrop-blur-[2px]">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn('relative flex h-full w-full flex-col bg-surface shadow-lg outline-none animate-slide-in focus-visible:shadow-lg', width)}
      >
        {children}
      </aside>
    </div>,
    document.body,
  );
}

/** Folha inferior (mobile): menus "Criar" e "Mais". */
export function Sheet({ onClose, title, children }: { onClose: () => void; title?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, onClose);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end bg-overlay/[0.28] backdrop-blur-[2px]">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className="pb-safe relative max-h-[88vh] w-full overflow-y-auto rounded-t-2xl bg-surface px-3 pt-2 shadow-lg outline-none animate-slide-up focus-visible:shadow-lg"
      >
        <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-stone-200" aria-hidden />
        {title && <div className="px-3 pb-2 pt-1 font-display text-h3 text-ink">{title}</div>}
        {children}
      </div>
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
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-danger-bg text-danger-fg">
            <AlertTriangle className="h-[18px] w-[18px]" strokeWidth={1.6} />
          </div>
        )}
        <div className="text-body text-muted">{message}</div>
      </div>
    </Modal>
  );
}

/** Popover simples ancorado ao gatilho (menus de usuário, notificações). */
export function Popover({
  trigger,
  children,
  align = 'right',
  side = 'bottom',
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  side?: 'bottom' | 'top';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useLayer(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          className={cn(
            'absolute z-30 min-w-[12rem] rounded-[12px] border border-line bg-surface p-1 shadow-md animate-fade-in',
            side === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2',
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
  active,
  trailing,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-8 w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-[13.5px] transition-colors [&_svg]:shrink-0',
        danger ? 'text-danger-fg hover:bg-danger-bg' : 'text-stone-800 hover:bg-canvas',
        active && 'font-medium text-ink',
      )}
    >
      {icon && <span className={cn(danger ? 'text-danger-fg' : 'text-faint')}>{icon}</span>}
      <span className="min-w-0 flex-1">{children}</span>
      {trailing}
    </button>
  );
}

// ================================================================ Exibição
type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | number;
const AVATAR_DIMS: Record<Exclude<AvatarSize, number>, string> = {
  xs: 'h-5 w-5 text-[8.5px]',
  sm: 'h-6 w-6 text-[9.5px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
};

/** Avatar: fundo claro + texto escuro, tom estável por pessoa. */
export function Avatar({
  user,
  size = 'md',
  className,
  ring,
  me,
}: {
  user: Pick<Profile, 'id' | 'name'> | null | undefined;
  size?: AvatarSize;
  className?: string;
  /** Anel da cor do fundo (para grupos sobrepostos). Ex.: "ring-surface", "ring-canvas". */
  ring?: boolean | string;
  /** "Você": anel duplo bronze. */
  me?: boolean;
}) {
  const numeric = typeof size === 'number';
  const dims = numeric ? '' : AVATAR_DIMS[size];
  const style: CSSProperties = numeric ? { width: size, height: size, fontSize: Math.round(size * 0.4) } : {};
  const ringCls = ring ? cn('ring-2', typeof ring === 'string' ? ring : 'ring-surface') : '';
  if (!user) {
    return (
      <span
        className={cn('inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-stone-300 bg-stone-50 font-semibold text-faint', dims, ringCls, className)}
        style={style}
        title="Sem responsável"
      >
        ?
      </span>
    );
  }
  const tone = avatarTone(user.id);
  return (
    <span
      title={user.name}
      className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold leading-none', dims, ringCls, className)}
      style={{
        ...style,
        backgroundColor: tone.bg,
        color: tone.fg,
        ...(me ? { boxShadow: `0 0 0 2px rgb(var(--surface)), 0 0 0 3.5px ${CSS_COLOR.accent}` } : {}),
      }}
    >
      {initials(user.name)}
    </span>
  );
}

/** Grupo de avatares sobrepostos; o excedente vira "+N". */
export function AvatarStack({
  users,
  max = 4,
  size = 'sm',
  ring = 'ring-surface',
}: {
  users: Array<Pick<Profile, 'id' | 'name'>>;
  max?: number;
  size?: AvatarSize;
  ring?: string;
}) {
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  if (users.length === 0) return <span className="text-xs text-faint">—</span>;
  const px = typeof size === 'number' ? size : { xs: 20, sm: 24, md: 32, lg: 40 }[size];
  return (
    <div className={cn('flex', px <= 22 ? '-space-x-[5px]' : '-space-x-1.5')}>
      {shown.map((u) => (
        <Avatar key={u.id} user={u} size={size} ring={ring} />
      ))}
      {rest > 0 && (
        <span
          className={cn('inline-flex items-center justify-center rounded-full bg-stone-100 font-semibold text-stone-700 ring-2', ring)}
          style={{ width: px, height: px, fontSize: Math.round(px * 0.4) }}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}
export const AvatarGroup = AvatarStack;

/** Ponto de 6px — marcador padrão no lugar de ícones decorativos. */
export function Dot({ className, style, hollow }: { className?: string; style?: CSSProperties; hollow?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', hollow && 'border border-stone-500', className)}
      style={style}
    />
  );
}

/** Selo: h 22, radius 6, 12px/500. Use `tone` (danger/warning/info/success/brand/neutral). */
export function Badge({
  className,
  children,
  dot,
  tone,
  outline,
  title,
}: {
  className?: string;
  children: ReactNode;
  /** true usa o ponto do tom; string é uma classe de cor (ex.: "bg-info-solid"). */
  dot?: boolean | string;
  tone?: Tone;
  outline?: boolean;
  title?: string;
}) {
  const toneCls = tone ? (outline ? TONE_OUTLINE[tone] : TONE_BADGE[tone]) : className ? '' : TONE_BADGE.neutral;
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-xs px-2 text-xs font-medium [&_svg]:h-3 [&_svg]:w-3 [&_svg]:shrink-0',
        toneCls,
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', typeof dot === 'string' ? dot : TONE_DOT[tone ?? 'neutral'])} />}
      {children}
    </span>
  );
}

function StyleBadge({ style, className }: { style: StatusStyle; className?: string }) {
  return (
    <Badge className={cn(style.badge, className)}>
      {style.icon === 'check' ? (
        <Check strokeWidth={2.4} />
      ) : style.icon === 'pause' ? (
        <Pause strokeWidth={2} />
      ) : (
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} />
      )}
      {style.label}
    </Badge>
  );
}

/** Selo de status de tarefa ou projeto, sempre a partir do mapa semântico. */
export function StatusBadge(
  props: { kind: 'task'; value: TaskStatus; className?: string } | { kind: 'project'; value: ProjectStatus; className?: string },
) {
  const style = props.kind === 'task' ? TASK_STATUS_STYLE[props.value] : PROJECT_STATUS_STYLE[props.value];
  return <StyleBadge style={style} className={props.className} />;
}

export function ColorDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', className)} style={{ backgroundColor: color }} />;
}

/**
 * Prazo segundo a regra-mãe: vencido = danger, hoje/janela = warning,
 * fora da janela = só texto neutro com relógio. Sempre texto + ícone, nunca só cor.
 */
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
      : state === 'today'
        ? 'Hoje'
        : formatDateShort(due)
    : state === 'done'
      ? `Entregue · ${formatDateShort(due)}`
      : dueLabel(due);
  if (state === 'ok' || state === 'none') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-xs', state === 'none' ? 'text-faint' : 'text-muted')}>
        <Clock className="h-3 w-3" strokeWidth={1.8} />
        {text}
      </span>
    );
  }
  return (
    <Badge tone={state === 'overdue' ? 'danger' : state === 'done' ? 'success' : 'warning'}>
      {state === 'overdue' ? <AlertTriangle strokeWidth={2} /> : state === 'done' ? <Check strokeWidth={2.4} /> : <Clock strokeWidth={2} />}
      {text}
    </Badge>
  );
}

export function ProgressBar({ value, className, color }: { value: number; className?: string; color?: string }) {
  return (
    <div className={cn('h-1 w-full overflow-hidden rounded-full bg-stone-100', className)}>
      <div
        className="h-full rounded-full bg-ink transition-[width] duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }}
      />
    </div>
  );
}

const EMPTY_TONE: Record<Tone, string> = {
  neutral: 'bg-stone-100 text-stone-600',
  success: 'bg-success-bg text-success-fg',
  danger: 'bg-danger-bg text-danger-fg',
  warning: 'bg-warning-bg text-warning-fg',
  info: 'bg-info-bg text-info-fg',
  brand: 'bg-brand-100 text-brand-700',
};

/** Estado vazio: ícone em quadrado de 40px, título curto e uma ação fantasma opcional. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  tone = 'neutral',
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  tone?: Tone;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {icon && (
        <div className={cn('mb-3 flex h-10 w-10 items-center justify-center rounded-[12px] [&_svg]:h-5 [&_svg]:w-5', EMPTY_TONE[tone])}>
          {icon}
        </div>
      )}
      <p className="font-display text-[15px] font-semibold leading-5 text-ink">{title}</p>
      {description && <p className="mt-1 max-w-[240px] text-[12.5px] leading-[18px] text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/**
 * Cabeçalho de página da "versão limpa": linha de contexto opcional (13px),
 * título grande e uma linha de resumo; ações alinhadas à base.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Linha discreta acima do título (ex.: data, código, "Comercial"). */
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-8 flex flex-col gap-5 pt-2 sm:flex-row sm:items-end sm:justify-between md:mb-12 md:pt-6', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-[13px] text-faint">{eyebrow}</div>}
        <h1 className="font-display text-[30px] font-medium leading-9 tracking-[-0.03em] text-ink md:text-hero">{title}</h1>
        {description && <p className="mt-2 text-[14.5px] leading-[21px] text-muted md:text-body-lg">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Título de seção (Inter Tight 18/600) com um link ou contador à direita. */
export function SectionHeader({ title, aside, id, className }: { title: ReactNode; aside?: ReactNode; id?: string; className?: string }) {
  return (
    <div className={cn('mb-4 flex items-baseline justify-between gap-4', className)}>
      <h2 id={id} className="font-display text-section text-ink">
        {title}
      </h2>
      {aside}
    </div>
  );
}

export interface Metric {
  label: string;
  value: ReactNode;
  /** Classe de cor do número (só quando pede ação). */
  tone?: string;
  to?: string;
  hint?: string;
  /** Linha de apoio abaixo do número (12px, discreta). */
  sub?: ReactNode;
}

/** Números sem caixas: rótulo 12.5 + número 32/36, separados do resto por uma hairline. */
export function MetricRow({ items, className, label }: { items: Metric[]; className?: string; label?: string }) {
  const cols = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4', 5: 'md:grid-cols-3 xl:grid-cols-5', 6: 'md:grid-cols-3 xl:grid-cols-6' }[
    Math.min(6, Math.max(2, items.length)) as 2 | 3 | 4 | 5 | 6
  ];
  return (
    <section aria-label={label ?? 'Números'} className={className}>
      {label && <div className="mb-3 text-[12.5px] text-faint">{label}</div>}
      <div className={cn('grid grid-cols-2 gap-x-8 gap-y-6 border-t border-hairline pt-5', cols)}>
        {items.map((k) => {
          const inner = (
            <>
              <div className="truncate text-[12.5px] text-faint group-hover:text-muted">{k.label}</div>
              <div className={cn('mt-1.5 font-display text-[28px] font-normal leading-[34px] tracking-[-0.025em] tabular md:text-metric', k.tone ?? 'text-ink')}>
                {k.value}
              </div>
              {k.sub && <div className="mt-1 truncate text-xs text-faint">{k.sub}</div>}
            </>
          );
          return k.to ? (
            <Link key={k.label} to={k.to} title={k.hint} className="group min-w-0">
              {inner}
            </Link>
          ) : (
            <div key={k.label} title={k.hint} className="min-w-0">
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Busca discreta (fundo translúcido, sem borda) com botão de limpar. */
export function SearchField({
  value,
  onChange,
  placeholder = 'Buscar…',
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" strokeWidth={1.8} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        className="h-9 w-full rounded-[9px] bg-ink/[0.04] pl-9 pr-8 text-body text-ink outline-none transition-colors placeholder:text-faint hover:bg-ink/[0.06] focus:bg-surface focus:shadow-[0_0_0_1px_rgb(var(--accent)),0_0_0_3px_rgb(var(--accent)/0.22)]"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Limpar busca"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xs p-0.5 text-faint hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Filtro em texto: "Responsável ⌄"; quando ativo mostra o valor escolhido. */
export function FilterPick({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ListboxOption[];
  /** Rótulo da opção "todos" no menu (padrão: "{label}: todos"). */
  allLabel?: string;
}) {
  const all: ListboxOption[] = [{ value: '', label: allLabel ?? `${label}: todos` }, ...options];
  return (
    <div className="shrink-0">
      <Listbox
        value={value}
        onChange={onChange}
        options={all}
        aria-label={label}
        searchable={options.length > 10}
        renderValue={(o) => (value && o ? <span className="truncate font-medium text-ink">{o.label}</span> : <span className="text-muted">{label}</span>)}
        className={cn(
          'h-8 w-auto max-w-[220px] gap-1 rounded-[9px] border-transparent bg-transparent px-2.5 text-[13px] shadow-none hover:bg-ink/5',
          value && 'bg-ink/[0.05]',
        )}
      />
    </div>
  );
}

/** Linha de ferramentas: busca + filtros (rolam no celular) + algo à direita. */
export function Toolbar({ search, filters, aside, className }: { search?: ReactNode; filters?: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3 lg:flex-row lg:items-center', className)}>
      {search && <div className="lg:w-72">{search}</div>}
      {filters && (
        <div className="scrollbar-none -mx-5 flex items-center gap-1 overflow-x-auto px-5 md:mx-0 md:px-0 lg:flex-1">{filters}</div>
      )}
      {!filters && <div className="hidden lg:block lg:flex-1" />}
      {aside && <div className="flex shrink-0 items-center gap-4">{aside}</div>}
    </div>
  );
}

/** "← Projetos": volta discreta para a lista. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1.5 rounded-xs pt-2 text-[13px] text-faint transition-colors hover:text-ink md:pt-6">
      <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.8} />
      {children}
    </Link>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('card', className)}>{children}</div>;
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  /** Ignorado: a versão limpa não usa ícones decorativos em títulos. */
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-6 pb-3 pt-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="min-w-0">
          <h3 className="font-display text-[15px] font-semibold leading-5 tracking-[-0.01em] text-ink">{title}</h3>
          {subtitle && <p className="text-xs text-faint">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/** Abas de texto: ativo em ink com sublinhado; contador opcional ao lado. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  size = 'md',
  bordered = true,
  underline = 2,
}: {
  tabs: Array<{ id: T; label: ReactNode; count?: number }>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
  size?: 'sm' | 'md';
  /** Linha inferior em toda a largura. */
  bordered?: boolean;
  /** Espessura do sublinhado do item ativo (px). */
  underline?: 1 | 2;
}) {
  return (
    <div
      role="tablist"
      className={cn('scrollbar-none flex overflow-x-auto', size === 'sm' ? 'gap-5' : 'gap-[22px]', bordered && 'border-b border-line', className)}
    >
      {tabs.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap transition-colors',
              size === 'sm' ? 'pb-[3px] text-[13px]' : 'py-3 text-[13.5px] sm:text-body',
              bordered && '-mb-px',
              active
                ? cn('font-medium text-ink', underline === 2 ? 'shadow-[inset_0_-2px_0_rgb(var(--ink))]' : 'shadow-[inset_0_-1px_0_rgb(var(--ink))]')
                : 'text-faint hover:text-ink',
            )}
          >
            {t.label}
            {t.count !== undefined && <span className={cn('tabular', active ? 'text-ink' : 'text-faint')}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ id: T; label: ReactNode; icon?: ReactNode }>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" className={cn('inline-flex gap-0.5 rounded-md bg-stone-100 p-[3px]', className)}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[13px] transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5',
            value === o.id ? 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgb(18_17_16/0.08)]' : 'text-muted hover:text-ink',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Linha de lista com os estados do design system: hover (ações aparecem),
 * selecionada (fundo bronze claro + barra à esquerda) e concluída.
 */
export function ListRow({
  children,
  actions,
  selected,
  done,
  onClick,
  className,
}: {
  children: ReactNode;
  actions?: ReactNode;
  selected?: boolean;
  done?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <div
      onClick={onClick}
      data-done={done || undefined}
      className={cn(
        'group/row relative flex items-center gap-3 px-4 py-2.5 transition-colors duration-[120ms]',
        selected ? 'bg-brand-50 shadow-[inset_2px_0_0_rgb(var(--accent))]' : 'hover:bg-subtle',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
      {actions && <div className="flex items-center gap-1 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100">{actions}</div>}
    </div>
  );
}

/** Botão de ação de linha (26×26, branco com borda) — aparece no hover do ListRow. */
export function RowAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border border-line bg-surface text-stone-600 transition-colors hover:text-ink [&_svg]:h-3.5 [&_svg]:w-3.5"
    >
      {children}
    </button>
  );
}

/** Esqueleto de lista (carregando): barras em vez de spinner. */
export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('divide-y divide-hairline-surface', className)} aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-[15px]">
          <span className="h-1.5 w-1.5 rounded-full bg-stone-200" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 rounded-sm" style={{ width: `${55 - ((i * 13) % 25)}%` }} />
            <div className="skeleton h-2.5 rounded-sm bg-stone-50" style={{ width: `${35 - ((i * 7) % 15)}%` }} />
          </div>
          <div className="skeleton h-2.5 w-16 rounded-sm" />
        </div>
      ))}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-faint', className)} />;
}

/** Barra horizontal rotulada, usada nos relatórios. */
export function BarRow({
  label,
  value,
  max,
  color = CSS_COLOR.stone(800),
  suffix,
  onClick,
  title,
  display,
}: {
  label: ReactNode;
  value: number;
  max: number;
  color?: string;
  suffix?: ReactNode;
  onClick?: () => void;
  title?: string;
  /** Texto do valor (padrão: o número). */
  display?: ReactNode;
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
        <span className="truncate text-stone-700 group-hover:text-ink">{label}</span>
        <span className="tabular shrink-0 font-medium text-ink">
          {display ?? value}
          {suffix && <span className="ml-1 font-normal text-muted">{suffix}</span>}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-stone-100">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.max(pct, value > 0 ? 2 : 0)}%`, backgroundColor: color }}
        />
      </div>
    </Tag>
  );
}
