import { InputHTMLAttributes } from 'react';
import { Search } from 'lucide-react';

export function SearchInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        type="search"
        // Falls back to the placeholder as the accessible name — placeholder
        // text disappears once typed, so screen reader users still need a
        // real name; callers can still override with an explicit aria-label.
        aria-label={typeof props.placeholder === 'string' ? props.placeholder : undefined}
        {...props}
        className={`w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 transition-shadow focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${props.className ?? ''}`}
      />
    </div>
  );
}
