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
  mergeCount?: number; // Number of times this file has been used in merges
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
  const [showMergeFilenameModal, setShowMergeFilenameModal] = useState(false);
  const [mergeFilename, setMergeFilename] = useState('');
  const [activeTab, setActiveTab] = useState<'original' | 'merged'>('original'); // Tab to filter files
  const [viewingFileId, setViewingFileId] = useState<string | null>(null);
  const [fileData, setFileData] = useState<any[]>([]);

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
        // Ensure mergeCount is set for all files (default to 0 if missing)
        const filesWithMergeCount = (result.data || []).map((file: any) => ({
          ...file,
          mergeCount: file.mergeCount ?? 0,
        }));
        console.log('Fetched files with mergeCount:', filesWithMergeCount.map((f: any) => ({ 
          filename: f.originalFilename, 
          mergeCount: f.mergeCount 
        })));
        setFiles(filesWithMergeCount);
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
    // Allow selecting all files (including merged) for deletion
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

  const handleMergeClick = () => {
    // Allow merging any files (original or merged) - need at least 1 file
    const mergeableFiles = files.filter(f => selectedFiles.includes(f._id));
    
    if (mergeableFiles.length < 1) {
      setMessage({ type: 'error', text: 'Please select at least 1 file to merge' });
      return;
    }

    // Show filename input modal
    setMergeFilename('');
    setShowMergeFilenameModal(true);
  };

  const handleMerge = async () => {
    // Allow merging any files (original or merged) - need at least 1 file
    const mergeableFiles = files.filter(f => selectedFiles.includes(f._id));
    
    if (mergeableFiles.length < 1) {
      setMessage({ type: 'error', text: 'Please select at least 1 file to merge' });
      return;
    }

    // Check if all selected files have the same labour type (warning, not error)
    const labourTypes = Array.from(new Set(mergeableFiles.map(f => f.labourType)));
    if (labourTypes.length > 1) {
      if (!confirm(`Warning: Selected files have different labour types (${labourTypes.join(', ')}). They will still be merged. Continue?`)) {
        return;
      }
    }

    // Close modal
    setShowMergeFilenameModal(false);

    setMerging(true);
    setMessage(null);

    try {
      // Only send mergeable file IDs (exclude merged files)
      const mergeableFileIds = mergeableFiles.map(f => f._id);
      
      const response = await fetch('/api/admin/created-excel-files/merge', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          fileIds: mergeableFileIds,
          mergedFilename: mergeFilename.trim() || undefined, // Send custom filename if provided
        }),
      });

      const result = await response.json();
      
      // Check HTTP status - 400 means validation failed
      if (!response.ok || !result.success) {
        if (result.validationError || response.status === 400) {
          const duplicateErrors = result.duplicateErrors || [];
          const dropdownErrors = result.dropdownErrors || [];
          const errorMsg = result.error || 'Validation failed';
          
          if (duplicateErrors.length > 0) {
            const duplicateMsg = `❌ MERGE FAILED - DUPLICATE VALUES DETECTED!\n\n${duplicateErrors.map((err: string) => `• ${err}`).join('\n')}\n\nFiles were NOT merged. Please remove duplicates and try again.`;
            alert(duplicateMsg);
            setMessage({ 
              type: 'error', 
              text: `Merge failed: Duplicate values found in unique columns. ${duplicateErrors.length} error(s).` 
            });
          } else if (dropdownErrors.length > 0) {
            const dropdownMsg = `❌ MERGE FAILED - INVALID DROPDOWN VALUES DETECTED!\n\n${dropdownErrors.map((err: string) => `• ${err}`).join('\n')}\n\nFiles were NOT merged. Please use only allowed dropdown options and try again.`;
            alert(dropdownMsg);
            setMessage({ 
              type: 'error', 
              text: `Merge failed: Invalid dropdown values found. ${dropdownErrors.length} error(s).` 
            });
          } else {
            alert(`❌ MERGE FAILED\n\n${errorMsg}\n\nFiles were NOT merged.`);
            setMessage({ type: 'error', text: errorMsg });
          }
          setMergeAttendanceStats(null);
          setMerging(false);
          return; // Stop here - don't merge
        } else {
          alert(`❌ MERGE FAILED\n\n${result.error || 'Failed to merge files'}\n\nFiles were NOT merged.`);
          setMessage({ type: 'error', text: result.error || 'Failed to merge files' });
          setMergeAttendanceStats(null);
          setMerging(false);
          return;
        }
      }
      
      if (result.success) {
        let successMessage = result.message || 'Successfully merged files';
        
        // Store attendance stats for display
        if (result.data?.attendanceAnalysis) {
          setMergeAttendanceStats(result.data.attendanceAnalysis);
        } else {
          setMergeAttendanceStats(null);
        }
        
        // Show message about duplicates removed if any
        if (result.data?.duplicatesRemoved > 0) {
          successMessage += `\n\n⚠️ Note: ${result.data.duplicatesRemoved} duplicate row(s) were automatically removed from unique columns during merge to prevent duplicates.`;
          alert(`✅ Merge Successful!\n\n${successMessage}`);
        }
        
        setMessage({ type: 'success', text: successMessage });
        setSelectedFiles([]);
        setMergeFilename(''); // Clear filename after successful merge
        fetchFiles();
        
        // Auto-analyze the merged file if attendance data exists
        if (result.data?.mergedFile?.id && result.data?.attendanceAnalysis) {
          setTimeout(() => {
            handleAnalyze(result.data.mergedFile.id);
          }, 1000);
        }
      }
    } catch (err: any) {
      console.error('Merge error:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to merge files. Please check the console for details.' });
    } finally {
      setMerging(false);
    }
  };

  const handleCancelMerge = () => {
    setShowMergeFilenameModal(false);
    setMergeFilename('');
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

  const handleViewFile = async (fileId: string) => {
    try {
      const response = await fetch(`/api/admin/created-excel-files/${fileId}/view`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const result = await response.json();
      if (result.success) {
        setFileData(result.data.data || []);
        setViewingFileId(fileId);
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to load file' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load file' });
    }
  };

  // Filter files based on active tab, but allow cross-tab selection
  const filteredFiles = files.filter(file => {
    if (activeTab === 'merged') {
      return file.isMerged === true;
    } else {
      return file.isMerged !== true;
    }
  });

  // Get all files for merge operations (across both tabs)
  const allFilesForMerge = files;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Created Excel Files</h1>
          <div className="flex gap-2">
            <button
              onClick={handleMergeClick}
              disabled={merging || selectedFiles.length < 1}
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

        {/* Tabs to separate original and merged files */}
        <div className="mb-4 flex gap-2 border-b border-gray-200">
          <button
            onClick={() => {
              setActiveTab('original');
              // Don't clear selection - allow cross-tab selection
            }}
            className={`px-4 py-2 font-medium ${
              activeTab === 'original'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Original Files ({files.filter(f => !f.isMerged).length})
          </button>
          <button
            onClick={() => {
              setActiveTab('merged');
              // Don't clear selection - allow cross-tab selection
            }}
            className={`px-4 py-2 font-medium ${
              activeTab === 'merged'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Merged Files ({files.filter(f => f.isMerged).length})
          </button>
          {selectedFiles.length > 0 && (
            <div className="ml-auto flex items-center gap-2 text-sm text-gray-600">
              <span>Selected: {selectedFiles.length} file(s)</span>
              <button
                onClick={() => setSelectedFiles([])}
                className="text-red-600 hover:text-red-800 text-xs underline"
              >
                Clear Selection
              </button>
            </div>
          )}
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
                    checked={filteredFiles.length > 0 && filteredFiles.every(f => selectedFiles.includes(f._id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        // Add all files from current tab to selection (don't remove files from other tab)
                        const currentTabFileIds = filteredFiles.map(f => f._id);
                        setSelectedFiles(prev => {
                          const newSelection = [...prev];
                          currentTabFileIds.forEach(id => {
                            if (!newSelection.includes(id)) {
                              newSelection.push(id);
                            }
                          });
                          return newSelection;
                        });
                      } else {
                        // Remove only files from current tab from selection
                        const currentTabFileIds = filteredFiles.map(f => f._id);
                        setSelectedFiles(prev => prev.filter(id => !currentTabFileIds.includes(id)));
                      }
                    }}
                    title="Select all files in this tab"
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
              {filteredFiles.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-4 text-center text-gray-500">
                    No {activeTab === 'merged' ? 'merged' : 'original'} files found
                  </td>
                </tr>
              ) : (
                filteredFiles.map((file) => (
                  <>
                  <tr key={file._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedFiles.includes(file._id)}
                        onChange={() => handleToggleSelect(file._id)}
                        title={file.isMerged ? 'Merged file - can be merged again' : 'Original file'}
                      />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="flex items-center gap-2">
                        <span>{file.originalFilename}</span>
                        {(file.mergeCount ?? 0) > 0 && (
                          <span 
                            className="flex items-center gap-0.5" 
                            title={`This file has been used in ${file.mergeCount} merge operation(s)`}
                          >
                            {Array.from({ length: file.mergeCount ?? 0 }).map((_, i) => (
                              <span 
                                key={i} 
                                className="text-green-600 font-bold" 
                                style={{ fontSize: '20px', lineHeight: '1' }}
                              >
                                ✓
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                    </td>
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
                          onClick={() => handleViewFile(file._id)}
                          className="text-green-600 hover:text-green-800"
                          title="View Excel file"
                        >
                          Show
                        </button>
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

        {/* View File Modal */}
        {viewingFileId && fileData.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mt-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">View Excel File Data</h2>
              <button
                onClick={() => {
                  setViewingFileId(null);
                  setFileData([]);
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md"
              >
                Close
              </button>
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {Object.keys(fileData[0] || {}).map((key) => (
                      <th key={key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {fileData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      {Object.values(row).map((value: any, colIdx) => (
                        <td key={colIdx} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {value || ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Merge Filename Modal */}
      {showMergeFilenameModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold mb-4">Enter Merged File Name</h2>
            <p className="text-gray-600 mb-4">
              Enter a custom name for the merged file. If left empty, a default name will be generated.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                File Name (without extension)
              </label>
              <input
                type="text"
                value={mergeFilename}
                onChange={(e) => setMergeFilename(e.target.value)}
                placeholder="e.g., merged_attendance_report_january"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleMerge();
                  } else if (e.key === 'Escape') {
                    handleCancelMerge();
                  }
                }}
              />
              <p className="text-xs text-gray-500 mt-1">
                The file will be saved as: {mergeFilename.trim() || 'auto-generated-name'}.xlsx
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleCancelMerge}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                disabled={merging}
              >
                Cancel
              </button>
              <button
                onClick={handleMerge}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                disabled={merging}
              >
                {merging ? 'Merging...' : 'Merge Files'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
