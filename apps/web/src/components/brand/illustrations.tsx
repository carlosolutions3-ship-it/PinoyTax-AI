/**
 * Placeholder illustrations — abstract, geometric, flat-vector compositions
 * in the brand palette (no characters/cartoons), used sparingly for empty
 * states and the auth-page side panel. Swap for commissioned artwork later;
 * every usage imports from this one file.
 */

export function EmptyStateIllustration({ className = 'h-32 w-32' }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" fill="none" className={className} aria-hidden="true">
      <circle cx="80" cy="80" r="72" className="fill-brand-50" />
      <rect x="40" y="64" width="80" height="56" rx="10" className="fill-white stroke-slate-200" strokeWidth="2" />
      <rect x="40" y="64" width="80" height="20" rx="10" className="fill-brand-100" />
      <circle cx="54" cy="74" r="3" className="fill-brand-500" />
      <rect x="52" y="96" width="56" height="6" rx="3" className="fill-slate-200" />
      <rect x="52" y="108" width="36" height="6" rx="3" className="fill-slate-100" />
      <path
        d="M64 52 L64 40 M96 52 L96 40 M80 46 L80 34"
        className="stroke-accent-300"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AuthIllustration({ className = 'h-full w-full' }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" fill="none" className={className} aria-hidden="true">
      <circle cx="200" cy="200" r="200" className="fill-brand-700" />
      <circle cx="200" cy="200" r="150" className="fill-brand-600" fillOpacity="0.6" />
      <rect x="90" y="140" width="220" height="150" rx="16" className="fill-white" fillOpacity="0.08" />
      <rect x="90" y="140" width="220" height="40" rx="16" className="fill-white" fillOpacity="0.14" />
      <circle cx="110" cy="160" r="6" fill="white" fillOpacity="0.5" />
      <circle cx="128" cy="160" r="6" fill="white" fillOpacity="0.3" />
      <rect x="112" y="200" width="70" height="10" rx="5" fill="white" fillOpacity="0.35" />
      <rect x="112" y="220" width="150" height="10" rx="5" fill="white" fillOpacity="0.22" />
      <rect x="112" y="240" width="110" height="10" rx="5" fill="white" fillOpacity="0.22" />
      <rect x="230" y="196" width="60" height="70" rx="10" fill="white" fillOpacity="0.16" />
      <rect x="240" y="240" width="10" height="20" rx="3" fill="white" fillOpacity="0.5" />
      <rect x="256" y="228" width="10" height="32" rx="3" fill="white" fillOpacity="0.65" />
      <rect x="272" y="212" width="10" height="48" rx="3" fill="white" fillOpacity="0.5" />
    </svg>
  );
}
