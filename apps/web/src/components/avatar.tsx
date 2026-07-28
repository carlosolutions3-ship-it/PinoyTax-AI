const PALETTE = [
  'bg-brand-100 text-brand-700',
  'bg-accent-100 text-accent-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-sky-100 text-sky-700',
];

function hashToIndex(input: string, mod: number): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  return hash % mod;
}

/** Initials avatar, deterministically colored by name/email so the same
 * person always gets the same color across the app. */
export function Avatar({
  name,
  size = 'md',
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  const sizeClasses = { sm: 'h-6 w-6 text-xs', md: 'h-9 w-9 text-sm', lg: 'h-12 w-12 text-base' }[size];
  const colorClasses = PALETTE[hashToIndex(name, PALETTE.length)];

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${sizeClasses} ${colorClasses}`}
      aria-hidden="true"
    >
      {initials || '?'}
    </span>
  );
}
