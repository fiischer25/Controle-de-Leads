import { useCallback, useEffect, useSyncExternalStore } from 'react';

/** Preferência de tema: claro, escuro ou seguir o sistema. Aplicada pela classe `.dark` no <html>. */
export type ThemePref = 'light' | 'dark' | 'system';

const KEY = 'airos:theme';
const listeners = new Set<() => void>();

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'system' ? v : 'light';
  } catch {
    return 'light';
  }
}

function systemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(pref: ThemePref = read()) {
  const dark = pref === 'dark' || (pref === 'system' && systemDark());
  document.documentElement.classList.toggle('dark', dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', dark ? '#121110' : '#f6f5f2');
}

export function setTheme(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* navegação privada */
  }
  applyTheme(pref);
  listeners.forEach((l) => l());
}

export function useTheme(): [ThemePref, (pref: ThemePref) => void] {
  const pref = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => 'light' as ThemePref,
  );
  // Acompanha a troca de tema do sistema quando a preferência é "system".
  useEffect(() => {
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);
  return [pref, useCallback((p: ThemePref) => setTheme(p), [])];
}
