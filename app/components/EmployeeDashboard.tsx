'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import ExcelUploadNew from './ExcelUploadNew';
import ExcelCreator from './ExcelCreator';

interface UploadRecord {
  _id: string;
  originalFilename: string;
  labourType: string;
  status: string;
  rowCount: number;
  processedCount: number;
  errorCount: number;
  createdAt: string;
}

interface ExcelFormat {
  _id: string;
  name: string;
  description?: string;
  columns: Array<{
    name: string;
    type: string;
    required: boolean;
    order: number;
    validation?: {
      min?: number;
      max?: number;
      options?: string[];
    };
  }>;
}

export default function EmployeeDashboard() {
  const { user, token } = useAuth();
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [formats, setFormats] = useState<ExcelFormat[]>([]);
  const [loadingFormats, setLoadingFormats] = useState(true);
  const [selectedFormat, setSelectedFormat] = useState<ExcelFormat | null>(null);
  const [showExcelCreator, setShowExcelCreator] = useState(false);
  const [createdFile, setCreatedFile] = useState<File | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchMyUploads();
    fetchMyFormats();
  }, []);

  const fetchMyUploads = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/employee/uploads', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const result = await response.json();
      if (result.success) {
        setUploads(result.data || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch uploads:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyFormats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/employee/excel-formats', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const result = await response.json();
      if (result.success) {
        setFormats(result.data || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch formats:', err);
    } finally {
      setLoadingFormats(false);
    }
  };

  const handleDownloadTemplate = async (formatId: string, formatName: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/employee/excel-formats/${formatId}/download`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || 'Failed to download template');
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${formatName.replace(/[^a-z0-9]/gi, '_')}_template.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(err.message || 'Failed to download template');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">My Dashboard</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Welcome, {user?.name || (user as any)?.empId || 'Employee'}</h2>
          <p className="text-gray-600">Create, download, and upload your Excel files here. All uploads will be validated and reviewed by administrators.</p>
        </div>

        {message && (
          <div className={`mb-4 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-red-100 text-red-700 border border-red-300'
          }`}>
            {message.text}
          </div>
        )}

        {/* Assigned Formats Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">My Assigned Excel Formats</h2>
          <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-2">📋 Your Assigned Formats</h3>
            <p className="text-sm text-blue-700 mb-2">
              You can only use the formats assigned to you. Click on a format to work with it.
            </p>
            <p className="text-xs text-blue-600">
              All Excel files must match your assigned format exactly. Files that don&apos;t match will be rejected.
            </p>
          </div>
          
          {loadingFormats ? (
            <div className="text-center py-8 text-gray-500">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-4">Loading your formats...</p>
            </div>
          ) : formats.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="mb-2">No formats assigned to you yet.</p>
              <p className="text-sm">Please contact your administrator to assign a format.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {formats.map((format) => (
                <div 
                  key={format._id} 
                  className={`border-2 rounded-lg p-5 hover:shadow-lg transition-all ${
                    selectedFormat?._id === format._id 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="mb-3">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{format.name}</h3>
                    {format.description && (
                      <p className="text-sm text-gray-600 mb-3">{format.description}</p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
                      <span className="bg-gray-100 px-2 py-1 rounded">{format.columns.length} columns</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        setSelectedFormat(format);
                        setShowExcelCreator(true);
                        setMessage(null);
                      }}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium flex items-center justify-center gap-2"
                    >
                      ✏️ Work with this Format
                    </button>
                  </div>
                  
                  {/* Show format example on screen */}
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-xs font-semibold text-gray-700 mb-2">Use this format like this:</p>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs border border-gray-300">
                        <thead className="bg-gray-100">
                          <tr>
                            {format.columns
                              .sort((a, b) => a.order - b.order)
                              .map((col) => (
                                <th key={col.name} className="px-2 py-1 border border-gray-300 text-left font-semibold">
                                  {col.name}
                                </th>
                              ))}
                          </tr>
                        </thead>
                        <tbody>
                          {/* Sample row 1 */}
                          <tr className="bg-white">
                            {format.columns
                              .sort((a, b) => a.order - b.order)
                              .map((col) => {
                                let sampleValue = 'Example';
                                if (col.type === 'number') sampleValue = '0';
                                else if (col.type === 'date') sampleValue = '2024-01-01';
                                else if (col.type === 'email') sampleValue = 'example@email.com';
                                else if (col.type === 'dropdown' && col.validation?.options?.[0]) {
                                  sampleValue = col.validation.options[0];
                                }
                                return (
                                  <td key={col.name} className="px-2 py-1 border border-gray-300 text-gray-600">
                                    {sampleValue}
                                  </td>
                                );
                              })}
                          </tr>
                          {/* Sample row 2 */}
                          <tr className="bg-gray-50">
                            {format.columns
                              .sort((a, b) => a.order - b.order)
                              .map((col) => {
                                let sampleValue = 'Sample';
                                if (col.type === 'number') sampleValue = '1';
                                else if (col.type === 'date') sampleValue = '2024-01-02';
                                else if (col.type === 'email') sampleValue = 'sample@email.com';
                                else if (col.type === 'dropdown' && col.validation?.options?.[1]) {
                                  sampleValue = col.validation.options[1];
                                } else if (col.type === 'dropdown' && col.validation?.options?.[0]) {
                                  sampleValue = col.validation.options[0];
                                }
                                return (
                                  <td key={col.name} className="px-2 py-1 border border-gray-300 text-gray-600">
                                    {sampleValue}
                                  </td>
                                );
                              })}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Excel Creator Section - Show when format is selected */}
        {showExcelCreator && selectedFormat && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-semibold">Create Excel File</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Working with format: <strong>{selectedFormat.name}</strong>
                </p>
              </div>
              <button
                onClick={() => {
                  setShowExcelCreator(false);
                  setSelectedFormat(null);
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md"
              >
                Close
              </button>
            </div>
            <ExcelCreator 
              labourType="OUR_LABOUR"
              useCustomFormat={true}
              formatId={selectedFormat._id}
              onFileCreated={(file) => {
                setCreatedFile(file);
                setMessage({ type: 'success', text: 'Excel file created! You can now save it or upload it below.' });
              }} 
            />
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Upload Excel File</h2>
          <div className="mb-4 p-4 bg-yellow-50 rounded-lg border border-yellow-300">
            <h3 className="font-semibold text-yellow-900 mb-2">⚠️ Format Validation Required</h3>
            <p className="text-sm text-yellow-800 mb-2">
              <strong>Your Excel file will be validated against your assigned format before upload.</strong>
            </p>
            <p className="text-sm text-yellow-700">
              If the format doesn&apos;t match, you&apos;ll see detailed errors and must fix the file before uploading.
            </p>
          </div>
          <ExcelUploadNew onUploadSuccess={fetchMyUploads} />
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">My Uploads</h2>
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : uploads.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No uploads yet. Upload your first Excel file above.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Filename</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Labour Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rows</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Processed</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Errors</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Upload Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {uploads.map((upload) => (
                    <tr key={upload._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{upload.originalFilename}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          upload.labourType === 'OUR_LABOUR' ? 'bg-blue-100 text-blue-800' :
                          upload.labourType === 'SUPPLY_LABOUR' ? 'bg-green-100 text-green-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>
                          {upload.labourType.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          upload.status === 'PROCESSED' ? 'bg-green-100 text-green-800' :
                          upload.status === 'MERGED' ? 'bg-blue-100 text-blue-800' :
                          upload.status === 'ERROR' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {upload.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{upload.rowCount}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{upload.processedCount}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{upload.errorCount}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(upload.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

