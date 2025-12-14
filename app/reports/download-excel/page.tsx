'use client';

import { useState } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';

export default function DownloadExcelPage() {
  return (
    <ProtectedRoute requireAdmin>
      <Navigation />
      <DownloadComponent />
    </ProtectedRoute>
  );
}

function DownloadComponent() {
  const [downloading, setDownloading] = useState(false);
  const { token } = useAuth();

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await fetch('/api/download/master-excel', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MASTER_SUMMARY_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(err.message || 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Download Master Excel</h1>

        <div className="bg-white rounded-lg shadow p-6">
          <p className="mb-4 text-gray-700">
            Generate and download the master summary Excel file with all attendance data.
          </p>

          <button
            onClick={handleDownload}
            disabled={downloading}
            className="bg-green-600 text-white px-6 py-3 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? 'Generating...' : 'Download Master Excel'}
          </button>
        </div>
      </div>
    </div>
  );
}

