import { useState } from 'react';
import { Save } from 'lucide-react';
import { useTheme, type ThemePref } from '../lib/theme';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { backend } from '../lib/backend';
import { maskPhone, toCalendarEmbedUrl } from '../lib/utils';
import { Avatar, Button, Card, CardHeader, Field, Input, PageHeader, Segmented, Textarea } from '../components/ui';

export default function ProfilePage() {
  const { me, patch } = useData();
  const toast = useToast();
  const [v, setV] = useState({
    name: me.name,
    phone: me.phone ?? '',
    job_title: me.job_title ?? '',
    color: me.color,
    calendar: me.calendar_embed_url ?? '',
  });
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [pwdBusy, setPwdBusy] = useState(false);
  const [theme, setTheme] = useTheme();

  const save = async () => {
    if (!v.name.trim()) return toast.error('Informe seu nome.');
    if (v.calendar && !toCalendarEmbedUrl(v.calendar)) return toast.error('Link do Google Agenda não reconhecido.');
    setBusy(true);
    try {
      await patch('profiles', me.id, {
        name: v.name.trim(),
        phone: v.phone || null,
        job_title: v.job_title || null,
        color: v.color,
        calendar_embed_url: v.calendar.trim() || null,
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
      <PageHeader
        title="Meu perfil"
        description={
          <>
            {me.email} · {me.role === 'admin' ? 'Administrador' : 'Membro'}
          </>
        }
      />
      <div className="grid max-w-5xl gap-5 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="Dados pessoais" />
          <div className="border-t border-line/70 p-5">
            <div className="mb-5 flex items-center gap-4">
              <Avatar user={{ id: me.id, name: v.name || me.name }} size="lg" me />
              <div>
                <div className="text-body font-medium text-ink">{v.name || me.name}</div>
                <div className="text-[12.5px] text-faint">{v.job_title || (me.role === 'admin' ? 'Administrador' : 'Membro')}</div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome" className="sm:col-span-2">
                <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
              </Field>
              <Field label="Cargo / função">
                <Input value={v.job_title} onChange={(e) => setV({ ...v, job_title: e.target.value })} />
              </Field>
              <Field label="Telefone / WhatsApp" hint="Com ele você fala com o assistente pelo WhatsApp.">
                <Input value={v.phone} onChange={(e) => setV({ ...v, phone: maskPhone(e.target.value) })} />
              </Field>
              <Field
                label="Minha agenda do Google (opcional)"
                className="sm:col-span-2"
                hint="Cole o código de incorporação ou o seu e-mail Google para ver sua agenda no painel."
              >
                <Textarea
                  value={v.calendar}
                  onChange={(e) => setV({ ...v, calendar: e.target.value })}
                  rows={2}
                  placeholder="seuemail@gmail.com ou <iframe ...>"
                />
              </Field>
            </div>
            <div className="mt-5 flex justify-end">
              <Button variant="primary" loading={busy} onClick={save} icon={<Save className="h-4 w-4" />}>
                Salvar
              </Button>
            </div>
          </div>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Aparência" subtitle="Vale só para este navegador." />
            <div className="flex items-center justify-between gap-3 border-t border-line/70 p-5">
              <span className="text-body text-stone-700">Tema</span>
              <Segmented<ThemePref>
                value={theme}
                onChange={setTheme}
                options={[
                  { id: 'light', label: 'Claro' },
                  { id: 'dark', label: 'Escuro' },
                  { id: 'system', label: 'Sistema' },
                ]}
              />
            </div>
          </Card>
          <Card className="h-fit">
            <CardHeader title="Alterar senha" />
            <div className="space-y-3 border-t border-line/70 p-5">
              <Field label="Senha atual">
                <Input
                  type="password"
                  value={pwd.current}
                  onChange={(e) => setPwd({ ...pwd, current: e.target.value })}
                  autoComplete="current-password"
                />
              </Field>
              <Field label="Nova senha">
                <Input type="password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} autoComplete="new-password" />
              </Field>
              <Field label="Confirmar nova senha">
                <Input
                  type="password"
                  value={pwd.confirm}
                  onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })}
                  autoComplete="new-password"
                />
              </Field>
              <Button variant="primary" className="w-full" loading={pwdBusy} onClick={changePassword} disabled={!pwd.current || !pwd.next}>
                Alterar senha
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
