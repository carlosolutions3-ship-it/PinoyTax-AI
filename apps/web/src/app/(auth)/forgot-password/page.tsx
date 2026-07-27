'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { authApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/button';
import { Card, ErrorText, Field, Input, Label } from '@/components/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await authApi.forgotPassword(email);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold">Reset your password</h1>
        <p className="mb-6 text-sm text-slate-500">
          Enter your email and we&apos;ll send you a reset link if an account exists.
        </p>
        {submitted ? (
          <p className="text-sm text-slate-600">
            If an account exists for <strong>{email}</strong>, a reset link has been sent.
          </p>
        ) : (
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
            <ErrorText>{error}</ErrorText>
            <Button type="submit" isLoading={isSubmitting}>
              Send reset link
            </Button>
          </form>
        )}
        <Link href="/login" className="mt-4 inline-block text-sm text-brand-600 hover:underline">
          Back to login
        </Link>
      </Card>
    </div>
  );
}
