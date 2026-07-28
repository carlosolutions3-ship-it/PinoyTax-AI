import { LucideIcon } from 'lucide-react';
import { Card } from './ui';

const ICON_TONE_CLASSES: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-600',
  accent: 'bg-accent-50 text-accent-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  slate: 'bg-slate-100 text-slate-600',
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'brand',
  helpText,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  tone?: 'brand' | 'accent' | 'amber' | 'red' | 'slate';
  helpText?: string;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {Icon && (
          <span className={`rounded-lg p-2 ${ICON_TONE_CLASSES[tone]}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {helpText && <p className="mt-1 text-xs text-slate-500">{helpText}</p>}
    </Card>
  );
}
