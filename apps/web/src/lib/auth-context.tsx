'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { setAccessToken, refreshAccessToken } from './api-client';
import { authApi, usersApi } from './endpoints';
import type { UserProfile } from './types';

interface AuthContextValue {
  user: UserProfile | null;
  isLoading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const refreshProfile = useCallback(async () => {
    try {
      const profile = await usersApi.me();
      setUser(profile);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // On first load (or hard reload) there is no in-memory access token, but
    // the httpOnly refresh cookie may still be valid — try to recover the
    // session silently before deciding the user is logged out.
    (async () => {
      const token = await refreshAccessToken();
      if (token) {
        await refreshProfile();
      }
      setIsLoading(false);
    })();
  }, [refreshProfile]);

  const login = useCallback(
    async (email: string, password: string, rememberMe?: boolean) => {
      const result = await authApi.login({ email, password, rememberMe });
      setAccessToken(result.accessToken);
      await refreshProfile();
    },
    [refreshProfile],
  );

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
