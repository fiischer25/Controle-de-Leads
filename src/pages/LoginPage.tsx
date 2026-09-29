import { useState, type FormEvent } from 'react';
import { ArrowRight, Lock, Mail, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button, Checkbox, Field, Input } from '../components/ui';
import { Logo } from '../components/layout/Logo';
import { SWATCHES } from '../lib/constants';
import { isValidEmail } from '../lib/utils';

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-ink-900 lg:block">
        {/* Grade de planta baixa estilizada */}
        <svg className="absolute inset-0 h-full w-full opacity-[0.14]" aria-hidden="true">
          <defs>
            <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M32 0H0v32" fill="none" stroke="#d5a78f" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        <svg viewBox="0 0 600 600" className="absolute -bottom-40 -right-40 h-[65%] opacity-25" aria-hidden="true">
          <g fill="none" stroke="#d5a78f" strokeWidth="2">
            <rect x="80" y="120" width="420" height="360" />
            <path d="M80 300h180M260 120v180M360 300v180M360 380h140M200 480v-60" />
            <path d="M260 300a60 60 0 0 1 60 60" strokeDasharray="4 6" />
            <circle cx="430" cy="200" r="36" />
          </g>
        </svg>
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <Logo />
            <div className="font-display text-lg font-extrabold tracking-[0.25em]">AIROS</div>
          </div>
          <div className="max-w-md">
            <p className="text-xs uppercase tracking-[0.3em] text-brand-300">Gestão do escritório</p>
            <h1 className="mt-4 font-display text-4xl font-bold leading-tight">
              Do primeiro contato à entrega do projeto, tudo em um só lugar.
            </h1>
            <p className="mt-4 text-stone-400">
              Oportunidades, clientes, projetos, prazos e tarefas da equipe com visão 360° do escritório.
            </p>
          </div>
          <p className="text-xs text-stone-500">© {new Date().getFullYear()} AIROS Arquitetura</p>
        </div>
      </div>
      <div className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo light />
            <div className="font-display text-lg font-extrabold tracking-[0.25em]">AIROS</div>
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
      <h2 className="font-display text-2xl font-bold">Entrar</h2>
      <p className="mt-1 text-sm text-stone-500">Use o e-mail e a senha cadastrados pelo administrador.</p>
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
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <Button type="submit" variant="dark" loading={busy} className="w-full" icon={<ArrowRight className="h-4 w-4" />}>
          Entrar
        </Button>
        <p className="text-center text-xs text-stone-400">Esqueceu a senha? Peça ao administrador para redefini-la.</p>
      </form>
      {mode === 'local' && (
        <p className="mt-10 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
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
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">Primeiro acesso</p>
      <h2 className="mt-2 font-display text-2xl font-bold">Crie o administrador</h2>
      <p className="mt-1 text-sm text-stone-500">
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
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <Button type="submit" variant="dark" loading={busy} className="w-full" icon={<ArrowRight className="h-4 w-4" />}>
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
