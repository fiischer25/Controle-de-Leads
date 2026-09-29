import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Briefcase,
  CalendarDays,
  CheckCheck,
  ChevronDown,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Search,
  Settings,
  Square,
  Timer,
  UserCircle,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { cn, formatClock, formatRelative, today } from '../../lib/utils';
import { Avatar, Badge, IconButton, MenuItem, Popover } from '../ui';
import { TaskDrawer } from '../tasks/TaskDrawer';
import { CommandPalette } from './CommandPalette';
import { Logo } from './Logo';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  badge?: number;
  adminOnly?: boolean;
  end?: boolean;
}

export function AppLayout() {
  const { db, me, isAdmin, settings } = useData();
  const { mode } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const openTaskId = params.get('tarefa');
  const closeTask = () => {
    const next = new URLSearchParams(params);
    next.delete('tarefa');
    setParams(next, { replace: true });
  };

  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const myOverdue = useMemo(() => {
    const t = today();
    return db.tasks.filter((x) => x.assignee_id === me.id && x.status !== 'done' && x.due_date && x.due_date <= t).length;
  }, [db.tasks, me.id]);

  const followUps = useMemo(() => {
    const t = today();
    const openStages = new Set(db.lead_stages.filter((s) => s.kind === 'open').map((s) => s.id));
    return db.leads.filter((l) => openStages.has(l.stage_id) && l.next_contact_date && l.next_contact_date <= t).length;
  }, [db.leads, db.lead_stages]);

  const nav: NavItem[] = [
    { to: '/', label: 'Início', icon: <LayoutDashboard className="h-[18px] w-[18px]" />, end: true },
    { to: '/oportunidades', label: 'Oportunidades', icon: <FolderKanban className="h-[18px] w-[18px]" />, badge: followUps },
    { to: '/clientes', label: 'Clientes', icon: <UsersRound className="h-[18px] w-[18px]" /> },
    { to: '/projetos', label: 'Projetos', icon: <Briefcase className="h-[18px] w-[18px]" /> },
    { to: '/tarefas', label: 'Minhas tarefas', icon: <ListChecks className="h-[18px] w-[18px]" />, badge: myOverdue },
    { to: '/agenda', label: 'Agenda', icon: <CalendarDays className="h-[18px] w-[18px]" /> },
    { to: '/relatorios', label: 'Relatórios', icon: <BarChart3 className="h-[18px] w-[18px]" /> },
    { to: '/equipe', label: 'Equipe', icon: <Users className="h-[18px] w-[18px]" /> },
    { to: '/configuracoes', label: 'Configurações', icon: <Settings className="h-[18px] w-[18px]" />, adminOnly: true },
  ];

  const sidebar = (
    <div className="flex h-full flex-col bg-ink-900 text-stone-300">
      <div className="flex h-16 items-center gap-3 px-5">
        <Logo />
        <div className="min-w-0 leading-tight">
          <div className="font-display text-[15px] font-extrabold tracking-[0.2em] text-white">AIROS</div>
          <div className="truncate text-[11px] uppercase tracking-[0.18em] text-stone-500">Arquitetura</div>
        </div>
      </div>
      <button
        onClick={() => setPaletteOpen(true)}
        className="mx-3 mb-3 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-stone-400 transition-colors hover:bg-white/10"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1">Buscar…</span>
        <kbd className="rounded border border-white/10 px-1.5 text-[10px] text-stone-500">Ctrl K</kbd>
      </button>
      <nav className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto px-3">
        {nav
          .filter((n) => !n.adminOnly || isAdmin)
          .map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-white/10 text-white' : 'text-stone-400 hover:bg-white/5 hover:text-stone-100',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn(isActive ? 'text-brand-300' : 'text-stone-500 group-hover:text-stone-300')}>{n.icon}</span>
                  <span className="flex-1">{n.label}</span>
                  {!!n.badge && (
                    <span className="rounded-full bg-brand-600 px-1.5 py-px text-[11px] font-semibold text-white tabular">{n.badge}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
      </nav>
      <div className="border-t border-white/5 p-3">
        {mode === 'local' && (
          <div className="mb-2 rounded-lg bg-amber-400/10 px-3 py-2 text-[11px] leading-snug text-amber-200/90">
            Modo demonstração — dados salvos apenas neste navegador.
          </div>
        )}
        <div className="px-2 text-[11px] text-stone-500">{settings.office_name}</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-stone-900/50" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-72 animate-slide-in">{sidebar}</div>
          <button
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-stone-200/70 bg-white/80 px-4 backdrop-blur sm:px-6">
          <IconButton label="Abrir menu" className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </IconButton>
          <IconButton label="Buscar" className="lg:hidden" onClick={() => setPaletteOpen(true)}>
            <Search className="h-5 w-5" />
          </IconButton>
          <div className="flex-1" />
          <RunningTimer />
          <NotificationsMenu />
          <UserMenu />
        </header>
        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {openTaskId && <TaskDrawer key={openTaskId} taskId={openTaskId} onClose={closeTask} />}
      <span className="sr-only">{me.name}</span>
    </div>
  );
}

function RunningTimer() {
  const { runningEntry, maps, stopTimer } = useData();
  const navigate = useNavigate();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!runningEntry) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [runningEntry]);
  if (!runningEntry) return null;
  const task = maps.tasks[runningEntry.task_id];
  const seconds = (Date.now() - new Date(runningEntry.started_at).getTime()) / 1000;
  return (
    <div className="flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 py-1 pl-3 pr-1 text-sm">
      <button
        className="flex min-w-0 items-center gap-2 text-brand-800"
        onClick={() => navigate(`/tarefas?tarefa=${runningEntry.task_id}`)}
        title={task?.title}
      >
        <Timer className="h-4 w-4 animate-pulse" />
        <span className="hidden max-w-[180px] truncate md:inline">{task?.title ?? 'Tarefa'}</span>
        <span className="font-semibold tabular">{formatClock(seconds)}</span>
      </button>
      <IconButton label="Parar cronômetro" onClick={() => stopTimer()} className="h-7 w-7 text-brand-700 hover:bg-brand-100">
        <Square className="h-3.5 w-3.5 fill-current" />
      </IconButton>
    </div>
  );
}

function NotificationsMenu() {
  const { db, me, markNotificationsRead } = useData();
  const navigate = useNavigate();
  const mine = useMemo(
    () => db.notifications.filter((n) => n.user_id === me.id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [db.notifications, me.id],
  );
  const unread = mine.filter((n) => !n.read);
  return (
    <Popover
      className="w-[min(92vw,380px)] p-0"
      trigger={({ toggle }) => (
        <button
          onClick={toggle}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900"
          aria-label="Notificações"
        >
          <Bell className="h-5 w-5" />
          {unread.length > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <span className="font-display text-sm font-bold">Notificações</span>
            {unread.length > 0 && (
              <button
                className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                onClick={() => markNotificationsRead(unread.map((n) => n.id))}
              >
                <CheckCheck className="h-3.5 w-3.5" /> Marcar todas como lidas
              </button>
            )}
          </div>
          <div className="scrollbar-thin max-h-[420px] overflow-y-auto p-1">
            {mine.length === 0 && <p className="px-4 py-8 text-center text-sm text-stone-500">Nenhuma notificação por aqui.</p>}
            {mine.slice(0, 40).map((n) => (
              <button
                key={n.id}
                className={cn('flex w-full gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-stone-50', !n.read && 'bg-brand-50/50')}
                onClick={() => {
                  if (!n.read) markNotificationsRead([n.id]);
                  if (n.link) navigate(n.link);
                  close();
                }}
              >
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand-500')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-stone-900">{n.title}</span>
                  {n.body && <span className="block text-xs text-stone-500">{n.body}</span>}
                  <span className="mt-0.5 block text-[11px] text-stone-400">{formatRelative(n.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Popover>
  );
}

function UserMenu() {
  const { me, isAdmin } = useData();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <Popover
      trigger={({ toggle }) => (
        <button onClick={toggle} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-stone-100">
          <Avatar user={me} size="md" />
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-semibold text-stone-900">{me.name.split(' ')[0]}</span>
            <span className="block text-[11px] text-stone-500">{isAdmin ? 'Administrador' : me.job_title || 'Membro'}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-stone-400" />
        </button>
      )}
    >
      {(close) => (
        <div className="w-56">
          <div className="px-3 py-2">
            <div className="truncate text-sm font-semibold">{me.name}</div>
            <div className="truncate text-xs text-stone-500">{me.email}</div>
            {isAdmin && <Badge className="mt-1.5 bg-brand-50 text-brand-800 ring-brand-200">Administrador</Badge>}
          </div>
          <div className="my-1 border-t border-stone-100" />
          <MenuItem icon={<UserCircle className="h-4 w-4" />} onClick={() => { close(); navigate('/perfil'); }}>
            Meu perfil
          </MenuItem>
          {isAdmin && (
            <MenuItem icon={<Settings className="h-4 w-4" />} onClick={() => { close(); navigate('/configuracoes'); }}>
              Configurações
            </MenuItem>
          )}
          <MenuItem icon={<LogOut className="h-4 w-4" />} onClick={() => signOut()} danger>
            Sair
          </MenuItem>
        </div>
      )}
    </Popover>
  );
}
