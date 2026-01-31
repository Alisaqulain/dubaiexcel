'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';

interface AttendanceStats {
  present: number;
  absent: number;
  other: number;
  total: number;
  otherValues?: { [key: string]: number };
}

interface FileAnalysis {
  hasAttendanceColumn: boolean;
  attendanceColumn?: string;
  attendanceStats?: AttendanceStats;
}

export default function CreatedExcelFilesPage() {
  return (
    <ProtectedRoute requireAdmin>
      <Navigation />
      <CreatedExcelFilesComponent />
    </ProtectedRoute>
  );
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

function CreatedExcelFilesComponent() {
  const { token } = useAuth();
  const [files, setFiles] = useState<CreatedExcelFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [merging, setMerging] = useState(false);
  const [filterLabourType, setFilterLabourType] = useState<string>('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [analyzingFileId, setAnalyzingFileId] = useState<string | null>(null);
  const [fileAnalyses, setFileAnalyses] = useState<{ [fileId: string]: FileAnalysis }>({});
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);
  const [mergeAttendanceStats, setMergeAttendanceStats] = useState<AttendanceStats | null>(null);

  useEffect(() => {
    fetchFiles();
  }, [filterLabourType]);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const url = filterLabourType 
        ? `/api/admin/created-excel-files?labourType=${filterLabourType}`
        : '/api/admin/created-excel-files';
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const result = await response.json();
      if (result.success) {
        setFiles(result.data || []);
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to fetch files' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to fetch files' });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelect = (fileId: string) => {
    // Don't allow selecting merged files for merging
    const file = files.find(f => f._id === fileId);
    if (file?.isMerged) return;

    setSelectedFiles(prev =>
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const handleDownload = async (fileId: string, filename: string) => {
    try {
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
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to download file' });
    }
  };

  const handleAnalyze = async (fileId: string) => {
    try {
      setAnalyzingFileId(fileId);
      setMessage(null);
      
      const response = await fetch(`/api/admin/created-excel-files/${fileId}/analyze`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setFileAnalyses(prev => ({
          ...prev,
          [fileId]: result.data,
        }));
        setExpandedFileId(fileId);
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to analyze file' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to analyze file' });
    } finally {
      setAnalyzingFileId(null);
    }
  };

  const handleDelete = async (fileId: string) => {
    if (!confirm('Are you sure you want to delete this file?')) {
      return;
    }

    try {
      setDeleting(true);
      const response = await fetch(`/api/admin/created-excel-files/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setMessage({ type: 'success', text: 'File deleted successfully' });
        fetchFiles();
        setSelectedFiles(prev => prev.filter(id => id !== fileId));
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to delete file' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to delete file' });
    } finally {
      setDeleting(false);
    }
  };

  const handleMerge = async () => {
    if (selectedFiles.length < 2) {
      setMessage({ type: 'error', text: 'Please select at least 2 files to merge' });
      return;
    }

    // Check if all selected files have the same labour type (warning, not error)
    const selectedFileObjects = files.filter(f => selectedFiles.includes(f._id));
    const labourTypes = Array.from(new Set(selectedFileObjects.map(f => f.labourType)));
    if (labourTypes.length > 1) {
      if (!confirm(`Warning: Selected files have different labour types (${labourTypes.join(', ')}). They will still be merged. Continue?`)) {
        return;
      }
    }

    if (!confirm(`Are you sure you want to merge ${selectedFiles.length} files?`)) {
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
      if (result.success) {
        let successMessage = result.message || 'Successfully merged files';
        
        // Store attendance stats for display
        if (result.data?.attendanceAnalysis) {
          setMergeAttendanceStats(result.data.attendanceAnalysis);
          const stats = result.data.attendanceAnalysis;
          successMessage = `Successfully merged ${selectedFiles.length} files into one file with ${result.data.mergedFile.rowCount} rows.`;
        } else {
          setMergeAttendanceStats(null);
        }
        
        setMessage({ type: 'success', text: successMessage });
        setSelectedFiles([]);
        fetchFiles();
        
        // Auto-analyze the merged file if attendance data exists
        if (result.data?.mergedFile?.id && result.data?.attendanceAnalysis) {
          setTimeout(() => {
            handleAnalyze(result.data.mergedFile.id);
          }, 1000);
        }
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to merge files' });
        setMergeAttendanceStats(null);
      }
    } catch (err: any) {
      console.error('Merge error:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to merge files. Please check the console for details.' });
    } finally {
      setMerging(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedFiles.length === 0) {
      setMessage({ type: 'error', text: 'Please select files to delete' });
      return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedFiles.length} file(s)?`)) {
      return;
    }

    setDeleting(true);
    setMessage(null);

    try {
      const deletePromises = selectedFiles.map(async (fileId) => {
        const response = await fetch(`/api/admin/created-excel-files/${fileId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        return { fileId, response };
      });

      const results = await Promise.all(deletePromises);
      const jsonResults = await Promise.all(
        results.map(async ({ fileId, response }) => ({
          fileId,
          result: await response.json(),
          status: response.status,
        }))
      );
      
      const failed = jsonResults.filter(r => !r.result.success);
      const succeeded = jsonResults.filter(r => r.result.success);
      
      if (failed.length === 0) {
        setMessage({ type: 'success', text: `Successfully deleted ${selectedFiles.length} file(s)` });
        setSelectedFiles([]);
        fetchFiles();
      } else {
        const errorMessages = failed.map(f => f.result.error || 'Unknown error').join('; ');
        setMessage({ 
          type: 'error', 
          text: `Failed to delete ${failed.length} file(s). ${succeeded.length} file(s) deleted successfully. Errors: ${errorMessages}` 
        });
        // Refresh to update the list
        fetchFiles();
        // Remove successfully deleted files from selection
        setSelectedFiles(failed.map(f => f.fileId));
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to delete files' });
    } finally {
      setDeleting(false);
    }
  };

  const getCreatorName = (file: CreatedExcelFile) => {
    if (file.createdByName) return file.createdByName;
    if (typeof file.createdBy === 'object' && file.createdBy?.name) return file.createdBy.name;
    return 'Unknown';
  };

  const getCreatorEmail = (file: CreatedExcelFile) => {
    if (file.createdByEmail) return file.createdByEmail;
    if (typeof file.createdBy === 'object' && file.createdBy?.email) return file.createdBy.email;
    if (typeof file.createdBy === 'string') return file.createdBy;
    return 'Unknown';
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
          <h1 className="text-3xl font-bold">Created Excel Files</h1>
          <div className="flex gap-2">
            <button
              onClick={handleMerge}
              disabled={merging || selectedFiles.length < 2}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {merging ? 'Merging...' : `Merge Selected (${selectedFiles.length})`}
            </button>
            <button
              onClick={handleDeleteSelected}
              disabled={deleting || selectedFiles.length === 0}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : `Delete Selected (${selectedFiles.length})`}
            </button>
          </div>
        </div>

        {/* Filter */}
        <div className="mb-4">
          <label className="mr-2">Filter by Labour Type:</label>
          <select
            value={filterLabourType}
            onChange={(e) => setFilterLabourType(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-md"
          >
            <option value="">All</option>
            <option value="OUR_LABOUR">Our Labour</option>
            <option value="SUPPLY_LABOUR">Supply Labour</option>
            <option value="SUBCONTRACTOR">Subcontractor</option>
          </select>
        </div>

        {message && (
          <div className={`mb-4 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            <div className="font-semibold mb-2">{message.text}</div>
            {mergeAttendanceStats && message.type === 'success' && (
              <div className="mt-4 pt-4 border-t border-green-300">
                <h4 className="font-semibold mb-3 text-green-900">📊 Merged File Attendance Analysis</h4>
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-green-100 p-4 rounded-lg border border-green-300">
                    <div className="text-3xl font-bold text-green-700">
                      {mergeAttendanceStats.present}
                    </div>
                    <div className="text-sm text-green-600 font-medium">Present</div>
                    {mergeAttendanceStats.total > 0 && (
                      <div className="text-xs text-green-500 mt-1">
                        {((mergeAttendanceStats.present / mergeAttendanceStats.total) * 100).toFixed(1)}%
                      </div>
                    )}
                  </div>
                  <div className="bg-red-100 p-4 rounded-lg border border-red-300">
                    <div className="text-3xl font-bold text-red-700">
                      {mergeAttendanceStats.absent}
                    </div>
                    <div className="text-sm text-red-600 font-medium">Absent</div>
                    {mergeAttendanceStats.total > 0 && (
                      <div className="text-xs text-red-500 mt-1">
                        {((mergeAttendanceStats.absent / mergeAttendanceStats.total) * 100).toFixed(1)}%
                      </div>
                    )}
                  </div>
                  <div className="bg-yellow-100 p-4 rounded-lg border border-yellow-300">
                    <div className="text-3xl font-bold text-yellow-700">
                      {mergeAttendanceStats.other}
                    </div>
                    <div className="text-sm text-yellow-600 font-medium">Other</div>
                    {mergeAttendanceStats.total > 0 && (
                      <div className="text-xs text-yellow-500 mt-1">
                        {((mergeAttendanceStats.other / mergeAttendanceStats.total) * 100).toFixed(1)}%
                      </div>
                    )}
                  </div>
                  <div className="bg-gray-100 p-4 rounded-lg border border-gray-300">
                    <div className="text-3xl font-bold text-gray-700">
                      {mergeAttendanceStats.total}
                    </div>
                    <div className="text-sm text-gray-600 font-medium">Total</div>
                  </div>
                </div>
                {mergeAttendanceStats.otherValues && Object.keys(mergeAttendanceStats.otherValues).length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-green-800 mb-2">Other Attendance Values:</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(mergeAttendanceStats.otherValues).map(([value, count]) => (
                        <span key={value} className="px-3 py-1 bg-white border border-green-200 rounded text-sm text-green-700">
                          {value}: {count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedFiles.length === files.filter(f => !f.isMerged).length && files.filter(f => !f.isMerged).length > 0}
                    onChange={(e) => {
                      const selectableFiles = files.filter(f => !f.isMerged);
                      if (e.target.checked) {
                        setSelectedFiles(selectableFiles.map(f => f._id));
                      } else {
                        setSelectedFiles([]);
                      }
                    }}
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Filename</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created By</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Labour Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rows</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {files.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-4 text-center text-gray-500">
                    No files found
                  </td>
                </tr>
              ) : (
                files.map((file) => (
                  <>
                  <tr key={file._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedFiles.includes(file._id)}
                        onChange={() => handleToggleSelect(file._id)}
                        disabled={file.isMerged}
                      />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{file.originalFilename}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div>{getCreatorName(file)}</div>
                      <div className="text-xs text-gray-500">{getCreatorEmail(file)}</div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        file.labourType === 'OUR_LABOUR' ? 'bg-blue-100 text-blue-800' :
                        file.labourType === 'SUPPLY_LABOUR' ? 'bg-green-100 text-green-800' :
                        'bg-purple-100 text-purple-800'
                      }`}>
                        {file.labourType.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{file.rowCount}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        file.isMerged ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {file.isMerged ? 'Merged' : 'Original'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(file.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAnalyze(file._id)}
                          disabled={analyzingFileId === file._id}
                          className="text-purple-600 hover:text-purple-800 disabled:opacity-50"
                        >
                          {analyzingFileId === file._id ? 'Analyzing...' : 'Analyze'}
                        </button>
                        <button
                          onClick={() => handleDownload(file._id, file.originalFilename)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          Download
                        </button>
                        <button
                          onClick={() => handleDelete(file._id)}
                          disabled={deleting}
                          className="text-red-600 hover:text-red-800 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedFileId === file._id && fileAnalyses[file._id] && (
                    <tr>
                      <td colSpan={8} className="px-6 py-4 bg-gray-50">
                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                          <h4 className="font-semibold mb-3">File Analysis</h4>
                          {fileAnalyses[file._id].hasAttendanceColumn ? (
                            <div>
                              <p className="text-sm text-gray-600 mb-2">
                                <strong>Attendance Column Found:</strong> {fileAnalyses[file._id].attendanceColumn}
                              </p>
                              {fileAnalyses[file._id].attendanceStats && (
                                <div className="grid grid-cols-4 gap-4">
                                  <div className="bg-green-50 p-3 rounded">
                                    <div className="text-2xl font-bold text-green-700">
                                      {fileAnalyses[file._id].attendanceStats!.present}
                                    </div>
                                    <div className="text-sm text-green-600">Present</div>
                                  </div>
                                  <div className="bg-red-50 p-3 rounded">
                                    <div className="text-2xl font-bold text-red-700">
                                      {fileAnalyses[file._id].attendanceStats!.absent}
                                    </div>
                                    <div className="text-sm text-red-600">Absent</div>
                                  </div>
                                  <div className="bg-yellow-50 p-3 rounded">
                                    <div className="text-2xl font-bold text-yellow-700">
                                      {fileAnalyses[file._id].attendanceStats!.other}
                                    </div>
                                    <div className="text-sm text-yellow-600">Other</div>
                                  </div>
                                  <div className="bg-gray-50 p-3 rounded">
                                    <div className="text-2xl font-bold text-gray-700">
                                      {fileAnalyses[file._id].attendanceStats!.total}
                                    </div>
                                    <div className="text-sm text-gray-600">Total</div>
                                  </div>
                                </div>
                              )}
                              {fileAnalyses[file._id].attendanceStats?.otherValues && 
                               Object.keys(fileAnalyses[file._id].attendanceStats!.otherValues!).length > 0 && (
                                <div className="mt-3">
                                  <p className="text-sm font-medium mb-2">Other Values:</p>
                                  <div className="flex flex-wrap gap-2">
                                    {Object.entries(fileAnalyses[file._id].attendanceStats!.otherValues!).map(([value, count]) => (
                                      <span key={value} className="px-2 py-1 bg-gray-100 rounded text-sm">
                                        {value}: {count}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-600">
                              No attendance column found in this file.
                            </p>
                          )}
                          <button
                            onClick={() => setExpandedFileId(null)}
                            className="mt-3 text-sm text-gray-500 hover:text-gray-700"
                          >
                            Hide Analysis
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
