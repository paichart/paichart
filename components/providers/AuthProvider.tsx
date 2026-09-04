'use client';

import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store/auth';
import { UserRole, ResourceType, ResourceAction, type User, type ApiResponseWithCookies, type AuthResponse, type LoginData, type RegisterData, convertUserResponse } from '@/lib/types/auth';

interface AuthContextType {
  user: User | null;
  accessToken: string | null; // BC56: Deprecated — use tokenExpiresAt for expiration checks
  tokenExpiresAt: number | null;
  isLoadingUser: boolean;
  login: (data: LoginData) => Promise<AuthResponse>;
  register: (data: RegisterData) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  isLoggingIn: boolean;
  isRegistering: boolean;
  isLoggingOut: boolean;
  hasRole: (role: UserRole) => boolean;
  hasPermission: (resourceType: ResourceType, action: ResourceAction) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { user, setUser, clearUser, tokenExpiresAt } = useAuthStore();

  const loginMutation = useMutation<AuthResponse, Error, LoginData>({
    mutationFn: async (data) => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Login failed');
      }

      const responseData = await response.json() as ApiResponseWithCookies<AuthResponse>;
      if (!responseData.data) {
        throw new Error('Invalid response format');
      }
      return responseData.data;
    },
    onSuccess: (data) => {
      setUser(convertUserResponse(data.user), null, data.tokenExpiresAt);
    },
  });

  const registerMutation = useMutation<AuthResponse, Error, RegisterData>({
    mutationFn: async (data) => {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Registration failed');
      }

      const responseData = await response.json() as ApiResponseWithCookies<AuthResponse>;
      if (!responseData.data) {
        throw new Error('Invalid response format');
      }
      return responseData.data;
    },
    onSuccess: (data) => {
      setUser(convertUserResponse(data.user), null, data.tokenExpiresAt);
    },
  });

  const logoutMutation = useMutation<void, Error>({
    mutationFn: async () => {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Logout failed');
      }
    },
    onSuccess: () => {
      clearUser();
      queryClient.clear();
    },
  });

  // Auto-refresh token mechanism to prevent premature logout
  // Refreshes token every 14 minutes (1 minute before 15-minute expiration)
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Only set up auto-refresh if user is logged in
    if (!user) {
      // Clear any existing interval if user logs out
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
      return;
    }

    // Set up auto-refresh interval (14 minutes = 840,000ms)
    const REFRESH_INTERVAL = 14 * 60 * 1000; // 14 minutes

    refreshIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include', // Include cookies
        });

        if (response.ok) {
          const data = await response.json() as ApiResponseWithCookies<AuthResponse>;
          if (data.data?.user) {
            setUser(convertUserResponse(data.data.user), null, data.data.tokenExpiresAt);
          }
        }
        // If refresh fails, let the next API call handle it
      } catch {
        // Silent failure - next API call will handle expired token
      }
    }, REFRESH_INTERVAL);

    // Cleanup function
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [user, setUser]); // Re-run if user changes

  // Refresh on tab wake (2026-06-12, refresh-token-race PLAN-v2 §1c).
  // Browsers throttle/suspend setInterval in background tabs, so the 14-min
  // interval above doesn't fire while a tab sleeps overnight — the first
  // interaction of the day then arrives with an expired access token and
  // every fetch falls back to the reactive refresh path. Refreshing on
  // visibilitychange/focus (when expiry is near, per BC56 tokenExpiresAt)
  // makes that reactive path rare again.
  useEffect(() => {
    if (!user) {
      return;
    }

    const refreshIfExpiring = async () => {
      if (document.visibilityState !== 'visible') return;
      if (!tokenExpiresAt) return;

      const timeUntilExpiry = tokenExpiresAt * 1000 - Date.now();
      if (timeUntilExpiry >= 2 * 60 * 1000) return;

      try {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json() as ApiResponseWithCookies<AuthResponse>;
          if (data.data?.user) {
            setUser(convertUserResponse(data.data.user), null, data.data.tokenExpiresAt);
          }
        }
        // If refresh fails, the next API call's reactive path handles it
      } catch {
        // Silent failure - next API call will handle expired token
      }
    };

    document.addEventListener('visibilitychange', refreshIfExpiring);
    window.addEventListener('focus', refreshIfExpiring);

    return () => {
      document.removeEventListener('visibilitychange', refreshIfExpiring);
      window.removeEventListener('focus', refreshIfExpiring);
    };
  }, [user, tokenExpiresAt, setUser]);

  const { data: currentUser, isLoading: isLoadingUser } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      // BC56 FIX: Use tokenExpiresAt from store instead of decoding the full token
      // This prevents needing to expose the token in response bodies (defeats HttpOnly)
      if (tokenExpiresAt) {
        const expiresAt = tokenExpiresAt * 1000; // Convert to milliseconds
        const now = Date.now();
        const timeUntilExpiry = expiresAt - now;

        // If token expires in less than 2 minutes, refresh it first
        if (timeUntilExpiry < 2 * 60 * 1000) {
          try {
            const refreshResponse = await fetch('/api/auth/refresh', {
              method: 'POST',
              credentials: 'include',
            });

            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json() as ApiResponseWithCookies<AuthResponse>;
              if (refreshData.data?.user) {
                setUser(convertUserResponse(refreshData.data.user), null, refreshData.data.tokenExpiresAt);
                return refreshData.data.user;
              }
            }
          } catch {
            // Continue with regular fetch - will handle 401 if needed
          }
        }
      }

      const response = await fetch('/api/auth/me');

      if (!response.ok) {
        if (response.status === 401) {
          clearUser();
          return null;
        }
        throw new Error('Failed to fetch user');
      }
      const data = await response.json() as ApiResponseWithCookies<{ user: User; tokenExpiresAt?: number }>;
      if (!data.data?.user) {
        throw new Error('Invalid response format');
      }
      setUser(convertUserResponse(data.data.user), null, data.data.tokenExpiresAt);
      return data.data.user;
    },
    retry: false,
  });

  const hasRole = (role: UserRole) => {
    if (!user) return false;
    if (user.role === UserRole.SUPER_ADMIN) return true;
    if (user.role === UserRole.ADMIN && role !== UserRole.SUPER_ADMIN) return true;
    return user.role === role;
  };

  const hasPermission = (resourceType: ResourceType, action: ResourceAction) => {
    if (!user) return false;
    
    // Super admin has all permissions
    if (user.role === UserRole.SUPER_ADMIN) return true;
    
    // For admin sections, check if the user is an admin
    if ([
    ResourceType.USER_MANAGEMENT,
    ResourceType.PERMISSIONS,
    ResourceType.JOB_TITLES,
    ResourceType.CRM,
    ResourceType.CRM_SETTINGS,
    ResourceType.CRM_MAPPING,
    ResourceType.CRM_SYNC,
    ResourceType.AUDIT
  ].includes(resourceType)) {
      return [UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(user.role);
    }

    return true;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken: null, // BC56: No longer exposed from API — use tokenExpiresAt
        tokenExpiresAt,
        isLoadingUser,
        login: loginMutation.mutateAsync,
        register: registerMutation.mutateAsync,
        logout: logoutMutation.mutateAsync,
        isLoggingIn: loginMutation.isPending,
        isRegistering: registerMutation.isPending,
        isLoggingOut: logoutMutation.isPending,
        hasRole,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
