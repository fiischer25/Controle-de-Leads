import { cn } from '../../lib/utils';

/** Marca AIROS: um "A" em traço, como um corte arquitetônico. */
export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" className={cn('h-9 w-9 shrink-0', className)} aria-hidden="true">
      <rect width="40" height="40" rx="10" fill={light ? '#161412' : '#2a2622'} />
      <path d="M11 29 20 10l9 19" fill="none" stroke="#d5a78f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 23h10" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
