import Link from 'next/link';
import { LogoMark } from './logo';
import { AuthIllustration } from './illustrations';

/** Shared split-screen shell for the (auth) route group: brand/illustration
 * panel on the left (desktop only), form content on the right. */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-white">
      <div className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-brand-700 px-10 py-10 lg:flex">
        <div className="absolute inset-0">
          <AuthIllustration className="h-full w-full" />
        </div>
        <Link href="/login" className="relative flex items-center gap-2">
          <LogoMark className="h-8 w-8" />
          <span className="text-lg font-semibold tracking-tight text-white">
            PinoyTax <span className="text-brand-200">AI</span>
          </span>
        </Link>
        <p className="relative max-w-sm text-sm text-brand-50/90">
          AI-powered tax compliance, payroll, and government filing built for Philippine
          businesses.
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <Link href="/login" className="mb-8 flex items-center gap-2 lg:hidden">
          <LogoMark className="h-8 w-8" />
          <span className="text-lg font-semibold tracking-tight text-slate-900">
            PinoyTax <span className="text-brand-600">AI</span>
          </span>
        </Link>
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
