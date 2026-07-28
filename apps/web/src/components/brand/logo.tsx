/**
 * Placeholder brand mark for PinoyTax AI — an ascending-bars glyph (growth /
 * financial clarity) in the primary emerald, paired with an Inter wordmark.
 * Swap the mark/wordmark here if a professional brand identity is
 * commissioned later; every consumer imports from this one file.
 */
export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-brand-600" />
      <rect x="8" y="17" width="4" height="8" rx="1.5" fill="white" fillOpacity="0.95" />
      <rect x="14" y="13" width="4" height="12" rx="1.5" fill="white" />
      <rect x="20" y="8" width="4" height="17" rx="1.5" fill="white" fillOpacity="0.95" />
    </svg>
  );
}

export function Logo({ className = '', markClassName = 'h-8 w-8' }: { className?: string; markClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className={markClassName} />
      <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
        PinoyTax <span className="text-brand-600">AI</span>
      </span>
    </span>
  );
}
