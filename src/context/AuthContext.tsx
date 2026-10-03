import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { backend, type NewUserInput } from '../lib/backend';

/** 'recovery' = entrou pelo link de "esqueci minha senha" e precisa criar a nova senha. */
type AuthStatus = 'loading' | 'setup' | 'signed_out' | 'signed_in' | 'recovery';

interface AuthApi {
  status: AuthStatus;
  userId: string | null;
  mode: 'local' | 'supabase';
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  setup(input: Omit<NewUserInput, 'role'>, withDemoData: boolean): Promise<void>;
  /** O link de redefinição aberto já tinha vencido ou sido usado. */
  recoveryLinkExpired: boolean;
  requestPasswordReset(email: string): Promise<void>;
  completePasswordReset(newPassword: string): Promise<void>;
  /** Sai da redefinição (cancelar) ou some com o aviso de link vencido. */
  dismissPasswordRecovery(): Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [recoveryLinkExpired, setRecoveryLinkExpired] = useState(false);

  const resolve = useCallback(async (id: string | null) => {
    const recovery = backend.passwordRecovery();
    setRecoveryLinkExpired(recovery === 'expired');
    if (recovery === 'active') {
      if (id) {
        setUserId(null);
        setStatus('recovery');
        return;
      }
      // A sessão temporária do link acabou: volta para a tela de entrada.
      await backend.dismissPasswordRecovery();
    }
    if (id) {
      setUserId(id);
      setStatus('signed_in');
      return;
    }
    setUserId(null);
    setStatus((await backend.needsSetup()) ? 'setup' : 'signed_out');
  }, []);

  useEffect(() => {
    backend.currentUserId().then(resolve);
    return backend.onAuthChange(resolve);
  }, [resolve]);

  const api = useMemo<AuthApi>(
    () => ({
      status,
      userId,
      mode: backend.mode,
      signIn: async (email, password) => {
        const id = await backend.signIn(email, password);
        await resolve(id);
      },
      signOut: async () => {
        await backend.signOut();
        await resolve(null);
      },
      setup: async (input, withDemoData) => {
        const id = await backend.setupFirstAdmin(input, withDemoData);
        await resolve(id);
      },
      recoveryLinkExpired,
      requestPasswordReset: (email) => backend.requestPasswordReset(email),
      completePasswordReset: async (newPassword) => {
        await backend.completePasswordReset(newPassword);
        await resolve(await backend.currentUserId());
      },
      dismissPasswordRecovery: async () => {
        await backend.dismissPasswordRecovery();
        await resolve(await backend.currentUserId());
      },
    }),
    [status, userId, recoveryLinkExpired, resolve],
  );

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
