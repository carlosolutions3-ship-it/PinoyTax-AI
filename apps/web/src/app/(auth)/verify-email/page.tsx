'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import { AuthLayout } from '@/components/brand/auth-layout';

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailStatus />
    </Suspense>
  );
}

function VerifyEmailStatus() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [message, setMessage] = useState('Verifying your email…');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('This verification link is missing a token.');
      return;
    }
    authApi
      .verifyEmail(token)
      .then(() => {
        setStatus('success');
        setMessage('Your email has been verified. You can now log in.');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err instanceof ApiError ? err.message : 'This verification link is invalid or has expired.');
      });
  }, [token]);

  return (
    <AuthLayout>
      <div className="text-center">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-slate-900">
          {status === 'success' ? 'Email verified' : status === 'error' ? 'Verification failed' : 'One moment…'}
        </h1>
        <p className="text-sm text-slate-600">{message}</p>
        <Link href="/login" className="mt-6 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
          Back to login
        </Link>
      </div>
    </AuthLayout>
  );
}
