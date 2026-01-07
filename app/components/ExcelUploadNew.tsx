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
      // Get assigned format first
      const formatResponse = await fetch('/api/employee/excel-format', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const formatResult = await formatResponse.json();
      
      if (!formatResult.success || !formatResult.data) {
        setMessage({ 
          type: 'error', 
          text: 'No format assigned to you. Please contact administrator to assign a format before downloading templates.' 
        });
        return;
      }

      const formatId = formatResult.data._id;
      
      // Download the assigned format template
      const response = await fetch(`/api/employee/excel-formats/${formatId}/download`, {
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
      a.download = `${formatResult.data.name.replace(/[^a-z0-9]/gi, '_')}_template.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setMessage({ 
        type: 'success', 
        text: `Template downloaded: ${formatResult.data.name}` 
      });
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
      // STRICT: Validate format before upload
      const validateFormData = new FormData();
      validateFormData.append('file', file);

      const validateResponse = await fetch('/api/employee/validate-excel-format', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: validateFormData,
      });

      const validateResult = await validateResponse.json();

      if (!validateResult.hasFormat) {
        setMessage({ 
          type: 'error', 
          text: validateResult.error || 'No format assigned to you. Please contact administrator to assign a format before uploading files.' 
        });
        setUploading(false);
        return;
      }

      if (!validateResult.success || !validateResult.validation.isValid) {
        // Format validation failed
        const errors = validateResult.validation.errors || [];
        const warnings = validateResult.validation.warnings || [];
        const missingCols = validateResult.validation.missingColumns || [];
        const formatCols = validateResult.example?.columns || [];

        let errorMsg = '⚠️ Format Validation Failed!\n\n';
        errorMsg += 'Your Excel file does not match the assigned format.\n\n';
        
        if (missingCols.length > 0) {
          errorMsg += `❌ Missing Required Columns:\n${missingCols.map((col: string) => `  - ${col}`).join('\n')}\n\n`;
        }
        
        if (errors.length > 0) {
          errorMsg += `❌ Errors:\n${errors.slice(0, 5).map((err: string) => `  - ${err}`).join('\n')}\n`;
          if (errors.length > 5) {
            errorMsg += `  ... and ${errors.length - 5} more errors\n`;
          }
          errorMsg += '\n';
        }

        if (warnings.length > 0) {
          errorMsg += `⚠️ Warnings:\n${warnings.slice(0, 3).map((warn: string) => `  - ${warn}`).join('\n')}\n\n`;
        }

        errorMsg += `✅ Required Format Columns:\n${formatCols.map((col: string, idx: number) => `  ${idx + 1}. ${col}`).join('\n')}\n\n`;
        errorMsg += 'Please download the template and fix your file, then try uploading again.';

        setMessage({ 
          type: 'error', 
          text: errorMsg 
        });
        setUploading(false);
        return;
      }

      // Format is valid, proceed with upload
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
          text: `✅ Format validated and successfully uploaded! Created: ${result.data.created}, Failed: ${result.data.failed}` 
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
      <h2 className="text-2xl font-bold mb-4">Create & Upload Excel File</h2>

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
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 font-semibold"
            title="Download your assigned format template"
          >
            📥 Download Assigned Template
          </button>
          <button
            type="submit"
            disabled={uploading || !file}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {uploading ? 'Validating & Uploading...' : 'Upload Excel'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          ⚠️ Your file will be validated against your assigned format before upload. Files that don&apos;t match will be rejected.
        </p>
      </form>
    </div>
  );
}

