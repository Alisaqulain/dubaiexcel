'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '../../components/ProtectedRoute';

export default function AdminUploadPage() {
  return (
    <ProtectedRoute>
      <RedirectToExcel />
    </ProtectedRoute>
  );
}

function RedirectToExcel() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/excel');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-xl">Redirecting to Excel Interface...</div>
    </div>
  );
}

