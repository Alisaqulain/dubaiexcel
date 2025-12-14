'use client';

import { useState } from 'react';
import { ProtectedRoute } from '../components/ProtectedRoute';
import Navigation from '../components/Navigation';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';

type TabType = 'upload' | 'create';

export default function ExcelInterfacePage() {
  return (
    <ProtectedRoute>
      <Navigation />
      <ExcelInterface />
    </ProtectedRoute>
  );
}

function ExcelInterface() {
  const [activeTab, setActiveTab] = useState<TabType>('upload');
  const { token } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Tab Navigation */}
          <div className="border-b border-gray-200">
            <nav className="flex space-x-1 px-4" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('upload')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'upload'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload Excel
                </div>
              </button>
              <button
                onClick={() => setActiveTab('create')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'create'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create Excel
                </div>
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'upload' && <UploadExcelSection token={token} />}
            {activeTab === 'create' && <CreateExcelSection token={token} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// Upload Excel Section
function UploadExcelSection({ token }: { token: string | null }) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setMessage(null);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setMessage({ type: 'error', text: 'Please select at least one Excel file' });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });

      const response = await fetch('/api/e1/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) {
        // Show user-friendly error message
        const errorMessage = result.message || result.error || 'Upload failed';
        throw new Error(errorMessage);
      }

      setMessage({ type: 'success', text: result.message || 'Files uploaded successfully' });
      setFiles([]);
      
      // Reset file input
      const fileInput = document.getElementById('excel-upload-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Upload failed' });
    } finally {
      setUploading(false);
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
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Upload Excel Files</h2>
        <p className="text-gray-600">Upload your Excel files (.xlsx, .xls) to process and merge attendance data.</p>
      </div>

      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
        <input
          id="excel-upload-input"
          type="file"
          multiple
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          className="hidden"
        />
        <label
          htmlFor="excel-upload-input"
          className="cursor-pointer flex flex-col items-center justify-center"
        >
          <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <span className="text-lg font-medium text-gray-700 mb-2">
            Click to select files or drag and drop
          </span>
          <span className="text-sm text-gray-500">
            Supports multiple files (.xlsx, .xls)
          </span>
        </label>
      </div>

      {files.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Selected Files ({files.length}):</h3>
          <div className="space-y-2">
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-white rounded-md border border-gray-200"
              >
                <div className="flex items-center gap-3">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{file.name}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setFiles(files.filter((_, i) => i !== index));
                    const fileInput = document.getElementById('excel-upload-input') as HTMLInputElement;
                    if (fileInput) fileInput.value = '';
                  }}
                  className="text-red-600 hover:text-red-800 p-1"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={uploading || files.length === 0}
        className="w-full bg-blue-600 text-white py-3 px-6 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-lg transition-colors"
      >
        {uploading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Uploading...
          </span>
        ) : (
          'Upload Files'
        )}
      </button>

      {message && (
        <div className={`p-4 rounded-md ${
          message.type === 'success'
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-yellow-50 text-yellow-800 border border-yellow-200'
        }`}>
          <div className="flex items-start gap-3">
            {message.type === 'success' ? (
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            <div className="flex-1">
              <p className="font-medium">{message.text}</p>
              {message.type === 'error' && (
                <p className="text-sm mt-1 text-yellow-700">
                  If you need access to this feature, please contact your administrator.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Create Excel Section
function CreateExcelSection({ token }: { token: string | null }) {
  const [rows, setRows] = useState<Array<Array<string>>>([['']]);
  const [fileName, setFileName] = useState('NewSpreadsheet');
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const addRow = () => {
    const newRow = Array(rows[0]?.length || 1).fill('');
    setRows([...rows, newRow]);
  };

  const addColumn = () => {
    setRows(rows.map(row => [...row, '']));
  };

  const deleteRow = (rowIndex: number) => {
    if (rows.length > 1) {
      setRows(rows.filter((_, i) => i !== rowIndex));
    }
  };

  const deleteColumn = (colIndex: number) => {
    setRows(rows.map(row => row.filter((_, i) => i !== colIndex)));
  };

  const updateCell = (rowIndex: number, colIndex: number, value: string) => {
    const newRows = [...rows];
    if (!newRows[rowIndex]) {
      newRows[rowIndex] = [];
    }
    newRows[rowIndex][colIndex] = value;
    setRows(newRows);
  };

  const saveAndDownload = async () => {
    setCreating(true);
    setMessage(null);

    try {
      // First save to database
      const saveResponse = await fetch('/api/excel/save', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: fileName || 'NewSpreadsheet',
          rows: rows,
        }),
      });

      const saveResult = await saveResponse.json();

      if (!saveResponse.ok) {
        throw new Error(saveResult.error || 'Failed to save file');
      }

      // Then create and download
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);

      const colWidths = rows[0]?.map((_, colIndex) => {
        const maxLength = Math.max(
          ...rows.map(row => (row[colIndex] || '').toString().length),
          10
        );
        return { wch: Math.min(maxLength + 2, 50) };
      }) || [];
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      XLSX.writeFile(wb, `${fileName || 'NewSpreadsheet'}.xlsx`);

      setMessage({ 
        type: 'success', 
        text: 'Excel file saved and downloaded successfully! Admin can now see this file.' 
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save Excel file' });
    } finally {
      setCreating(false);
    }
  };

  const clearAll = () => {
    if (confirm('Are you sure you want to clear all data?')) {
      setRows([['']]);
      setMessage(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Create Excel File</h2>
        <p className="text-gray-600">Create a new Excel file by entering data in the table below.</p>
      </div>

      {/* File Name Input */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">File Name:</label>
        <input
          type="text"
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter file name"
        />
        <span className="text-sm text-gray-500">.xlsx</span>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={addRow}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium"
        >
          + Add Row
        </button>
        <button
          onClick={addColumn}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium"
        >
          + Add Column
        </button>
        <button
          onClick={clearAll}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium"
        >
          Clear All
        </button>
        <button
          onClick={saveAndDownload}
          disabled={creating}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium ml-auto"
        >
          {creating ? 'Saving...' : 'Save & Download Excel'}
        </button>
      </div>

      {/* Spreadsheet Table */}
      <div className="border border-gray-300 rounded-lg overflow-auto max-h-[600px]">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 sticky top-0 z-10">
              <th className="border border-gray-300 px-2 py-2 text-xs font-medium text-gray-700 w-12 bg-gray-200 sticky left-0 z-20">
                #
              </th>
              {rows[0]?.map((_, colIndex) => (
                <th
                  key={colIndex}
                  className="border border-gray-300 px-2 py-2 text-xs font-medium text-gray-700 bg-gray-100 relative group min-w-[120px]"
                >
                  <div className="flex items-center justify-between">
                    <span>{(() => {
                      let colName = '';
                      let num = colIndex;
                      while (num >= 0) {
                        colName = String.fromCharCode(65 + (num % 26)) + colName;
                        num = Math.floor(num / 26) - 1;
                      }
                      return colName;
                    })()}</span>
                    {rows[0].length > 1 && (
                      <button
                        onClick={() => deleteColumn(colIndex)}
                        className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800 text-xs font-bold"
                        title="Delete column"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-gray-50">
                <td className="border border-gray-300 px-2 py-1 text-xs text-gray-600 bg-gray-50 sticky left-0 z-10 text-center group">
                  <div className="flex items-center justify-between">
                    <span>{rowIndex + 1}</span>
                    {rows.length > 1 && (
                      <button
                        onClick={() => deleteRow(rowIndex)}
                        className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800 text-xs font-bold"
                        title="Delete row"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </td>
                {row.map((cell, colIndex) => (
                  <td key={colIndex} className="border border-gray-300 p-0">
                    <input
                      type="text"
                      value={cell}
                      onChange={(e) => updateCell(rowIndex, colIndex, e.target.value)}
                      className="w-full px-2 py-1 text-sm outline-none focus:bg-blue-50 focus:ring-1 focus:ring-blue-500"
                      placeholder="Enter data..."
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {message && (
        <div className={`p-4 rounded-md ${
          message.type === 'success'
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-yellow-50 text-yellow-800 border border-yellow-200'
        }`}>
          <div className="flex items-start gap-3">
            {message.type === 'success' ? (
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            <div className="flex-1">
              <p className="font-medium">{message.text}</p>
              {message.type === 'error' && (
                <p className="text-sm mt-1 text-yellow-700">
                  If you need access to this feature, please contact your administrator.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

