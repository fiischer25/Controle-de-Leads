import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlarmClock, Check, CheckCircle2, MoreHorizontal, Phone, Plus } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { openCreate } from '../lib/create';
import { addDays, cn, digitsOnly, formatCurrency, today, weekdayDay } from '../lib/utils';
import { ActionLink, Avatar, AvatarStack, Button, EmptyState, IconButton, Sheet, Tabs } from '../components/ui';
import { MobileTimerBar } from '../components/layout/MobileTimerBar';
import { LeadDrawer } from '../components/leads/LeadDrawer';
import { ContactLogModal } from '../components/leads/ContactLogModal';
import {
  GROUP_LABEL,
  GROUP_ORDER,
  useHomeData,
  type AgendaItem,
  type AttentionCategory,
  type AttentionDot,
  type AttentionGroup,
  type AttentionItem,
  type HomeProject,
} from '../components/dashboard/useHomeData';
import { ProjectDeadline, StageRail } from '../components/projects/StageRail';

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
const WEEK_HOURS = 40;

/** Horas da semana: "12h", "7,5h", "45min". */
function formatHours(minutes: number) {
  if (minutes > 0 && minutes < 60) return `${Math.round(minutes)}min`;
  return `${(Math.round((minutes / 60) * 2) / 2).toLocaleString('pt-BR')}h`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function longDate() {
  const s = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function DashboardPage() {
  const { me, settings, updateTask, updateLead } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const home = useHomeData();
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
    const c = { all: home.items.length, tarefas: 0, comercial: 0, projetos: 0 };
    home.items.forEach((i) => c[i.category]++);
    return c;
  }, [home.items]);
  const visible = filter === 'all' ? home.items : home.items.filter((i) => i.category === filter);
  const overdueCount = home.items.filter((i) => i.group === 'overdue').length;
  const tabs = [
    { id: 'all' as Filter, label: 'Tudo', count: counts.all },
    { id: 'tarefas' as Filter, label: 'Tarefas', count: counts.tarefas },
    { id: 'comercial' as Filter, label: 'Comercial', count: counts.comercial },
    { id: 'projetos' as Filter, label: 'Projetos', count: counts.projetos },
  ];
  const calendarConnected = !!(settings.calendar_embed_url || me.calendar_embed_url);

  return (
    <div className="max-w-[1080px] pt-2 md:pt-6">
      {/* Cabeçalho da página */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] text-faint">{longDate()}</p>
          <h1 className="mt-1.5 font-display text-[30px] font-medium leading-9 tracking-[-0.03em] text-ink md:text-hero">
            {greeting()}, {me.name.split(' ')[0]}.
          </h1>
          <p className="mt-2 text-[14.5px] leading-[21px] text-muted md:text-body-lg">
            {home.items.length === 0 ? (
              'Nada pede sua atenção agora.'
            ) : (
              <>
                {home.items.length} {home.items.length === 1 ? 'item pede' : 'itens pedem'} atenção
                {overdueCount > 0 && (
                  <>
                    , <span className="text-danger-fg">{overdueCount} {overdueCount === 1 ? 'atrasado' : 'atrasados'}</span>
                  </>
                )}
                .
              </>
            )}
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 md:flex">
          <Button variant="ghost" icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => openCreate('task')}>
            Tarefa
          </Button>
          <Button variant="primary" icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => openCreate('lead')}>
            Oportunidade
          </Button>
        </div>
      </div>

      <MobileTimerBar className="mt-5" />

      <div className="mt-8 flex flex-col gap-12 md:mt-14 md:gap-14">
        {/* Linha 1 — fila de atenção + hoje */}
        {/* No celular a ordem é: fila → visão geral → hoje/próximos dias → projetos. */}
        <div className="contents lg:order-1 lg:grid lg:grid-cols-[1fr_300px] lg:gap-16">
          <section aria-labelledby="atencao" className="order-1 lg:order-none">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <h2 id="atencao" className="font-display text-section text-ink">Pede sua atenção</h2>
              <Tabs
                tabs={tabs}
                value={filter}
                onChange={setFilter}
                size="sm"
                underline={1}
                bordered={false}
                className="hidden md:flex"
              />
              <Tabs tabs={tabs} value={filter} onChange={setFilter} underline={1} className="border-hairline md:hidden [&>button]:py-2.5 [&>button]:text-body" />
            </div>
            <AttentionQueue
              items={visible}
              onOpen={openItem}
              onAction={runAction}
              onSnooze={snooze}
              onComplete={complete}
            />
          </section>

          <TodayColumn className="order-3 lg:order-none" todayEvents={home.todayEvents} upcoming={home.upcomingEvents} calendarConnected={calendarConnected} onTask={openTask} onLead={setLeadOpen} />
        </div>

        {/* Linha 2 — visão geral */}
        <Overview className="order-2" kpis={home.kpis} soonDays={home.soonDays} />

        {/* Linha 3 — projetos + funil */}
        <div className="order-4 grid gap-12 lg:grid-cols-[1fr_300px] lg:gap-16">
          <ProjectsSection projects={home.projects} soonDays={home.soonDays} />
          <FunnelSection rows={home.funnel} total={home.funnelTotal} conversion={home.kpis.conversion} />
        </div>

        {/* Linha 4 — equipe */}
        <div className="order-5">
          <TeamSection team={home.team} />
        </div>
      </div>

      {leadOpen && <LeadDrawer leadId={leadOpen} onClose={() => setLeadOpen(null)} />}
      {contactFor && <ContactLogModal leadId={contactFor} onClose={() => setContactFor(null)} />}
    </div>
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
      <div className="rounded-[16px] bg-surface shadow-surface">
        <EmptyState
          tone="success"
          icon={<CheckCircle2 strokeWidth={1.6} />}
          title="Nada atrasado"
          description="Quando uma tarefa ou retorno passar do prazo, ele aparece aqui."
          action={<ActionLink to="/agenda">Ver próximos 7 dias</ActionLink>}
          className="py-14"
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[16px] bg-surface pb-1.5 shadow-surface">
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
            className="block max-w-full truncate rounded-xs text-left text-[15px] font-medium leading-5 text-ink md:text-[14.5px]"
          >
            {item.title}
          </button>
          <div className="mt-0.5 truncate text-[13px] leading-[18px] text-faint md:text-muted">{item.context}</div>
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

// ---------------------------------------------------------------- Hoje / próximos dias
function TodayColumn({
  className,
  todayEvents,
  upcoming,
  calendarConnected,
  onTask,
  onLead,
}: {
  className?: string;
  todayEvents: AgendaItem[];
  upcoming: AgendaItem[];
  calendarConnected: boolean;
  onTask: (id: string) => void;
  onLead: (id: string) => void;
}) {
  const { isAdmin } = useData();
  const navigate = useNavigate();
  const open = (a: AgendaItem) => {
    if (a.taskId) return onTask(a.taskId);
    if (a.leadId) return onLead(a.leadId);
    if (a.href) navigate(a.href);
  };
  return (
    <section aria-labelledby="hoje" className={className}>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 id="hoje" className="font-display text-section text-ink">Hoje</h2>
        <ActionLink to="/agenda" muted>Agenda</ActionLink>
      </div>
      {todayEvents.length === 0 ? (
        <p className="border-t border-hairline py-3 text-[13px] text-faint">Nada na sua agenda hoje.</p>
      ) : (
        <ul>
          {todayEvents.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => open(a)}
                className="grid w-full grid-cols-[44px_minmax(0,1fr)] gap-3 border-t border-hairline py-3 text-left transition-colors hover:bg-ink/[0.025]"
              >
                {a.time ? (
                  <span className={cn('pt-px font-mono text-xs tabular', a.past ? 'text-stone-400' : 'text-ink')}>{a.time}</span>
                ) : (
                  <span className="pt-px text-xs text-warning-fg">hoje</span>
                )}
                <span className="min-w-0">
                  <span className={cn('block truncate text-[13.5px] leading-5', a.past ? 'text-faint' : 'text-ink')}>{a.title}</span>
                  <span className={cn('block truncate text-[12.5px]', a.deadline ? 'text-warning-fg' : 'text-faint')}>{a.context}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="px-0 pb-2 pt-6 text-[12.5px] text-faint">Próximos dias</div>
      {upcoming.length === 0 ? (
        <p className="border-t border-hairline py-3 text-[13px] text-faint">Nada agendado.</p>
      ) : (
        <ul>
          {upcoming.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => open(a)}
                className="grid min-h-14 w-full grid-cols-[44px_minmax(0,1fr)] gap-3 border-t border-hairline py-3 text-left transition-colors hover:bg-ink/[0.025] md:min-h-0"
              >
                <span className="pt-px text-xs text-faint">{weekdayDay(a.date)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] leading-5 text-ink">{a.title}</span>
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    {a.time && <span className="shrink-0 font-mono text-[11.5px] tabular text-muted">{a.time}</span>}
                    <span className={cn('truncate text-[12.5px]', a.deadline ? 'text-warning-fg' : 'text-faint')}>{a.context}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 border-t border-hairline pt-3 text-[13px] text-faint">
        Google Agenda ·{' '}
        {calendarConnected ? (
          <Link to="/agenda" className="font-medium text-accent-fg hover:text-brand-900">Abrir</Link>
        ) : (
          <Link to={isAdmin ? '/configuracoes?aba=agenda' : '/perfil'} className="font-medium text-accent-fg hover:text-brand-900">
            Conectar
          </Link>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Visão geral
function Overview({
  className,
  kpis,
  soonDays,
}: {
  className?: string;
  kpis: ReturnType<typeof useHomeData>['kpis'];
  soonDays: number;
}) {
  const items: Array<{ label: string; mobileLabel?: string; value: ReactNode; tone?: string; to: string; mobile?: number }> = [
    { label: 'Projetos ativos', value: kpis.activeProjects, to: '/projetos', mobile: 3 },
    { label: 'Prazo vencido', value: kpis.overdueProjects, tone: kpis.overdueProjects ? 'text-danger-fg' : undefined, to: '/projetos' },
    { label: `Vencem em ${soonDays} dias`, value: kpis.dueSoon, tone: kpis.dueSoon ? 'text-warning-fg' : undefined, to: '/projetos', mobile: 2 },
    { label: 'Tarefas atrasadas', value: kpis.overdueTasks, tone: kpis.overdueTasks ? 'text-danger-fg' : undefined, to: '/tarefas', mobile: 1 },
    { label: 'Oportunidades abertas', value: kpis.openLeads, to: '/oportunidades' },
    {
      label: 'Conversão · 90 dias',
      mobileLabel: 'Conversão 90d',
      value: kpis.conversion === null ? '—' : `${kpis.conversion}%`,
      to: '/relatorios',
      mobile: 4,
    },
  ];
  return (
    <section aria-label="Visão geral" className={className}>
      <div className="mb-3 text-[12.5px] text-faint">Visão geral</div>
      {/* Desktop: 6 colunas, sem caixas */}
      <div className="hidden grid-cols-3 gap-8 border-t border-hairline pt-5 md:grid xl:grid-cols-6">
        {items.map((k) => (
          <Link key={k.label} to={k.to} className="group min-w-0">
            <div className="truncate text-[12.5px] text-faint group-hover:text-muted">{k.label}</div>
            <div className={cn('mt-1.5 font-display text-metric tabular', k.tone ?? 'text-ink')}>{k.value}</div>
          </Link>
        ))}
      </div>
      {/* Celular: grade 2×2 */}
      <div className="grid grid-cols-2 border-t border-hairline md:hidden">
        {items
          .filter((k) => k.mobile)
          .sort((a, b) => a.mobile! - b.mobile!)
          .map((k, i) => (
            <Link key={k.label} to={k.to} className={cn('min-h-[88px] py-4', i % 2 === 1 && 'pl-5', i > 1 && 'border-t border-hairline')}>
              <div className="text-[12.5px] text-faint">{k.mobileLabel ?? k.label}</div>
              <div className={cn('mt-1 font-display text-[28px] font-normal leading-[34px] tracking-[-0.025em] tabular', k.tone ?? 'text-ink')}>{k.value}</div>
            </Link>
          ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Projetos
function ProjectsSection({ projects, soonDays }: { projects: HomeProject[]; soonDays: number }) {
  const shown = projects.slice(0, 6);
  return (
    <section aria-labelledby="projetos">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 id="projetos" className="font-display text-section text-ink">Projetos</h2>
        <ActionLink to="/projetos" muted>Ver todos</ActionLink>
      </div>
      {shown.length === 0 ? (
        <p className="border-t border-hairline py-4 text-[13px] text-faint">Nenhum projeto ativo.</p>
      ) : (
        <ul>
          {shown.map(({ summary: s, phases, current }) => {
            const phaseLabel = current >= 0 && current < phases.length ? `${phases[current]} · ${current + 1}/${phases.length}` : s.phase;
            return (
              <li key={s.project.id}>
                <Link
                  to={`/projetos/${s.project.id}`}
                  className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 border-t border-hairline py-4 transition-colors hover:bg-ink/[0.025] md:grid-cols-[180px_minmax(0,1fr)_44px_130px_56px] md:gap-x-6"
                >
                  <div className="min-w-0">
                    <div className="truncate font-display text-[14.5px] font-semibold tracking-[0.01em] text-ink">{s.project.name}</div>
                    <div className="truncate text-[12.5px] text-faint">{s.client?.name ?? '—'}</div>
                  </div>
                  <div className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:row-start-auto">
                    <StageRail phases={phases} current={current} />
                    <div className="mt-2 truncate text-[12.5px] text-muted">{phaseLabel}</div>
                  </div>
                  <div className="hidden text-right text-[13px] tabular text-muted md:block">{s.progress}%</div>
                  <div className="col-start-2 row-start-1 text-right md:col-start-auto md:row-start-auto md:text-left">
                    <ProjectDeadline due={s.project.due_date} soonDays={soonDays} />
                  </div>
                  <div className="hidden justify-end md:flex">
                    <AvatarStack users={s.people} max={3} size={22} ring="ring-canvas" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Funil
function FunnelSection({
  rows,
  total,
  conversion,
}: {
  rows: ReturnType<typeof useHomeData>['funnel'];
  total: number;
  conversion: number | null;
}) {
  const count = rows.reduce((acc, r) => acc + r.count, 0);
  return (
    <section aria-labelledby="funil" className="hidden md:block">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 id="funil" className="font-display text-section text-ink">Funil</h2>
        <ActionLink to="/oportunidades" muted>Abrir</ActionLink>
      </div>
      <div className="border-t border-hairline pt-4">
        <div className="font-display text-metric tabular text-ink">{formatCurrency(total)}</div>
        <div className="mt-1 text-[12.5px] text-faint">
          em {count} {count === 1 ? 'oportunidade aberta' : 'oportunidades abertas'}
        </div>
        <div className="mt-4 flex h-1 gap-0.5 overflow-hidden rounded-[2px]" aria-hidden>
          {count === 0 ? (
            <span className="flex-1 bg-line-strong" />
          ) : (
            rows.filter((r) => r.count > 0).map((r) => <span key={r.stage.id} style={{ flex: r.count, backgroundColor: r.color }} />)
          )}
        </div>
        <ul className="mt-4 space-y-2.5">
          {rows.map((r) => (
            <li key={r.stage.id} className="grid grid-cols-[minmax(0,1fr)_24px_auto] items-baseline gap-3">
              <span className="flex min-w-0 items-center gap-2 text-[13px] text-stone-700">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} aria-hidden />
                <span className="truncate">{r.stage.name}</span>
              </span>
              <span className="text-right text-[13px] tabular text-ink">{r.count}</span>
              <span className="text-right text-[12.5px] tabular text-faint">{r.value ? formatCurrency(r.value) : r.count ? 'sem proposta' : '—'}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-hairline pt-3 text-[12.5px] text-faint">
          90 dias · {conversion === null ? 'sem fechamentos' : `${conversion}% de conversão`}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Equipe
function TeamSection({ team }: { team: ReturnType<typeof useHomeData>['team'] }) {
  if (team.length === 0) return null;
  return (
    <section aria-labelledby="equipe" className="hidden md:block">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 id="equipe" className="font-display text-section text-ink">Equipe esta semana</h2>
        <span className="text-[13px] text-faint">de {WEEK_HOURS}h</span>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-8 border-t border-hairline pt-5 xl:grid-cols-4">
        {team.map((m) => (
          <Link key={m.user.id} to={`/equipe?membro=${m.user.id}`} className="group min-w-0">
            <div className="flex items-center gap-2.5">
              <Avatar user={m.user} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink group-hover:underline group-hover:decoration-stone-300 group-hover:underline-offset-4">
                {m.user.name}
              </span>
              <span className="shrink-0 text-[13px] tabular text-muted">{formatHours(m.minutes)}</span>
            </div>
            <div className="mt-3 h-0.5 overflow-hidden rounded-full bg-hairline">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, (m.minutes / 60 / WEEK_HOURS) * 100)}%` }} />
            </div>
            <div className="mt-2 text-xs text-faint">
              {m.open} {m.open === 1 ? 'aberta' : 'abertas'}
              {m.overdue > 0 && (
                <>
                  {' · '}
                  <span className="text-danger-fg">
                    {m.overdue} {m.overdue === 1 ? 'atrasada' : 'atrasadas'}
                  </span>
                </>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
