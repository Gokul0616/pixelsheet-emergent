import React, { createContext, useContext, useEffect, useState } from 'react';

interface User {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  mfaEnabled: boolean;
  emailVerified: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<{ requiresMfa?: boolean }>;
  loginWithMfa: (email: string, mfaToken: string, backupCode?: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setupMfa: () => Promise<{ qrCode: string; backupCodes: string[]; secret: string }>;
  enableMfa: (token: string) => Promise<void>;
  disableMfa: (password: string) => Promise<void>;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = import.meta.env.VITE_BACKEND_URL || '';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tokens, setTokens] = useState<{ accessToken: string; refreshToken: string } | null>(() => {
    const stored = localStorage.getItem('auth_tokens');
    return stored ? JSON.parse(stored) : null;
  });

  const isAuthenticated = !!user && !!tokens;

  // Save tokens to localStorage
  const saveTokens = (newTokens: { accessToken: string; refreshToken: string }) => {
    setTokens(newTokens);
    localStorage.setItem('auth_tokens', JSON.stringify(newTokens));
  };

  // Clear tokens from localStorage
  const clearTokens = () => {
    setTokens(null);
    localStorage.removeItem('auth_tokens');
  };

  // Make authenticated API request
  const apiRequest = async (url: string, options: RequestInit = {}) => {
    if (!tokens) throw new Error('No authentication tokens');

    const response = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokens.accessToken}`,
        ...options.headers,
      },
    });

    if (response.status === 401) {
      // Token expired, try to refresh
      await refreshToken();
      throw new Error('Token expired, please try again');
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  };

  // Load user profile
  const loadProfile = async () => {
    try {
      if (!tokens) return;
      
      const data = await apiRequest('/api/auth/profile');
      setUser(data.user);
    } catch (error) {
      console.error('Failed to load profile:', error);
      clearTokens();
      setUser(null);
    }
  };

  // Refresh access token
  const refreshToken = async () => {
    try {
      if (!tokens?.refreshToken) throw new Error('No refresh token');

      const response = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });

      if (!response.ok) throw new Error('Token refresh failed');

      const data = await response.json();
      saveTokens(data.tokens);
    } catch (error) {
      console.error('Token refresh failed:', error);
      clearTokens();
      setUser(null);
    }
  };

  // Login
  const login = async (email: string, password: string, rememberMe = false) => {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, rememberMe }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();

    if (data.requiresMfa) {
      return { requiresMfa: true };
    }

    saveTokens(data.tokens);
    setUser(data.user);
    return {};
  };

  // Login with MFA
  const loginWithMfa = async (email: string, mfaToken: string, backupCode?: string) => {
    const response = await fetch(`${API_BASE}/api/auth/mfa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, mfaToken, backupCode }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'MFA verification failed');
    }

    const data = await response.json();
    saveTokens(data.tokens);
    setUser(data.user);
  };

  // Register
  const register = async (username: string, email: string, password: string) => {
    const response = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Registration failed');
    }

    const data = await response.json();
    saveTokens(data.tokens);
    setUser(data.user);
  };

  // Logout
  const logout = async () => {
    try {
      if (tokens) {
        await apiRequest('/api/auth/logout', { method: 'POST' });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearTokens();
      setUser(null);
    }
  };

  // Setup MFA
  const setupMfa = async () => {
    const data = await apiRequest('/api/auth/mfa/setup', { method: 'POST' });
    return {
      qrCode: data.qrCode,
      backupCodes: data.backupCodes,
      secret: data.secret,
    };
  };

  // Enable MFA
  const enableMfa = async (token: string) => {
    await apiRequest('/api/auth/mfa/enable', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    await loadProfile(); // Refresh user data
  };

  // Disable MFA
  const disableMfa = async (password: string) => {
    await apiRequest('/api/auth/mfa/disable', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    await loadProfile(); // Refresh user data
  };

  // Initialize auth state
  useEffect(() => {
    const initAuth = async () => {
      if (tokens) {
        await loadProfile();
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  // Auto-refresh token
  useEffect(() => {
    if (!tokens || !isAuthenticated) return;

    const interval = setInterval(() => {
      refreshToken().catch(console.error);
    }, 20 * 60 * 1000); // Refresh every 20 minutes

    return () => clearInterval(interval);
  }, [tokens, isAuthenticated]);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated,
    login,
    loginWithMfa,
    register,
    logout,
    setupMfa,
    enableMfa,
    disableMfa,
    refreshToken,
  };

  return (
    <AuthContext.Provider value={value}>
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