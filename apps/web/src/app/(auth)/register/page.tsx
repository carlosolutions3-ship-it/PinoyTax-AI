'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { authApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/button';
import { ErrorText, Field, Input, Label } from '@/components/ui';
import { AuthLayout } from '@/components/brand/auth-layout';

export default function RegisterPage() {
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '', phoneNumber: '' });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await authApi.register({
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        phoneNumber: form.phoneNumber || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to register. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <AuthLayout>
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-slate-900">Check your email</h1>
        <p className="text-sm text-slate-600">
          We sent a verification link to <strong>{form.email}</strong>. Verify your account before logging in.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
          Back to login
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-slate-900">Create your account</h1>
      <p className="mb-8 text-sm text-slate-500">Start managing your business compliance today.</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              required
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            />
          </Field>
          <Field>
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              required
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            />
          </Field>
        </div>
        <Field>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field>
          <Label htmlFor="phoneNumber">Phone number (optional)</Label>
          <Input
            id="phoneNumber"
            value={form.phoneNumber}
            onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
          />
        </Field>
        <Field>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <p className="text-xs text-slate-500">
            At least 8 characters, with an uppercase letter, a lowercase letter, and a number.
          </p>
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" isLoading={isSubmitting}>
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
