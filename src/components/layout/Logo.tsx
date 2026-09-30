import { useBranding } from '../../context/BrandingContext';
import { cn } from '../../lib/utils';

/**
 * Marca do escritório: exibe o logo enviado em Configurações; sem logo,
 * mostra o nome do escritório como um letreiro minimalista.
 */
export function BrandMark({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const { logo_url, office_name } = useBranding();
  if (logo_url) {
    const dims = { sm: 'h-7 max-w-[140px]', md: 'h-9 max-w-[168px]', lg: 'h-14 max-w-[240px]' }[size];
    return <img src={logo_url} alt={office_name} className={cn('w-auto object-contain object-left', dims, className)} />;
  }
  const [first, ...rest] = office_name.trim().split(/\s+/);
  return (
    <div className={cn('leading-none', className)}>
      <div
        className={cn(
          'font-display font-semibold uppercase text-ink-900',
          size === 'lg' ? 'text-2xl tracking-[0.32em]' : size === 'sm' ? 'text-[13px] tracking-[0.28em]' : 'text-[15px] tracking-[0.3em]',
        )}
      >
        {first}
      </div>
      {rest.length > 0 && (
        <div className={cn('mt-1.5 uppercase text-stone-400', size === 'lg' ? 'text-[11px] tracking-[0.3em]' : 'text-[9.5px] tracking-[0.26em]')}>
          {rest.join(' ')}
        </div>
      )}
    </div>
  );
}
