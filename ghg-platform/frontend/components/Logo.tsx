/* eslint-disable @next/next/no-img-element */
/**
 * Go Green logo. Files live in public/brand/ (drawn artwork — never retype the name in a font).
 * variant: 'horizontal' (default), 'stacked', 'mark' (leaf only), 'reversed' (for dark green backgrounds)
 */
type Variant = 'horizontal' | 'stacked' | 'mark' | 'reversed';

const FILES: Record<Variant, { src: string; ratio: number }> = {
  horizontal: { src: '/brand/go-green-logo-horizontal.svg', ratio: 600 / 160 },
  stacked: { src: '/brand/go-green-logo-stacked.svg', ratio: 360 / 300 },
  mark: { src: '/brand/go-green-mark.svg', ratio: 1 },
  reversed: { src: '/brand/go-green-logo-horizontal-reversed.svg', ratio: 600 / 160 },
};

export function Logo({ variant = 'horizontal', height = 32, className = '' }: { variant?: Variant; height?: number; className?: string }) {
  const f = FILES[variant];
  return <img src={f.src} alt="Go Green" height={height} width={Math.round(height * f.ratio)} className={className} />;
}
