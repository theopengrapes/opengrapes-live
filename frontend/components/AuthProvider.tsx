'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthContext, User } from '../lib/auth';
import { decodeJwt } from '../lib/api';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Read from localStorage on mount safely
    try {
      const storedToken = localStorage.getItem('lms_auth_token');
      if (storedToken) {
        const decoded = decodeJwt(storedToken);
        if (decoded && decoded.exp * 1000 > Date.now()) {
          setToken(storedToken);
          setUser({
            id: decoded.userId,
            name: decoded.name,
            email: decoded.email,
            role: decoded.role,
          });
        } else {
          // Expired or invalid
          try {
            localStorage.removeItem('lms_auth_token');
          } catch (err) {
            console.warn('Failed to remove expired token from localStorage:', err);
          }
        }
      }
    } catch (err) {
      console.warn('LocalStorage read blocked or failed:', err);
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Login failed' }));
        throw new Error(errorData.error || 'Login failed');
      }

      const { token: receivedToken, user: userData } = await response.json();
      try {
        localStorage.setItem('lms_auth_token', receivedToken);
      } catch (err) {
        console.warn('LocalStorage write blocked or failed:', err);
      }
      setToken(receivedToken);
      setUser(userData);
      setIsLoading(false);
    } catch (error) {
      setIsLoading(false);
      throw error;
    }
  };

  const logout = () => {
    try {
      localStorage.removeItem('lms_auth_token');
    } catch (err) {
      console.warn('LocalStorage remove blocked or failed:', err);
    }
    setToken(null);
    setUser(null);
    router.push('/');
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
