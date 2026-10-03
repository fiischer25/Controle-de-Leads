import { useBranding } from '../../context/BrandingContext';
import { cn } from '../../lib/utils';

/**
 * Marca do escritório: exibe o logo enviado em Configurações; sem logo,
 * mostra o wordmark (ex.: "AIROS" / "ARQUITETURA").
 */
export function BrandMark({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const { logo_url, office_name } = useBranding();
  if (logo_url) {
    const dims = { sm: 'h-7 max-w-[140px]', md: 'h-9 max-w-[168px]', lg: 'h-14 max-w-[240px]' }[size];
    return <img src={logo_url} alt={office_name} className={cn('w-auto object-contain object-left dark:brightness-0 dark:invert', dims, className)} />;
  }
  const [first, ...rest] = office_name.trim().split(/\s+/);
  return (
    <div className={cn('leading-none', className)} aria-label={office_name}>
      <div
        className={cn(
          'font-display font-bold uppercase text-ink',
          size === 'lg' ? 'text-2xl tracking-[0.38em]' : size === 'sm' ? 'text-[13.5px] tracking-[0.36em]' : 'text-[15px] tracking-[0.38em]',
        )}
      >
        {first}
      </div>
      {rest.length > 0 && (
        <div className={cn('mt-[5px] uppercase text-faint', size === 'lg' ? 'text-[11px] tracking-[0.32em]' : 'text-[8.5px] tracking-[0.32em]')}>
          {rest.join(' ')}
        </div>
      )}
    </div>
  );
}
