import { useEffect, useState } from 'react';

/**
 * Como o escritório organiza o caixa:
 * - 'seguinte': o que entra num mês paga as contas do mês seguinte (recebe em setembro, paga outubro);
 * - 'mesmo': entradas e contas do mesmo mês.
 * Fica lembrado neste navegador e vale para a tela Financeiro e os dashboards.
 */
export type CashMode = 'seguinte' | 'mesmo';

const KEY = 'airos:caixa-modo';
const EVENT = 'airos:caixa-modo';

function read(): CashMode {
  try {
    return localStorage.getItem(KEY) === 'mesmo' ? 'mesmo' : 'seguinte';
  } catch {
    return 'seguinte';
  }
}

export function useCashMode(): [CashMode, (m: CashMode) => void] {
  const [mode, setMode] = useState<CashMode>(read);
  useEffect(() => {
    const sync = () => setMode(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const set = (m: CashMode) => {
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* só nesta sessão */
    }
    setMode(m);
    window.dispatchEvent(new Event(EVENT));
  };
  return [mode, set];
}
