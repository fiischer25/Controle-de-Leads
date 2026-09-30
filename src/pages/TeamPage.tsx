import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Briefcase, Clock, KeyRound, ListChecks, Mail, Pencil, Phone, Plus, ShieldCheck, UserX, UserCheck } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { SWATCHES } from '../lib/constants';
import { isProjectActive, totalMinutes } from '../lib/domain';
import type { Profile, Role } from '../lib/types';
import { cn, formatMinutes, isValidEmail, maskPhone, startOfWeek, today, toDateKey } from '../lib/utils';
import { Avatar, Badge, Button, Card, ConfirmDialog, Field, Input, Modal, PageHeader, Select } from '../components/ui';
import { TaskRow } from '../components/tasks/TaskRow';
import { useOpenTask } from '../components/tasks/useOpenTask';

export default function TeamPage() {
  const { db, isAdmin, me } = useData();
  const [params, setParams] = useSearchParams();
  const openTask = useOpenTask();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [toggling, setToggling] = useState<Profile | null>(null);
  const { updateUser } = useData();
  const toast = useToast();
  const selectedId = params.get('membro');

  const stats = useMemo(() => {
    const t = today();
    const ws = startOfWeek(t);
    const out: Record<string, { open: number; overdue: number; projects: number; week: number; month: number }> = {};
    const monthStart = t.slice(0, 7);
    for (const p of db.profiles) {
      const tasks = db.tasks.filter((x) => x.assignee_id === p.id && x.status !== 'done');
      const entries = db.time_entries.filter((e) => e.user_id === p.id);
      out[p.id] = {
        open: tasks.length,
        overdue: tasks.filter((x) => x.due_date && x.due_date < t).length,
        projects: db.projects.filter((pr) => isProjectActive(pr) && (pr.manager_id === p.id || pr.member_ids.includes(p.id))).length,
        week: totalMinutes(entries.filter((e) => toDateKey(new Date(e.started_at)) >= ws)),
        month: totalMinutes(entries.filter((e) => e.started_at.slice(0, 7) === monthStart)),
      };
    }
    return out;
  }, [db]);

  const members = [...db.profiles].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const selected = selectedId ? db.profiles.find((p) => p.id === selectedId) : null;
  const selectedTasks = selected
    ? db.tasks.filter((x) => x.assignee_id === selected.id && x.status !== 'done').sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
    : [];

  return (
    <div>
      <PageHeader
        eyebrow="Pessoas"
        title="Equipe"
        description={isAdmin ? 'Cadastre membros, defina acessos e acompanhe a carga de trabalho.' : 'Membros do escritório e suas responsabilidades.'}
        actions={isAdmin && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Novo membro</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {members.map((p) => {
          const s = stats[p.id];
          return (
            <div
              key={p.id}
              className={cn('card cursor-pointer p-5 transition-all hover:border-stone-300', !p.active && 'opacity-60', selectedId === p.id && 'ring-2 ring-brand-400/60')}
              onClick={() => setParams(selectedId === p.id ? {} : { membro: p.id }, { replace: true })}
            >
              <div className="flex items-start gap-3">
                <Avatar user={p} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-display text-base font-semibold">{p.name}</h3>
                    {p.id === me.id && <span className="text-xs text-stone-400">(você)</span>}
                  </div>
                  <div className="text-sm text-stone-500">{p.job_title || '—'}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {p.role === 'admin' && <Badge className="bg-brand-50 text-brand-800 ring-brand-200"><ShieldCheck className="h-3 w-3" /> Administrador</Badge>}
                    {!p.active && <Badge className="bg-stone-100 text-stone-600 ring-stone-200">Desativado</Badge>}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex" onClick={(e) => e.stopPropagation()}>
                    <Button size="xs" variant="ghost" onClick={() => setEditing(p)} aria-label="Editar"><Pencil className="h-3.5 w-3.5" /></Button>
                    {p.id !== me.id && (
                      <Button size="xs" variant="ghost" onClick={() => setToggling(p)} aria-label={p.active ? 'Desativar' : 'Reativar'}>
                        {p.active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-3 space-y-1 text-xs text-stone-500">
                <div className="flex items-center gap-2 truncate"><Mail className="h-3.5 w-3.5" />{p.email}</div>
                {p.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" />{p.phone}</div>}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line/70 pt-3 text-center">
                <div>
                  <div className="flex items-center justify-center gap-1 text-[11px] text-stone-500"><ListChecks className="h-3 w-3" />Tarefas</div>
                  <div className="font-display text-lg font-medium tracking-tight tabular">{s?.open ?? 0}</div>
                  {s?.overdue ? <div className="text-[11px] font-medium text-rose-600">{s.overdue} atrasadas</div> : <div className="text-[11px] text-stone-400">em dia</div>}
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 text-[11px] text-stone-500"><Briefcase className="h-3 w-3" />Projetos</div>
                  <div className="font-display text-lg font-medium tracking-tight tabular">{s?.projects ?? 0}</div>
                  <div className="text-[11px] text-stone-400">ativos</div>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 text-[11px] text-stone-500"><Clock className="h-3 w-3" />Semana</div>
                  <div className="font-display text-lg font-medium tracking-tight tabular">{formatMinutes(s?.week ?? 0)}</div>
                  <div className="text-[11px] text-stone-400">{formatMinutes(s?.month ?? 0)} no mês</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <Card className="mt-6 overflow-hidden">
          <div className="flex items-center gap-3 border-b border-line/70 px-5 py-3">
            <Avatar user={selected} size="sm" />
            <h3 className="font-display text-sm font-semibold">Tarefas abertas de {selected.name}</h3>
            <span className="text-xs text-stone-500">{selectedTasks.length}</span>
          </div>
          {selectedTasks.length === 0 ? (
            <p className="px-5 py-6 text-sm text-stone-500">Nenhuma tarefa aberta.</p>
          ) : (
            <div className="divide-y divide-line/70">
              {selectedTasks.map((x) => <TaskRow key={x.id} task={x} onOpen={() => openTask(x.id)} showProject />)}
            </div>
          )}
        </Card>
      )}

      {creating && <MemberModal onClose={() => setCreating(false)} />}
      {editing && <MemberModal member={editing} onClose={() => setEditing(null)} />}
      {toggling && (
        <ConfirmDialog
          title={toggling.active ? 'Desativar membro' : 'Reativar membro'}
          danger={toggling.active}
          confirmLabel={toggling.active ? 'Desativar' : 'Reativar'}
          message={
            toggling.active
              ? <>{toggling.name} não conseguirá mais entrar no sistema. Tarefas e histórico são mantidos.</>
              : <>{toggling.name} voltará a ter acesso ao sistema.</>
          }
          onClose={() => setToggling(null)}
          onConfirm={async () => {
            try {
              await updateUser(toggling.id, { active: !toggling.active });
              toast.success(toggling.active ? 'Membro desativado.' : 'Membro reativado.');
            } catch (e) {
              toast.error(e);
            }
          }}
        />
      )}
    </div>
  );
}

function MemberModal({ member, onClose }: { member?: Profile; onClose: () => void }) {
  const { createUser, updateUser, me, db } = useData();
  const toast = useToast();
  const used = new Set(db.profiles.map((p) => p.color));
  const [v, setV] = useState({
    name: member?.name ?? '',
    email: member?.email ?? '',
    password: '',
    role: member?.role ?? ('member' as Role),
    job_title: member?.job_title ?? '',
    phone: member?.phone ?? '',
    color: member?.color ?? SWATCHES.find((c) => !used.has(c)) ?? SWATCHES[1],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const e: Record<string, string> = {};
    if (!v.name.trim()) e.name = 'Informe o nome';
    if (!isValidEmail(v.email)) e.email = 'E-mail inválido';
    if (!member && v.password.length < 6) e.password = 'Mínimo de 6 caracteres';
    if (member && v.password && v.password.length < 6) e.password = 'Mínimo de 6 caracteres';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (member) {
        await updateUser(
          member.id,
          { name: v.name.trim(), role: member.id === me.id ? member.role : v.role, job_title: v.job_title || null, phone: v.phone || null, color: v.color },
          { email: v.email.trim().toLowerCase(), password: v.password || undefined },
        );
        toast.success('Membro atualizado.');
      } else {
        await createUser({ name: v.name.trim(), email: v.email.trim(), password: v.password, role: v.role, job_title: v.job_title || null, phone: v.phone || null, color: v.color });
        toast.success(`${v.name.split(' ')[0]} foi cadastrado(a). Envie o e-mail e a senha para o primeiro acesso.`);
      }
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={member ? 'Editar membro' : 'Novo membro da equipe'}
      subtitle={member ? undefined : 'O membro entra com este e-mail e senha e pode trocá-la em Meu perfil.'}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} onClick={save}>{member ? 'Salvar' : 'Cadastrar membro'}</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome completo" required error={errors.name} className="sm:col-span-2"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus /></Field>
        <Field label="E-mail de acesso" required error={errors.email}><Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
        <Field label={member ? 'Nova senha (opcional)' : 'Senha inicial'} required={!member} error={errors.password}>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input type="text" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} className="pl-9" placeholder={member ? 'Deixe em branco para manter' : ''} autoComplete="new-password" />
          </div>
        </Field>
        <Field label="Cargo / função"><Input value={v.job_title} onChange={(e) => setV({ ...v, job_title: e.target.value })} placeholder="Ex.: Arquiteta, Estagiário, Comercial" /></Field>
        <Field label="Telefone"><Input value={v.phone} onChange={(e) => setV({ ...v, phone: maskPhone(e.target.value) })} /></Field>
        <Field label="Nível de acesso" hint={member?.id === me.id ? 'Você não pode alterar o próprio nível.' : 'Administradores gerenciam equipe e configurações.'}>
          <Select value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as Role })} disabled={member?.id === me.id}>
            <option value="member">Membro</option>
            <option value="admin">Administrador</option>
          </Select>
        </Field>
        <Field label="Cor de identificação">
          <div className="flex flex-wrap gap-1.5 pt-1">
            {SWATCHES.map((c) => (
              <button key={c} type="button" onClick={() => setV({ ...v, color: c })} className={cn('h-7 w-7 rounded-full ring-offset-2 transition', v.color === c && 'ring-2 ring-stone-900')} style={{ backgroundColor: c }} aria-label={`Cor ${c}`} />
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
