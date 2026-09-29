import { useState } from 'react';
import { KeyRound, Save } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { backend } from '../lib/backend';
import { SWATCHES } from '../lib/constants';
import { cn, maskPhone, toCalendarEmbedUrl } from '../lib/utils';
import { Avatar, Badge, Button, Card, CardHeader, Field, Input, PageHeader, Textarea } from '../components/ui';

export default function ProfilePage() {
  const { me, patch } = useData();
  const toast = useToast();
  const [v, setV] = useState({ name: me.name, phone: me.phone ?? '', job_title: me.job_title ?? '', color: me.color, calendar: me.calendar_embed_url ?? '' });
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [pwdBusy, setPwdBusy] = useState(false);

  const save = async () => {
    if (!v.name.trim()) return toast.error('Informe seu nome.');
    if (v.calendar && !toCalendarEmbedUrl(v.calendar)) return toast.error('Link do Google Agenda não reconhecido.');
    setBusy(true);
    try {
      await patch('profiles', me.id, {
        name: v.name.trim(), phone: v.phone || null, job_title: v.job_title || null, color: v.color, calendar_embed_url: v.calendar.trim() || null,
      });
      toast.success('Perfil atualizado.');
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    if (pwd.next.length < 6) return toast.error('A nova senha deve ter pelo menos 6 caracteres.');
    if (pwd.next !== pwd.confirm) return toast.error('As senhas não conferem.');
    setPwdBusy(true);
    try {
      await backend.changeOwnPassword(pwd.current, pwd.next);
      setPwd({ current: '', next: '', confirm: '' });
      toast.success('Senha alterada.');
    } catch (e) {
      toast.error(e);
    } finally {
      setPwdBusy(false);
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Conta" title="Meu perfil" />
      <div className="grid max-w-5xl gap-5 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="Dados pessoais" />
          <div className="border-t border-stone-100 p-5">
            <div className="mb-5 flex items-center gap-4">
              <Avatar user={{ name: v.name || me.name, color: v.color }} size="lg" />
              <div>
                <div className="font-semibold">{me.email}</div>
                <Badge className={me.role === 'admin' ? 'bg-brand-50 text-brand-800 ring-brand-200' : undefined}>{me.role === 'admin' ? 'Administrador' : 'Membro'}</Badge>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome" className="sm:col-span-2"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
              <Field label="Cargo / função"><Input value={v.job_title} onChange={(e) => setV({ ...v, job_title: e.target.value })} /></Field>
              <Field label="Telefone"><Input value={v.phone} onChange={(e) => setV({ ...v, phone: maskPhone(e.target.value) })} /></Field>
              <Field label="Cor" className="sm:col-span-2">
                <div className="flex flex-wrap gap-1.5">
                  {SWATCHES.map((c) => (
                    <button key={c} onClick={() => setV({ ...v, color: c })} className={cn('h-7 w-7 rounded-full ring-offset-2', v.color === c && 'ring-2 ring-stone-900')} style={{ backgroundColor: c }} aria-label={`Cor ${c}`} />
                  ))}
                </div>
              </Field>
              <Field label="Minha agenda do Google (opcional)" className="sm:col-span-2" hint="Cole o código de incorporação ou o seu e-mail Google para ver sua agenda no painel.">
                <Textarea value={v.calendar} onChange={(e) => setV({ ...v, calendar: e.target.value })} rows={2} placeholder="seuemail@gmail.com ou <iframe ...>" />
              </Field>
            </div>
            <div className="mt-5 flex justify-end"><Button variant="primary" loading={busy} onClick={save} icon={<Save className="h-4 w-4" />}>Salvar</Button></div>
          </div>
        </Card>
        <Card className="h-fit">
          <CardHeader icon={<KeyRound className="h-4 w-4" />} title="Alterar senha" />
          <div className="space-y-3 border-t border-stone-100 p-5">
            <Field label="Senha atual"><Input type="password" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} autoComplete="current-password" /></Field>
            <Field label="Nova senha"><Input type="password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} autoComplete="new-password" /></Field>
            <Field label="Confirmar nova senha"><Input type="password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} autoComplete="new-password" /></Field>
            <Button variant="dark" className="w-full" loading={pwdBusy} onClick={changePassword} disabled={!pwd.current || !pwd.next}>Alterar senha</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
