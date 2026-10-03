import { useSyncExternalStore } from 'react';

/** true enquanto a media query casar (ex.: '(min-width: 768px)'). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}
