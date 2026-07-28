'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/button';
import { ErrorText, Field, Input, Label } from '@/components/ui';
import { AuthLayout } from '@/components/brand/auth-layout';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password, rememberMe);
      router.push('/companies');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to log in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
      <p className="mb-8 text-sm text-slate-500">Log in to manage tax compliance, payroll, and filings.</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500/30"
          />
          Remember me
        </label>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" isLoading={isSubmitting}>
          Log in
        </Button>
      </form>
      <div className="mt-6 flex justify-between text-sm">
        <Link href="/forgot-password" className="font-medium text-brand-600 hover:text-brand-700">
          Forgot password?
        </Link>
        <Link href="/register" className="font-medium text-brand-600 hover:text-brand-700">
          Create an account
        </Link>
      </div>
    </AuthLayout>
  );
}
