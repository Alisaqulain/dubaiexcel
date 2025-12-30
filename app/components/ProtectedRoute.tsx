'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireSuperAdmin?: boolean;
  allowViewOnly?: boolean;
}

export function ProtectedRoute({ 
  children, 
  requireAdmin = false, 
  requireSuperAdmin = false,
  allowViewOnly = false 
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else if (requireSuperAdmin && user.role !== 'super-admin') {
        router.push('/dashboard');
      } else if (requireAdmin && user.role !== 'admin' && user.role !== 'super-admin') {
        router.push('/dashboard');
      }
    }
  }, [user, loading, requireAdmin, requireSuperAdmin, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (requireSuperAdmin && user.role !== 'super-admin') {
    return null;
  }

  if (requireAdmin && user.role !== 'admin' && user.role !== 'super-admin') {
    return null;
  }

  return <>{children}</>;
}

