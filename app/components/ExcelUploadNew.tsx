'use client';

import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface ExcelUploadNewProps {
  onUploadSuccess?: () => void;
}

export default function ExcelUploadNew({ onUploadSuccess }: ExcelUploadNewProps) {
  const { token, user } = useAuth();
  const [labourType, setLabourType] = useState<'OUR_LABOUR' | 'SUPPLY_LABOUR' | 'SUBCONTRACTOR'>('OUR_LABOUR');
  const [projectId, setProjectId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch(`/api/admin/excel/template?type=${labourType}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to download template');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `employee_template_${labourType.toLowerCase()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to download template' });
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setMessage({ type: 'error', text: 'Please select a file' });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('labourType', labourType);
      if (projectId) {
        formData.append('projectId', projectId);
      }

      const response = await fetch('/api/admin/excel/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        setMessage({ 
          type: 'success', 
          text: `Successfully uploaded! Created: ${result.data.created}, Failed: ${result.data.failed}` 
        });
        setFile(null);
        if (onUploadSuccess) onUploadSuccess();
      } else {
        setMessage({ type: 'error', text: result.error || 'Upload failed' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold mb-4">Upload Employee Data (Excel)</h2>

      {message && (
        <div className={`mb-4 p-3 rounded ${
          message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleUpload} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Labour Type *
          </label>
          <select
            value={labourType}
            onChange={(e) => setLabourType(e.target.value as any)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="OUR_LABOUR">Our Labour</option>
            <option value="SUPPLY_LABOUR">Supply Labour</option>
            <option value="SUBCONTRACTOR">Subcontractor</option>
          </select>
        </div>

        {user?.role === 'user' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Project ID *
            </label>
            <input
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              placeholder="Enter your project ID"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Excel File *
          </label>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Download Template
          </button>
          <button
            type="submit"
            disabled={uploading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Upload Excel'}
          </button>
        </div>
      </form>
    </div>
  );
}



