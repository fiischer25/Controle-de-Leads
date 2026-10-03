import { useState, type FormEvent } from 'react';
import { ArrowRight, Lock, Mail, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button, Checkbox, Field, Input } from '../components/ui';
import { BrandMark } from '../components/layout/Logo';
import { SWATCHES } from '../lib/constants';
import { isValidEmail } from '../lib/utils';

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-surface lg:grid-cols-[1.15fr_1fr]">
      <div className="relative hidden overflow-hidden bg-canvas lg:block">
        {/* Desenho de planta em traço fino */}
        <svg viewBox="0 0 800 800" className="absolute -bottom-24 -right-24 h-[88%] text-stone-300" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="120" y="140" width="560" height="480" />
            <path d="M120 380h240M360 140v240M480 380v240M480 480h200M280 620v-80M600 140v120" />
            <path d="M360 380a80 80 0 0 1 80 80" strokeDasharray="3 6" />
            <circle cx="570" cy="250" r="44" />
            <path d="M160 180h160v160H160z" strokeDasharray="2 5" />
            <path d="M60 140h40M60 620h40M80 140v480" />
            <path d="M120 680v40M680 680v40M120 700h560" />
          </g>
        </svg>
        <div className="relative flex h-full flex-col justify-between p-14">
          <BrandMark size="lg" />
          <div className="max-w-md">
            <h1 className="font-display text-[40px] font-medium leading-[1.1] tracking-[-0.03em] text-ink">
              Do primeiro contato à entrega do projeto.
            </h1>
            <p className="mt-5 max-w-sm text-body-lg text-muted">
              Oportunidades, clientes, projetos, prazos e tarefas da equipe — em um só lugar.
            </p>
          </div>
          <p className="text-xs text-faint">© {new Date().getFullYear()}</p>
        </div>
      </div>
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[360px]">
          <div className="mb-12 lg:hidden">
            <BrandMark size="lg" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { signIn, mode } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h2 className="font-display text-h1 text-ink">Entrar</h2>
      <p className="mt-1.5 text-body text-muted">Use o e-mail e a senha cadastrados pelo administrador.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field label="E-mail">
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" placeholder="voce@airos.com.br" required autoFocus />
          </div>
        </Field>
        <Field label="Senha">
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9" placeholder="••••••••" required />
          </div>
        </Field>
        {error && <p className="rounded-md bg-danger-bg px-3 py-2.5 text-[13px] text-danger-fg">{error}</p>}
        <Button type="submit" variant="primary" size="touch" loading={busy} className="w-full" icon={<ArrowRight className="h-4 w-4" />}>
          Entrar
        </Button>
        <p className="text-center text-xs text-stone-400">Esqueceu a senha? Peça ao administrador para redefini-la.</p>
      </form>
      {mode === 'local' && (
        <p className="mt-10 rounded-sm border border-dashed border-line px-3 py-2.5 text-xs text-stone-500">
          Modo demonstração: os dados ficam salvos somente neste navegador. Configure o Supabase para uso em equipe.
        </p>
      )}
    </AuthShell>
  );
}

export function SetupPage() {
  const { setup, mode } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [demo, setDemo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Informe seu nome.');
    if (!isValidEmail(email)) return setError('Informe um e-mail válido.');
    if (password.length < 6) return setError('A senha deve ter pelo menos 6 caracteres.');
    if (password !== confirm) return setError('As senhas não conferem.');
    setBusy(true);
    try {
      await setup({ name, email, password, color: SWATCHES[0], job_title: 'Administrador(a)' }, demo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <p className="text-[13px] text-faint">Primeiro acesso</p>
      <h2 className="mt-1.5 font-display text-h1 text-ink">Crie o administrador</h2>
      <p className="mt-1.5 text-body text-muted">
        Esta conta poderá cadastrar os demais membros da equipe e configurar o sistema.
      </p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field label="Seu nome">
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input value={name} onChange={(e) => setName(e.target.value)} className="pl-9" autoFocus />
          </div>
        </Field>
        <Field label="E-mail">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Senha">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Confirmar senha">
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        {mode === 'local' && (
          <Checkbox checked={demo} onChange={setDemo} label="Carregar dados de exemplo para conhecer o sistema" />
        )}
        {error && <p className="rounded-md bg-danger-bg px-3 py-2.5 text-[13px] text-danger-fg">{error}</p>}
        <Button type="submit" variant="primary" size="touch" loading={busy} className="w-full" icon={<ArrowRight className="h-4 w-4" />}>
          Criar conta e entrar
        </Button>
      </form>
      {mode === 'local' && demo && (
        <p className="mt-6 text-xs text-stone-500">
          Os dados de exemplo incluem 3 membros (ana@, bruno@ e carla@airos.com.br — senha <code>airos123</code>).
        </p>
      )}
    </AuthShell>
  );
}
