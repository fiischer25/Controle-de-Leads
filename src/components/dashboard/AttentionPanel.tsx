import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlarmClock, Check, CheckCircle2, MoreHorizontal, Phone } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { addDays, cn, digitsOnly, today } from '../../lib/utils';
import { ActionLink, EmptyState, IconButton, Sheet, Tabs } from '../ui';
import { LeadDrawer } from '../leads/LeadDrawer';
import { ContactLogModal } from '../leads/ContactLogModal';
import { GROUP_LABEL, GROUP_ORDER, type AttentionCategory, type AttentionDot, type AttentionGroup, type AttentionItem } from './useHomeData';

type Filter = 'all' | AttentionCategory;

const GROUP_COLOR: Record<AttentionGroup, string> = {
  overdue: 'text-danger-fg',
  today: 'text-warning-fg',
  week: 'text-stone-700',
};
const DOT_COLOR: Record<AttentionDot, string> = {
  danger: 'bg-danger-solid',
  warning: 'bg-warning-solid',
  neutral: 'bg-stone-400',
  brand: 'bg-brand-500',
};
/** Itens por grupo antes do "mostrar mais". */
const GROUP_LIMIT = 5;

/**
 * "Pede sua atenção": fila única com o que está atrasado, vence hoje ou pede ação
 * nesta semana, com filtro por categoria e ação direta em cada linha.
 */
export function AttentionPanel({ items }: { items: AttentionItem[] }) {
  const { updateTask, updateLead, can } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('all');
  const [leadOpen, setLeadOpen] = useState<string | null>(null);
  const [contactFor, setContactFor] = useState<string | null>(null);

  const openTask = (id: string) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.set('tarefa', id);
      return next;
    });

  /** Clique na linha: abre o item (gaveta da tarefa, gaveta do lead ou página do projeto). */
  const openItem = (item: AttentionItem) => {
    if (item.taskId) return openTask(item.taskId);
    if (item.kind === 'deadline' && item.projectId) return navigate(`/projetos/${item.projectId}`);
    if (item.leadId) return setLeadOpen(item.leadId);
    navigate('/oportunidades');
  };

  /** Link de ação: executa a ação direta. */
  const runAction = (item: AttentionItem) => {
    switch (item.kind) {
      case 'followup':
        return item.leadId && setContactFor(item.leadId);
      case 'stale_leads':
        return navigate('/oportunidades');
      default:
        return openItem(item);
    }
  };

  const tomorrow = addDays(today(), 1);
  const snooze = async (item: AttentionItem) => {
    try {
      if (item.taskId) await updateTask(item.taskId, { due_date: tomorrow });
      else if (item.leadId) await updateLead(item.leadId, { next_contact_date: tomorrow });
      toast.success('Adiado para amanhã.');
    } catch (e) {
      toast.error(e);
    }
  };
  const complete = async (item: AttentionItem) => {
    if (item.kind === 'followup' && item.leadId) return setContactFor(item.leadId);
    if (!item.taskId) return;
    try {
      await updateTask(item.taskId, { status: 'done' });
      toast.success('Tarefa concluída.');
    } catch (e) {
      toast.error(e);
    }
  };

  const counts = useMemo(() => {
    const c = { all: items.length, tarefas: 0, comercial: 0, projetos: 0 };
    items.forEach((i) => c[i.category]++);
    return c;
  }, [items]);
  const visible = filter === 'all' ? items : items.filter((i) => i.category === filter);
  const tabs = [
    { id: 'all' as Filter, label: 'Tudo', count: counts.all },
    { id: 'tarefas' as Filter, label: 'Tarefas', count: counts.tarefas },
    ...(can('comercial') ? [{ id: 'comercial' as Filter, label: 'Comercial', count: counts.comercial }] : []),
    ...(can('projetos') ? [{ id: 'projetos' as Filter, label: 'Projetos', count: counts.projetos }] : []),
  ];

  return (
    <section aria-label="Pede sua atenção">
      <Tabs tabs={tabs} value={filter} onChange={setFilter} size="sm" underline={1} bordered={false} className="mb-4" />
      <AttentionQueue items={visible} onOpen={openItem} onAction={runAction} onSnooze={snooze} onComplete={complete} />
      {leadOpen && <LeadDrawer leadId={leadOpen} onClose={() => setLeadOpen(null)} />}
      {contactFor && <ContactLogModal leadId={contactFor} onClose={() => setContactFor(null)} />}
    </section>
  );
}

// ---------------------------------------------------------------- Fila de atenção
function AttentionQueue({
  items,
  onOpen,
  onAction,
  onSnooze,
  onComplete,
}: {
  items: AttentionItem[];
  onOpen: (i: AttentionItem) => void;
  onAction: (i: AttentionItem) => void;
  onSnooze: (i: AttentionItem) => void;
  onComplete: (i: AttentionItem) => void;
}) {
  const [expanded, setExpanded] = useState<Partial<Record<AttentionGroup, boolean>>>({});
  const [swiped, setSwiped] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<AttentionItem | null>(null);

  if (items.length === 0) {
    return (
      <div className="rounded-[16px] border border-line bg-surface shadow-card">
        <EmptyState
          tone="success"
          icon={<CheckCircle2 strokeWidth={1.6} />}
          title="Nada atrasado"
          description="Quando uma tarefa ou retorno passar do prazo, ele aparece aqui."
          action={<ActionLink to="/?aba=agenda">Ver a agenda</ActionLink>}
          className="py-14"
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[16px] border border-line bg-surface pb-1.5 shadow-card">
      {GROUP_ORDER.map((group) => {
        const list = items.filter((i) => i.group === group);
        if (list.length === 0) return null;
        const shown = expanded[group] ? list : list.slice(0, GROUP_LIMIT);
        return (
          <div key={group} role="group" aria-label={GROUP_LABEL[group]}>
            <div className={cn('px-[18px] pb-2 pt-[18px] text-[12.5px] font-medium md:px-6', GROUP_COLOR[group])}>
              {GROUP_LABEL[group]} <span className="ml-1 font-normal text-faint">{list.length}</span>
            </div>
            {shown.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                swiped={swiped === item.id}
                onSwipe={(open) => setSwiped(open ? item.id : null)}
                onOpen={() => onOpen(item)}
                onAction={() => onAction(item)}
                onSnooze={() => onSnooze(item)}
                onComplete={() => onComplete(item)}
                onMenu={() => setMenuFor(item)}
              />
            ))}
            {list.length > GROUP_LIMIT && (
              <button
                type="button"
                onClick={() => setExpanded((e) => ({ ...e, [group]: !e[group] }))}
                className="w-full border-t border-hairline-surface px-[18px] py-2.5 text-left text-[13px] text-faint transition-colors hover:bg-subtle hover:text-ink md:px-6"
              >
                {expanded[group] ? 'Mostrar menos' : `Mostrar mais ${list.length - GROUP_LIMIT}`}
              </button>
            )}
          </div>
        );
      })}
      {menuFor && (
        <Sheet title={menuFor.title} onClose={() => setMenuFor(null)}>
          <RowMenu
            item={menuFor}
            close={() => setMenuFor(null)}
            onOpen={onOpen}
            onAction={onAction}
            onSnooze={onSnooze}
            onComplete={onComplete}
          />
        </Sheet>
      )}
    </div>
  );
}

const canSwipe = (item: AttentionItem) => item.kind === 'task' || item.kind === 'followup';
const SWIPE_WIDTH = 144; // duas ações de 72px

/** Linha da fila. No celular: arrastar para a esquerda revela "Adiar" e "Concluir". */
function QueueRow({
  item,
  swiped,
  onSwipe,
  onOpen,
  onAction,
  onSnooze,
  onComplete,
  onMenu,
}: {
  item: AttentionItem;
  swiped: boolean;
  onSwipe: (open: boolean) => void;
  onOpen: () => void;
  onAction: () => void;
  onSnooze: () => void;
  onComplete: () => void;
  onMenu: () => void;
}) {
  const drag = useRef<{ x: number; y: number; dx: number; active: boolean } | null>(null);
  const dragged = useRef(false);
  const [offset, setOffset] = useState<number | null>(null);
  const swipeable = canSwipe(item);
  const x = offset ?? (swiped ? -SWIPE_WIDTH : 0);
  const callNow = item.kind === 'followup' && item.group === 'today' && item.phone;

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!swipeable || e.pointerType !== 'touch') return;
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, active: false };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null; // rolagem vertical
        return;
      }
      if (Math.abs(dx) < 8) return;
      d.active = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    d.dx = dx;
    const base = swiped ? -SWIPE_WIDTH : 0;
    setOffset(Math.max(-SWIPE_WIDTH - 24, Math.min(0, base + dx)));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    const final = (swiped ? -SWIPE_WIDTH : 0) + d.dx;
    onSwipe(final < -SWIPE_WIDTH / 2);
    setOffset(null);
    // Evita que o "click" do fim do gesto abra o item.
    dragged.current = true;
    setTimeout(() => (dragged.current = false), 80);
  };

  const click = () => {
    if (dragged.current) return;
    if (swiped) return onSwipe(false);
    onOpen();
  };

  return (
    <div className="relative overflow-hidden border-t border-hairline-surface">
      {swipeable && (
        <div className="absolute inset-y-0 right-0 flex md:hidden" aria-hidden={!swiped}>
          <button
            type="button"
            tabIndex={swiped ? 0 : -1}
            onClick={() => {
              onSwipe(false);
              onSnooze();
            }}
            className="flex w-[72px] flex-col items-center justify-center gap-1 bg-stone-100 text-[11px] font-medium text-stone-800"
          >
            <AlarmClock className="h-[18px] w-[18px]" strokeWidth={1.6} />
            Adiar
          </button>
          <button
            type="button"
            tabIndex={swiped ? 0 : -1}
            onClick={() => {
              onSwipe(false);
              onComplete();
            }}
            className="flex w-[72px] flex-col items-center justify-center gap-1 bg-ink text-[11px] font-medium text-surface"
          >
            <Check className="h-[18px] w-[18px]" strokeWidth={1.8} />
            Concluir
          </button>
        </div>
      )}
      <div
        data-attention-item={item.kind}
        data-category={item.category}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={click}
        style={{ transform: x ? `translateX(${x}px)` : undefined, touchAction: swipeable ? 'pan-y' : undefined }}
        className={cn(
          'relative grid min-h-16 cursor-pointer grid-cols-[6px_minmax(0,1fr)_auto] items-center gap-x-3.5 bg-surface py-2.5 pl-[18px] pr-2 transition-[background-color] duration-[120ms] hover:bg-subtle md:min-h-0 md:grid-cols-[6px_minmax(0,1fr)_auto_128px] md:gap-x-4 md:px-6 md:py-[13px]',
          offset === null && 'transition-transform duration-200',
        )}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', DOT_COLOR[item.dot])} aria-hidden />
        <div className="min-w-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              click();
            }}
            className="line-clamp-2 block max-w-full rounded-xs text-left text-[15px] font-medium leading-5 text-ink md:truncate md:text-[14.5px]"
          >
            {item.title}
          </button>
          <div className="mt-0.5 line-clamp-2 text-[13px] leading-[18px] text-faint md:text-muted">{item.context}</div>
        </div>
        <div className="flex items-center gap-0.5">
          <span className={cn('whitespace-nowrap pr-1 text-[13px] md:pr-0', GROUP_COLOR[item.group])}>{item.meta}</span>
          {callNow && (
            <a
              href={`tel:${digitsOnly(item.phone!)}`}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Ligar para ${item.title}`}
              className="flex h-11 w-11 items-center justify-center rounded-[12px] text-stone-700 hover:bg-ink/5 md:hidden"
            >
              <Phone className="h-[18px] w-[18px]" strokeWidth={1.6} />
            </a>
          )}
          <IconButton
            label="Mais ações"
            className="h-11 w-10 rounded-[12px] md:hidden"
            onClick={(e) => {
              e.stopPropagation();
              onMenu();
            }}
          >
            <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.6} />
          </IconButton>
        </div>
        <div className="hidden justify-end md:flex">
          <ActionLink onClick={onAction}>{item.action}</ActionLink>
        </div>
      </div>
    </div>
  );
}

/** Alternativa acessível ao gesto de arrastar: as mesmas ações em uma folha. */
function RowMenu({
  item,
  close,
  onOpen,
  onAction,
  onSnooze,
  onComplete,
}: {
  item: AttentionItem;
  close: () => void;
  onOpen: (i: AttentionItem) => void;
  onAction: (i: AttentionItem) => void;
  onSnooze: (i: AttentionItem) => void;
  onComplete: (i: AttentionItem) => void;
}) {
  const run = (fn: (i: AttentionItem) => void) => () => {
    close();
    fn(item);
  };
  const row = 'flex h-12 w-full items-center gap-3.5 rounded-[12px] px-3 text-left text-[15px] text-ink hover:bg-canvas [&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-muted';
  return (
    <div className="pb-2">
      <p className="px-3 pb-2 text-[13px] text-faint">{item.context}</p>
      <button type="button" className={row} onClick={run(onAction)}>
        <Check strokeWidth={1.6} className="opacity-0" />
        {item.action}
      </button>
      {canSwipe(item) && (
        <>
          <button type="button" className={row} onClick={run(onSnooze)}>
            <AlarmClock strokeWidth={1.6} />
            Adiar para amanhã
          </button>
          <button type="button" className={row} onClick={run(onComplete)}>
            <Check strokeWidth={1.6} />
            {item.kind === 'task' ? 'Concluir tarefa' : 'Concluir retorno'}
          </button>
        </>
      )}
      {item.kind !== 'stale_leads' && item.action !== 'Abrir tarefa' && (
        <button type="button" className={row} onClick={run(onOpen)}>
          <MoreHorizontal strokeWidth={1.6} />
          Abrir
        </button>
      )}
    </div>
  );
}

