'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';

export default function ExcelMergePage() {
  return (
    <ProtectedRoute requireAdmin>
      <Navigation />
      <ExcelMergeComponent />
    </ProtectedRoute>
  );
}

interface ExcelUpload {
  _id: string;
  filename: string;
  originalFilename: string;
  uploadedBy: { email: string; name?: string };
  projectId?: string;
  labourType: string;
  status: string;
  rowCount: number;
  processedCount: number;
  errorCount: number;
  merged: boolean;
  createdAt: string;
}

function ExcelMergeComponent() {
  const { token } = useAuth();
  const [uploads, setUploads] = useState<ExcelUpload[]>([]);
  const [selectedUploads, setSelectedUploads] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchUploads();
  }, []);

  const fetchUploads = async () => {
    try {
      const response = await fetch('/api/admin/excel/merge', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const result = await response.json();
      if (result.success) {
        setUploads(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch uploads:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelect = (uploadId: string) => {
    setSelectedUploads(prev =>
      prev.includes(uploadId)
        ? prev.filter(id => id !== uploadId)
        : [...prev, uploadId]
    );
  };

  const handleMerge = async () => {
    if (selectedUploads.length === 0) {
      setMessage({ type: 'error', text: 'Please select at least one upload to merge' });
      return;
    }

    setMerging(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/excel/merge', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uploadIds: selectedUploads }),
      });

      const result = await response.json();
      if (result.success) {
        setMessage({ type: 'success', text: result.message || 'Successfully merged uploads' });
        setSelectedUploads([]);
        fetchUploads();
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to merge' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to merge' });
    } finally {
      setMerging(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Merge Excel Data</h1>
          <button
            onClick={handleMerge}
            disabled={merging || selectedUploads.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {merging ? 'Merging...' : `Merge Selected (${selectedUploads.length})`}
          </button>
        </div>

        {message && (
          <div className={`mb-4 p-3 rounded ${
            message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedUploads.length === uploads.length && uploads.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedUploads(uploads.map(u => u._id));
                      } else {
                        setSelectedUploads([]);
                      }
                    }}
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Filename</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uploaded By</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Labour Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rows</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uploaded</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {uploads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                    No uploads available for merging
                  </td>
                </tr>
              ) : (
                uploads.map((upload) => (
                  <tr key={upload._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedUploads.includes(upload._id)}
                        onChange={() => handleToggleSelect(upload._id)}
                        disabled={upload.merged}
                      />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{upload.originalFilename}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {typeof upload.uploadedBy === 'object' ? upload.uploadedBy.email : upload.uploadedBy}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        upload.labourType === 'OUR_LABOUR' ? 'bg-blue-100 text-blue-800' :
                        upload.labourType === 'SUPPLY_LABOUR' ? 'bg-green-100 text-green-800' :
                        'bg-purple-100 text-purple-800'
                      }`}>
                        {upload.labourType.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {upload.processedCount} / {upload.rowCount}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        upload.merged ? 'bg-gray-100 text-gray-800' :
                        upload.status === 'PROCESSED' ? 'bg-green-100 text-green-800' :
                        upload.status === 'ERROR' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {upload.merged ? 'Merged' : upload.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(upload.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
