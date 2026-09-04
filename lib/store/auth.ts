import { create } from 'zustand';
import { User } from '../types/auth';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  tokenExpiresAt: number | null; // BC56: Store expiration timestamp instead of full token
  setUser: (user: User, accessToken?: string | null, tokenExpiresAt?: number | null) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  tokenExpiresAt: null,
  setUser: (user: User, accessToken?: string | null, tokenExpiresAt?: number | null) => set({ user, accessToken: accessToken || null, tokenExpiresAt: tokenExpiresAt || null }),
  clearUser: () => set({ user: null, accessToken: null, tokenExpiresAt: null }),
}));
