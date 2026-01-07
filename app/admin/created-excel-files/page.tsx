'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';

interface ExcelFormat {
  _id: string;
  name: string;
  description?: string;
  assignedToType: 'all' | 'employee' | 'user' | 'none';
  assignedTo?: string[];
}

interface CreatedExcelFile {
  _id: string;
  filename: string;
  originalFilename: string;
  labourType: 'OUR_LABOUR' | 'SUPPLY_LABOUR' | 'SUBCONTRACTOR';
  rowCount: number;
  createdBy: {
    _id: string;
    name?: string;
    email?: string;
  } | string;
  createdByName?: string;
  createdByEmail?: string;
  isMerged?: boolean;
  mergedFrom?: string[];
  mergedDate?: string;
  createdAt: string;
}

export default function CreatedExcelFilesPage() {
  return (
    <ProtectedRoute requireAdmin>
      <Navigation />
      <CreatedExcelFilesComponent />
    </ProtectedRoute>
  );
}

function CreatedExcelFilesComponent() {
  const { token } = useAuth();
  const [files, setFiles] = useState<CreatedExcelFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'OUR_LABOUR' | 'SUPPLY_LABOUR' | 'SUBCONTRACTOR'>('all');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [merging, setMerging] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (token) {
      fetchFiles();
    }
  }, [filter, token]);

  const fetchFiles = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const url = filter === 'all' 
        ? '/api/admin/created-excel-files'
        : `/api/admin/created-excel-files?labourType=${filter}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setFiles(result.data || []);
      } else {
        console.error('Failed to fetch files:', result.error);
        setFiles([]);
      }
    } catch (error: any) {
      console.error('Error fetching files:', error);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (fileId: string, filename: string) => {
    try {
      setDownloading(fileId);
      const response = await fetch(`/api/admin/created-excel-files/${fileId}/download`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to download file');
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
    } catch (error: any) {
      console.error('Error downloading file:', error);
      alert('Failed to download file: ' + error.message);
    } finally {
      setDownloading(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getLabourTypeBadge = (labourType: string) => {
    const colors: Record<string, string> = {
      OUR_LABOUR: 'bg-blue-100 text-blue-800',
      SUPPLY_LABOUR: 'bg-green-100 text-green-800',
      SUBCONTRACTOR: 'bg-purple-100 text-purple-800',
    };
    return colors[labourType] || 'bg-gray-100 text-gray-800';
  };

  const handleToggleSelect = (fileId: string) => {
    setSelectedFiles(prev =>
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const handleSelectAll = () => {
    if (selectedFiles.length === files.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(files.map(f => f._id));
    }
  };

  const handleMerge = async () => {
    if (selectedFiles.length === 0) {
      setMessage({ type: 'error', text: 'Please select at least one file to merge' });
      return;
    }

    setMerging(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/created-excel-files/merge', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileIds: selectedFiles }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to merge files');
      }

      // Download the merged file using the download URL
      if (result.data && result.data.id) {
        const downloadResponse = await fetch(`/api/admin/created-excel-files/${result.data.id}/download`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (downloadResponse.ok) {
          const blob = await downloadResponse.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = result.data.filename || `merged_excel_files_${Date.now()}.xlsx`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        }
      }

      setMessage({ type: 'success', text: `Successfully merged ${selectedFiles.length} files! The merged file has been saved and is available in the list.` });
      setSelectedFiles([]);
      // Refresh the file list to show the new merged file
      fetchFiles();
    } catch (error: any) {
      console.error('Error merging files:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to merge files' });
    } finally {
      setMerging(false);
    }
  };

  const handleDelete = async (fileId: string, filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
      return;
    }

    setDeleting(fileId);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/created-excel-files/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setMessage({ type: 'success', text: 'File deleted successfully' });
        setSelectedFiles(prev => prev.filter(id => id !== fileId));
        fetchFiles();
      } else {
        throw new Error(result.error || 'Failed to delete file');
      }
    } catch (error: any) {
      console.error('Error deleting file:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to delete file' });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Created Excel Files</h1>
              <p className="text-gray-600">View all Excel files created by employees</p>
            </div>
            <div className="flex gap-2">
              {selectedFiles.length > 0 && (
                <button
                  onClick={handleMerge}
                  disabled={merging}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {merging ? 'Merging...' : `🔀 Merge Selected (${selectedFiles.length})`}
                </button>
              )}
              <button
                onClick={fetchFiles}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🔄 Refresh
              </button>
            </div>
          </div>
        </div>

        {message && (
          <div className={`mb-4 p-3 rounded ${
            message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        {/* Format Assignment Management */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Excel Format Assignment Management</h2>
          <FormatAssignmentSection token={token} />
        </div>

        {/* Filter */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filter by Labour Type
          </label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Types</option>
            <option value="OUR_LABOUR">Our Labour</option>
            <option value="SUPPLY_LABOUR">Supply Labour</option>
            <option value="SUBCONTRACTOR">Subcontractor</option>
          </select>
        </div>

        {/* Files List */}
        {loading ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading files...</p>
          </div>
        ) : files.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <p className="text-gray-600 text-lg">No Excel files found</p>
            <p className="text-gray-500 mt-2">Files created by employees will appear here</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedFiles.length === files.length && files.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Filename
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Labour Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Rows
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created By (Username)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created At
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {files.map((file) => {
                    // Priority: createdByName > createdBy.name > createdByEmail > createdBy.email
                    const createdByName = file.createdByName 
                      || (typeof file.createdBy === 'object' && file.createdBy?.name)
                      || file.createdByEmail
                      || (typeof file.createdBy === 'object' && file.createdBy?.email)
                      || 'Unknown';
                    
                    const createdByEmail = file.createdByEmail 
                      || (typeof file.createdBy === 'object' && file.createdBy?.email)
                      || '';
                    
                    // Show name if available, otherwise show email/empId
                    const displayName = file.createdByName || (typeof file.createdBy === 'object' && file.createdBy?.name) || createdByEmail || 'Unknown';

                    return (
                      <tr key={file._id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={selectedFiles.includes(file._id)}
                            onChange={() => handleToggleSelect(file._id)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {file.originalFilename}
                          </div>
                          {file.isMerged && file.mergedDate && (
                            <div className="text-xs text-gray-500 mt-1">
                              Merged: {formatDate(file.mergedDate)}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {file.isMerged ? (
                            <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                              🔀 Merged
                            </span>
                          ) : (
                            <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                              📄 Original
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getLabourTypeBadge(file.labourType)}`}>
                            {file.labourType.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {file.rowCount}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{displayName}</div>
                          {createdByEmail && createdByEmail !== displayName && (
                            <div className="text-sm text-gray-500">{createdByEmail}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>{formatDate(file.createdAt)}</div>
                          {file.isMerged && file.mergedFrom && file.mergedFrom.length > 0 && (
                            <div className="text-xs text-gray-400 mt-1">
                              From {file.mergedFrom.length} file{file.mergedFrom.length > 1 ? 's' : ''}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex gap-3">
                            <button
                              onClick={() => handleDownload(file._id, file.originalFilename)}
                              disabled={downloading === file._id}
                              className="text-blue-600 hover:text-blue-900 disabled:text-gray-400 disabled:cursor-not-allowed"
                            >
                              {downloading === file._id ? 'Downloading...' : '📥 Download'}
                            </button>
                            <button
                              onClick={() => handleDelete(file._id, file.originalFilename)}
                              disabled={deleting === file._id}
                              className="text-red-600 hover:text-red-900 disabled:text-gray-400 disabled:cursor-not-allowed"
                            >
                              {deleting === file._id ? 'Deleting...' : '🗑️ Delete'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FormatAssignmentSection({ token }: { token: string | null }) {
  const [formats, setFormats] = useState<ExcelFormat[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (token) {
      fetchFormats();
    }
  }, [token]);

  const fetchFormats = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/excel-formats', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const result = await response.json();
      if (result.success) {
        setFormats(result.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch formats:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateAssignment = async (formatId: string, assignmentType: 'all' | 'none') => {
    if (!token) return;

    setUpdating(formatId);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/excel-formats/${formatId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assignedToType: assignmentType === 'none' ? 'employee' : assignmentType,
          assignedTo: assignmentType === 'none' ? [] : undefined,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setMessage({ type: 'success', text: `Format assignment updated successfully` });
        fetchFormats();
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to update assignment' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update assignment' });
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return <div className="text-center py-4 text-gray-500">Loading formats...</div>;
  }

  return (
    <div>
      {message && (
        <div className={`mb-4 p-3 rounded ${
          message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      {formats.length === 0 ? (
        <div className="text-center py-4 text-gray-500">No formats available</div>
      ) : (
        <div className="space-y-3">
          {formats.map((format) => {
            const isAssignedToAll = format.assignedToType === 'all';
            const isAssignedToSpecific = (format.assignedToType === 'employee' || format.assignedToType === 'user') && (format.assignedTo?.length || 0) > 0;
            const isNotAssigned = !isAssignedToAll && !isAssignedToSpecific;
            
            return (
              <div key={format._id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{format.name}</div>
                  {format.description && (
                    <div className="text-sm text-gray-500">{format.description}</div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    Current: {isAssignedToAll ? 'Assigned to All' : 
                              isAssignedToSpecific ? `Assigned to ${format.assignedTo?.length || 0} ${format.assignedToType}s` :
                              'Not assigned to anyone'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdateAssignment(format._id, 'all')}
                    disabled={updating === format._id || isAssignedToAll}
                    className={`px-3 py-1 text-sm rounded ${
                      isAssignedToAll 
                        ? 'bg-green-100 text-green-700 cursor-not-allowed' 
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    } disabled:opacity-50`}
                  >
                    Assign to All
                  </button>
                  <button
                    onClick={() => handleUpdateAssignment(format._id, 'none')}
                    disabled={updating === format._id || isNotAssigned}
                    className={`px-3 py-1 text-sm rounded ${
                      isNotAssigned 
                        ? 'bg-gray-100 text-gray-500 cursor-not-allowed' 
                        : 'bg-red-600 text-white hover:bg-red-700'
                    } disabled:opacity-50`}
                  >
                    {updating === format._id ? 'Updating...' : 'Not Assign to Anyone'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

