'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  username?: string;
  role: 'super-admin' | 'admin' | 'user';
  name?: string;
  allottedProjects?: string[];
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (loginIdentifier: string, password: string, loginType?: 'email' | 'username' | 'employee') => Promise<void>;
  register: (email: string, password: string, role?: string, name?: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  handleApiResponse: (response: Response) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for stored token and validate expiration
    const validateAndSetToken = () => {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');
      
      if (storedToken && storedUser) {
        try {
          // Decode JWT token to check expiration (without verification)
          const base64Url = storedToken.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(
            atob(base64)
              .split('')
              .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join('')
          );
          const payload = JSON.parse(jsonPayload);
          
          // Check if token is expired
          if (payload.exp && payload.exp * 1000 < Date.now()) {
            // Token expired, clear it
            localStorage.removeItem('token');
            localStorage.removeItem('user');
          } else {
            // Token is still valid
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
          }
        } catch (error) {
          // Token is malformed, clear it
          console.error('Token validation error:', error);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      }
      setLoading(false);
    };

    validateAndSetToken();
  }, []);

  const login = async (loginIdentifier: string, password: string, loginType?: 'email' | 'username' | 'employee') => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        loginIdentifier, 
        password,
        loginType: loginType || (loginIdentifier.includes('@') ? 'email' : 'username')
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
  };

  const register = async (email: string, password: string, role?: string, name?: string, username?: string) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role, name, username }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    // Redirect to login page if not already there
    if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      window.location.href = '/login';
    }
  };

  // Helper function to handle API responses and check for token expiration
  const handleApiResponse = async (response: Response): Promise<any> => {
    const data = await response.json();
    
    if (response.status === 401) {
      // Token expired or invalid, logout user
      if (data.error?.includes('expired') || data.error?.includes('Invalid token')) {
        logout();
        throw new Error('Your session has expired. Please login again.');
      }
    }
    
    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }
    
    return data;
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading, handleApiResponse }}>
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

