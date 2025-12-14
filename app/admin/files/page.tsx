'use client';

import { useState, useEffect, useCallback } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';

interface ExcelFile {
  fileId: string;
  filename: string;
  fileType: 'uploaded' | 'created';
  fileSize: number;
  rowCount: number;
  status: string;
  uploadedAt: string;
  createdBy: {
    email: string;
    fullName: string;
  };
}

export default function AdminFilesPage() {
  return (
    <ProtectedRoute requireAdmin>
      <Navigation />
      <FilesComponent />
    </ProtectedRoute>
  );
}

function FilesComponent() {
  const [files, setFiles] = useState<ExcelFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'uploaded' | 'created'>('all');
  const [merging, setMerging] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const { token } = useAuth();

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const url = filter === 'all' 
        ? '/api/admin/excel-files'
        : `/api/admin/excel-files?fileType=${filter}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (response.ok) {
        setFiles(result.files || []);
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to load files' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load files' });
    } finally {
      setLoading(false);
    }
  }, [filter, token]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleDownload = async (fileId: string, filename: string) => {
    try {
      const response = await fetch(`/api/admin/excel-files/${fileId}/download`, {
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
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Download failed' });
    }
  };

  const handleMerge = async () => {
    if (files.length === 0) {
      setMessage({ type: 'error', text: 'No files to merge' });
      return;
    }

    const confirmed = confirm(
      `Merge ${files.length} Excel file(s) into a single file?`
    );

    if (!confirmed) return;

    setMerging(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/excel-files/merge', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Merge failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MERGED_FILES_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setMessage({ type: 'success', text: 'Files merged and downloaded successfully!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Merge failed' });
    } finally {
      setMerging(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">All Excel Files</h1>
          <button
            onClick={handleMerge}
            disabled={merging || files.length === 0}
            className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {merging ? 'Merging...' : `Merge All (${files.length})`}
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-1 px-4" aria-label="Tabs">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  filter === 'all'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                All Files ({files.length})
              </button>
              <button
                onClick={() => setFilter('uploaded')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  filter === 'uploaded'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Uploaded
              </button>
              <button
                onClick={() => setFilter('created')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  filter === 'created'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Created
              </button>
            </nav>
          </div>
        </div>

        {message && (
          <div className={`mb-4 p-4 rounded-md ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading files...</p>
          </div>
        ) : files.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-600">No Excel files found.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Filename
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rows
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Uploaded At
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {files.map((file) => (
                  <tr key={file.fileId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <svg className="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-sm font-medium text-gray-900">{file.filename}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        file.fileType === 'uploaded'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}>
                        {file.fileType}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {file.createdBy.fullName} ({file.createdBy.email})
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatFileSize(file.fileSize)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {file.rowCount || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(file.uploadedAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleDownload(file.fileId, file.filename)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


