import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { backend, type Branding } from '../lib/backend';

const DEFAULT: Branding = { office_name: 'AIROS Arquitetura', logo_url: null };

interface BrandingApi extends Branding {
  setBranding(b: Partial<Branding>): void;
}

const BrandingContext = createContext<BrandingApi | null>(null);

/** Nome e logo do escritório, disponíveis em todo o app — inclusive antes do login. */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setState] = useState<Branding>(DEFAULT);

  useEffect(() => {
    backend
      .getBranding()
      .then((b) => b && setState({ office_name: b.office_name || DEFAULT.office_name, logo_url: b.logo_url ?? null }))
      .catch(() => undefined);
  }, []);

  // Título da aba e favicon acompanham a marca do escritório
  useEffect(() => {
    document.title = `${branding.office_name} · Gestão de projetos`;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) {
      link.href = branding.logo_url ?? '/favicon.svg';
      link.type = branding.logo_url ? '' : 'image/svg+xml';
    }
  }, [branding]);

  const setBranding = useCallback((b: Partial<Branding>) => setState((prev) => ({ ...prev, ...b })), []);
  const api = useMemo(() => ({ ...branding, setBranding }), [branding, setBranding]);
  return <BrandingContext.Provider value={api}>{children}</BrandingContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding fora do BrandingProvider');
  return ctx;
}
