'use client';

import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import ExcelUploadNew from '../../components/ExcelUploadNew';

export default function AdminUploadPage() {
  return (
    <ProtectedRoute>
      <Navigation />
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <ExcelUploadNew />
        </div>
      </div>
    </ProtectedRoute>
  );
}

