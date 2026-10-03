import { useSearchParams } from 'react-router-dom';
import { Square } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../lib/utils';
import { useRunningTimer } from './useRunningTimer';

/** Barra do cronômetro no celular (Início): 44px, contorno 1px, botão parar 36×36. */
export function MobileTimerBar({ className }: { className?: string }) {
  const timer = useRunningTimer();
  const { stopTimer } = useData();
  const toast = useToast();
  const [, setParams] = useSearchParams();
  if (!timer) return null;
  return (
    <div className={cn('flex h-11 items-center gap-2.5 rounded-[12px] bg-surface pl-3 pr-1 shadow-[0_0_0_1px_rgb(var(--line))] md:hidden', className)}>
      <span className="h-[7px] w-[7px] shrink-0 animate-timer-dot rounded-full bg-[#d07a62]" aria-hidden />
      <span className="font-mono text-[13px] tabular text-ink">{timer.elapsed}</span>
      <button
        type="button"
        onClick={() => setParams((p) => { const next = new URLSearchParams(p); next.set('tarefa', timer.entry.task_id); return next; })}
        className="min-w-0 flex-1 truncate text-left text-[13px] text-muted"
      >
        {timer.label}
      </button>
      <button
        type="button"
        onClick={() => stopTimer().then(() => toast.success('Tempo lançado na tarefa.')).catch(toast.error)}
        aria-label="Parar cronômetro"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-stone-100 text-ink"
      >
        <Square className="h-3 w-3 fill-current" strokeWidth={0} />
      </button>
    </div>
  );
}

