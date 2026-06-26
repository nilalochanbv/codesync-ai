import { create } from 'zustand';
import { apiClient } from '../services/api';

interface User {
  id: string;
  username: string;
  email: string;
  avatar: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  login: (credentials: { email: string; password: string }) => Promise<void>;
  register: (userDetails: { username: string; email: string; password: string }) => Promise<void>;
  loginGoogle: (details: { username: string; email: string; avatar?: string }) => Promise<void>;
  loginGoogleReal: (idToken: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('codesync_token'),
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (credentials) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiClient('/auth/login', {
        method: 'POST',
        body: credentials,
      });
      localStorage.setItem('codesync_token', data.token);
      set({
        user: data.user,
        token: data.token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err: any) {
      set({ error: err.message || 'Login failed', isLoading: false });
      throw err;
    }
  },

  loginGoogle: async (details) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiClient('/auth/google-mock', {
        method: 'POST',
        body: details,
      });
      localStorage.setItem('codesync_token', data.token);
      set({
        user: data.user,
        token: data.token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err: any) {
      set({ error: err.message || 'Google Sign In failed', isLoading: false });
      throw err;
    }
  },

  loginGoogleReal: async (idToken) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiClient('/auth/google', {
        method: 'POST',
        body: { idToken },
      });
      localStorage.setItem('codesync_token', data.token);
      set({
        user: data.user,
        token: data.token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err: any) {
      set({ error: err.message || 'Google Sign In failed', isLoading: false });
      throw err;
    }
  },

  register: async (userDetails) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiClient('/auth/register', {
        method: 'POST',
        body: userDetails,
      });
      localStorage.setItem('codesync_token', data.token);
      set({
        user: data.user,
        token: data.token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err: any) {
      set({ error: err.message || 'Registration failed', isLoading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('codesync_token');
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      error: null,
    });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('codesync_token');
    if (!token) {
      set({ isAuthenticated: false, isLoading: false });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const data = await apiClient('/auth/me', {
        method: 'GET',
      });
      set({
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err: any) {
      // Token expired or invalid
      localStorage.removeItem('codesync_token');
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  clearError: () => set({ error: null }),
}));
