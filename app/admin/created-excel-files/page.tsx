'use client';

import { useState, useEffect, useMemo } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';
import { highlightAllSearchMatches } from '../../components/HighlightSearch';
import { useDebounce, SEARCH_DEBOUNCE_MS } from '@/lib/useDebounce';

const EXCEL_VIEW_PAGE_SIZE = 100;

function getColumnLetter(index: number): string {
  let s = '';
  let n = index;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

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
  lastEditedAt?: string; // Date when file was last edited
  lastEditedBy?: string; // User who last edited
  lastEditedByName?: string; // Name of user who last edited
  formatId?: string; // Set when file was created from employee "Save my pick"
  pickedTemplateRowIndices?: number[];
  createdAt: string;
  updatedAt?: string;
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
  const [viewColumns, setViewColumns] = useState<string[]>([]);
  const [viewLoginColumnName, setViewLoginColumnName] = useState('');
  const [loginColumnSelected, setLoginColumnSelected] = useState('');
  const [siteList, setSiteList] = useState<{ siteValue: string; password: string }[]>([]);
  const [showLoginColumnPanel, setShowLoginColumnPanel] = useState(false);
  const [viewTab, setViewTab] = useState<'data' | 'format'>('data');
  const [viewFormatId, setViewFormatId] = useState<string | null>(null);
  const [viewFormatDetail, setViewFormatDetail] = useState<{ name: string; columns: { name: string; type: string; required: boolean; editable: boolean }[] } | null>(null);
  const [dataGridSearch, setDataGridSearch] = useState('');
  const debouncedDataGridSearch = useDebounce(dataGridSearch, SEARCH_DEBOUNCE_MS);
  const [dataGridColumnFilters, setDataGridColumnFilters] = useState<Record<string, string>>({});
  const [excelViewPage, setExcelViewPage] = useState(0);
  const [savingSiteLogins, setSavingSiteLogins] = useState(false);
  const [loadingUniqueValues, setLoadingUniqueValues] = useState(false);
  const [updatingRowCell, setUpdatingRowCell] = useState<string | null>(null);
  const [filesListSearch, setFilesListSearch] = useState('');
  const debouncedFilesListSearch = useDebounce(filesListSearch, SEARCH_DEBOUNCE_MS);

  type FileEditNotification = {
    fileId: string;
    filename: string;
    editedAt: string;
    editedBy: string;
  };
  const [fileEditNotifications, setFileEditNotifications] = useState<FileEditNotification[]>([]);

  useEffect(() => {
    fetchFiles();
  }, [filterLabourType]);

  useEffect(() => {
    if (viewTab !== 'format' || !viewFormatId || !token) return;
    fetch(`/api/admin/excel-formats/${viewFormatId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          const f = json.data;
          setViewFormatDetail({
            name: f.name || 'Format',
            columns: (f.columns || []).map((c: any) => ({
              name: c.name || '',
              type: c.type || 'text',
              required: !!c.required,
              editable: c.editable !== false,
            })),
          });
        } else setViewFormatDetail(null);
      })
      .catch(() => setViewFormatDetail(null));
  }, [viewTab, viewFormatId, token]);

  const viewColumnsComputed = useMemo(
    () => (viewColumns.length > 0 ? viewColumns : fileData[0] ? Object.keys(fileData[0]) : []),
    [viewColumns, fileData]
  );
  const filteredData = useMemo(() => {
    const q = debouncedDataGridSearch.trim().toLowerCase();
    const colFilters = dataGridColumnFilters;
    if (!q && !Object.values(colFilters).some((v) => v.trim())) return fileData;
    return fileData.filter((row) => {
      if (q) {
        const matchSearch = viewColumnsComputed.some((col) => String(row[col] ?? '').toLowerCase().includes(q));
        if (!matchSearch) return false;
      }
      for (const col of viewColumnsComputed) {
        const f = colFilters[col]?.trim().toLowerCase();
        if (f && String(row[col] ?? '').toLowerCase().indexOf(f) === -1) return false;
      }
      return true;
    });
  }, [fileData, viewColumnsComputed, debouncedDataGridSearch, dataGridColumnFilters]);

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
        
        // Check for recently edited files and show notifications
        const recentlyEdited = filesWithMergeCount.filter((f: any) => {
          if (!f.lastEditedAt) return false;
          const editTime = new Date(f.lastEditedAt).getTime();
          const now = Date.now();
          // Show notification for files edited in the last 5 minutes
          return (now - editTime) < 5 * 60 * 1000;
        });
        
        if (recentlyEdited.length > 0) {
          const newNotifications = recentlyEdited.map((f: any) => ({
            fileId: f._id,
            filename: f.originalFilename,
            editedAt: f.lastEditedAt,
            editedBy: f.lastEditedByName || 'User',
          }));
          setFileEditNotifications(prev => {
            // Merge with existing, avoiding duplicates
            const existingIds = new Set(prev.map((n: FileEditNotification) => n.fileId));
            const uniqueNew = newNotifications.filter((n: FileEditNotification) => !existingIds.has(n.fileId));
            return [...prev, ...uniqueNew];
          });
        }
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

    if (merging) return; // Prevent double submit
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
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const result = await response.json();
      if (result.success) {
        const data = result.data;
        setFileData(data.data || []);
        setViewColumns(data.columns || (data.data?.length ? Object.keys(data.data[0] || {}) : []));
        setViewLoginColumnName(data.loginColumnName || '');
        setLoginColumnSelected(data.loginColumnName || '');
        setViewFormatId(data.formatId || null);
        setViewFormatDetail(null);
        setViewTab('data');
        setDataGridSearch('');
        setDataGridColumnFilters({});
        setExcelViewPage(0);
        setShowLoginColumnPanel(false);
        setViewingFileId(fileId);
        const siteRes = await fetch(`/api/admin/created-excel-files/${fileId}/site-logins`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const siteJson = await siteRes.json();
        if (siteJson.success && Array.isArray(siteJson.data?.sites)) {
          setSiteList(siteJson.data.sites.map((s: { siteValue: string }) => ({ siteValue: s.siteValue, password: '' })));
        } else {
          setSiteList([]);
        }
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to load file' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load file' });
    }
  };

  const closeExcelView = () => {
    setViewingFileId(null);
    setFileData([]);
    setViewColumns([]);
    setViewLoginColumnName('');
    setLoginColumnSelected('');
    setSiteList([]);
    setViewTab('data');
    setViewFormatId(null);
    setViewFormatDetail(null);
    setDataGridSearch('');
    setDataGridColumnFilters({});
    setExcelViewPage(0);
  };

  const handleLoadUniqueValues = async () => {
    if (!viewingFileId || !loginColumnSelected) return;
    setLoadingUniqueValues(true);
    try {
      const res = await fetch(`/api/admin/created-excel-files/${viewingFileId}/unique-values?column=${encodeURIComponent(loginColumnSelected)}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.success && Array.isArray(json.data?.uniqueValues)) {
        const unique = json.data.uniqueValues as string[];
        setSiteList((prev) => {
          const byVal = new Map(prev.map((s) => [s.siteValue, s.password]));
          return unique.map((v) => ({ siteValue: v, password: byVal.get(v) ?? '' }));
        });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Failed to load unique values' });
    } finally {
      setLoadingUniqueValues(false);
    }
  };

  const handleSaveSiteLogins = async () => {
    if (!viewingFileId) return;
    setSavingSiteLogins(true);
    try {
      const sites = siteList.map((s) => ({ siteValue: s.siteValue.trim(), password: s.password.trim() || undefined })).filter((s) => s.siteValue);
      const res = await fetch(`/api/admin/created-excel-files/${viewingFileId}/site-logins`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ loginColumnName: loginColumnSelected.trim(), sites }),
      });
      const json = await res.json();
      if (json.success) {
        setViewLoginColumnName(loginColumnSelected.trim());
        setMessage({ type: 'success', text: 'Site logins saved.' });
      } else setMessage({ type: 'error', text: json.error || 'Failed to save' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Failed to save' });
    } finally {
      setSavingSiteLogins(false);
    }
  };

  const handleUpdateRowCell = async (rowIndex: number, columnName: string, value: string) => {
    if (!viewingFileId || !token) return;
    const key = `${rowIndex}-${columnName}`;
    setUpdatingRowCell(key);
    try {
      const res = await fetch(`/api/admin/created-excel-files/${viewingFileId}/row`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rowIndex, columnName, value }),
      });
      const json = await res.json();
      if (json.success) {
        setFileData((prev) => {
          const next = [...prev];
          if (next[rowIndex]) next[rowIndex] = { ...next[rowIndex], [columnName]: value };
          return next;
        });
      } else setMessage({ type: 'error', text: json.error || 'Failed to update cell' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Failed to update cell' });
    } finally {
      setUpdatingRowCell(null);
    }
  };

  // Filter files based on active tab and search
  const filteredFiles = files.filter(file => {
    if (activeTab === 'merged') {
      if (file.isMerged !== true) return false;
    } else {
      if (file.isMerged === true) return false;
    }
    const q = debouncedFilesListSearch.trim().toLowerCase();
    if (!q) return true;
    const fn = (file.originalFilename || file.filename || '').toLowerCase();
    const by = (file.createdByName || (typeof file.createdBy === 'object' && file.createdBy?.name) || '').toLowerCase();
    const lt = (file.labourType || '').toLowerCase();
    return fn.includes(q) || by.includes(q) || lt.includes(q);
  });

  // Get all files for merge operations (across both tabs)
  const allFilesForMerge = files;

  const viewingFile = viewingFileId ? files.find((f) => f._id === viewingFileId) : null;
  const viewingFileName = viewingFile?.originalFilename ?? viewingFile?.filename ?? 'File';

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {viewingFileId ? (
        /* Full-page Excel-style view with Data / Format View tabs */
        <div className="h-[calc(100vh-6rem)] flex flex-col bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-[#f8f9fa] shrink-0 flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <button type="button" onClick={closeExcelView} className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">← Back to list</button>
              <span className="text-lg font-semibold text-gray-800">{viewingFileName}</span>
              <span className="text-sm text-gray-500">{fileData.length} rows × {viewColumnsComputed.length} columns{filteredData.length !== fileData.length && ` (${filteredData.length} after filter)`}</span>
              <button type="button" onClick={() => viewingFile && handleDownload(viewingFileId!, viewingFile.originalFilename)} className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100">📥 Download</button>
              <button type="button" onClick={() => setShowLoginColumnPanel((v) => !v)} className="px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100">{showLoginColumnPanel ? '▼' : '▶'} Login column & site logins{viewLoginColumnName && ` (${viewLoginColumnName})`}</button>
            </div>
          </div>
          {showLoginColumnPanel && (
            <div className="shrink-0 border-b border-gray-200 bg-amber-50/80 p-4 space-y-3">
              <p className="text-sm text-gray-700">Choose a column as the login column. Unique values become sites.</p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm font-medium text-gray-700">Login column</label>
                <select value={loginColumnSelected} onChange={(e) => setLoginColumnSelected(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded bg-white text-sm min-w-[180px]">
                  <option value="">— Select column —</option>
                  {viewColumnsComputed.map((col) => <option key={col} value={col}>{col}</option>)}
                </select>
                <button type="button" onClick={handleLoadUniqueValues} disabled={!loginColumnSelected || loadingUniqueValues} className="px-3 py-1.5 text-sm font-medium bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50">{loadingUniqueValues ? 'Loading...' : 'Load unique values'}</button>
                <button type="button" onClick={() => setSiteList((prev) => [...prev, { siteValue: '', password: 'Password@1234' }])} className="px-2 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50">+ Add site</button>
                <button type="button" onClick={handleSaveSiteLogins} disabled={savingSiteLogins || !loginColumnSelected} className="px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">{savingSiteLogins ? 'Saving...' : 'Save site logins'}</button>
              </div>
              <div className="max-h-40 overflow-auto border border-gray-200 rounded bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0"><tr><th className="px-2 py-1.5 text-left font-medium text-gray-600 w-8">#</th><th className="px-2 py-1.5 text-left font-medium text-gray-600 min-w-[120px]">Site name</th><th className="px-2 py-1.5 text-left font-medium text-gray-600 min-w-[120px]">Password</th><th className="w-16" /></tr></thead>
                  <tbody>
                    {siteList.map((row, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-2 py-1 text-gray-500">{i + 1}</td>
                        <td className="px-2 py-1"><input type="text" value={row.siteValue} onChange={(e) => setSiteList((prev) => { const next = [...prev]; next[i] = { ...next[i], siteValue: e.target.value }; return next; })} placeholder="e.g. Site A" className="w-full px-2 py-1 border border-gray-300 rounded text-sm" /></td>
                        <td className="px-2 py-1"><input type="password" value={row.password} onChange={(e) => setSiteList((prev) => { const next = [...prev]; next[i] = { ...next[i], password: e.target.value }; return next; })} placeholder="Password@1234" className="w-full px-2 py-1 border border-gray-300 rounded text-sm" /></td>
                        <td className="px-2 py-1"><button type="button" onClick={() => setSiteList((prev) => prev.filter((_, j) => j !== i))} className="text-red-600 hover:text-red-800 text-xs">Delete</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="flex border-b border-gray-200 bg-gray-50 shrink-0">
            <button type="button" onClick={() => setViewTab('data')} className={`px-4 py-2 text-sm font-medium ${viewTab === 'data' ? 'bg-white border-b-2 border-blue-600 text-blue-600 border-t border-x border-gray-200 -mb-px' : 'text-gray-600 hover:text-gray-900'}`}>Data</button>
            <button type="button" onClick={() => setViewTab('format')} className={`px-4 py-2 text-sm font-medium ${viewTab === 'format' ? 'bg-white border-b-2 border-blue-600 text-blue-600 border-t border-x border-gray-200 -mb-px' : 'text-gray-600 hover:text-gray-900'}`}>Format View</button>
          </div>
          {viewTab === 'format' ? (
            <div className="flex-1 overflow-auto p-6">
              {viewFormatDetail ? (
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">{viewFormatDetail.name}</h3>
                  <table className="min-w-full border border-gray-200">
                    <thead className="bg-gray-100"><tr><th className="px-3 py-2 text-left text-sm font-medium text-gray-700">Column</th><th className="px-3 py-2 text-left text-sm font-medium text-gray-700">Type</th><th className="px-3 py-2 text-left text-sm font-medium text-gray-700">Required</th><th className="px-3 py-2 text-left text-sm font-medium text-gray-700">Editable</th></tr></thead>
                    <tbody className="bg-white">
                      {viewFormatDetail.columns.map((c, i) => (
                        <tr key={i} className="border-t border-gray-100"><td className="px-3 py-2 text-sm">{c.name}</td><td className="px-3 py-2 text-sm">{c.type}</td><td className="px-3 py-2 text-sm">{c.required ? 'Yes' : 'No'}</td><td className="px-3 py-2 text-sm">{c.editable ? 'Yes' : 'No'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : viewFormatId ? (
                <p className="text-gray-500">Loading format...</p>
              ) : (
                <p className="text-gray-500">No format linked to this file.</p>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden p-2 bg-[#e2e8f0]">
              <div className="shrink-0 mb-3 p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                <h3 className="text-sm font-semibold text-gray-800 mb-2">Search &amp; Filter</h3>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Search (all columns):</label>
                    <input type="text" value={dataGridSearch} onChange={(e) => { setDataGridSearch(e.target.value); setExcelViewPage(0); }} placeholder="Type to search in all columns..." className="px-3 py-2 border border-gray-300 rounded-md text-sm w-64 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Filter by column:</label>
                    <span className="text-xs text-gray-500">Use the filter row below each column header</span>
                  </div>
                  <button type="button" onClick={() => { setDataGridSearch(''); setDataGridColumnFilters({}); setExcelViewPage(0); }} className="px-3 py-2 text-sm font-medium bg-amber-100 text-amber-800 border border-amber-300 rounded-md hover:bg-amber-200">Clear search &amp; filters</button>
                  <span className="text-sm text-gray-600">
                    Showing <strong>{filteredData.length}</strong> of <strong>{fileData.length}</strong> rows
                    {filteredData.length !== fileData.length && ' (filtered)'}
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                {(() => {
                  const totalPages = Math.ceil(filteredData.length / EXCEL_VIEW_PAGE_SIZE) || 1;
                  const page = Math.min(excelViewPage, totalPages - 1);
                  const start = page * EXCEL_VIEW_PAGE_SIZE;
                  const pageData = filteredData.slice(start, start + EXCEL_VIEW_PAGE_SIZE);
                  return (
                    <>
                      {filteredData.length > EXCEL_VIEW_PAGE_SIZE && (
                        <div className="flex items-center gap-2 mb-2 text-sm">
                          <button type="button" onClick={() => setExcelViewPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 border border-gray-300 rounded-md bg-white disabled:opacity-50">Previous</button>
                          <span className="text-gray-600">Page {page + 1} of {totalPages}</span>
                          <button type="button" onClick={() => setExcelViewPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1.5 border border-gray-300 rounded-md bg-white disabled:opacity-50">Next</button>
                        </div>
                      )}
                      <div className="inline-block min-w-full border border-gray-300 bg-white shadow-sm" style={{ fontFamily: 'Calibri, Arial, sans-serif' }}>
                        <table className="border-collapse" style={{ tableLayout: 'fixed', minWidth: 'max-content' }}>
                          <thead>
                            <tr>
                              <th className="sticky left-0 top-0 z-20 w-12 min-w-12 px-2 py-1.5 text-center text-xs font-semibold bg-[#217346] text-white border border-gray-400 shadow-sm" />
                              {viewColumnsComputed.map((col, idx) => (
                                <th key={col} className="sticky top-0 z-10 min-w-[120px] max-w-[200px] px-2 py-1.5 text-left text-xs font-semibold bg-[#217346] text-white border border-gray-400 whitespace-nowrap">
                                  <span className="text-[10px] text-gray-200 mr-1">{getColumnLetter(idx)}</span>
                                  {col}
                                </th>
                              ))}
                            </tr>
                            <tr className="bg-[#e8f0e8]">
                              <td className="sticky left-0 z-10 w-12 min-w-12 px-1 py-0.5 border border-gray-300 bg-[#e8f0e8] text-xs font-medium text-gray-600 text-center">—</td>
                              {viewColumnsComputed.map((col) => (
                                <td key={col} className="px-1 py-0.5 border border-gray-300 min-w-[120px] max-w-[200px]">
                                  <input type="text" value={dataGridColumnFilters[col] ?? ''} onChange={(e) => { setDataGridColumnFilters((prev) => ({ ...prev, [col]: e.target.value })); setExcelViewPage(0); }} placeholder="Filter column..." className="w-full px-2 py-1 text-xs border border-gray-300 rounded bg-white placeholder-gray-400" title={`Filter ${col}`} />
                                </td>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {pageData.map((row, i) => {
                              const rowIndex = filteredData.indexOf(row);
                              const actualRowIndex = fileData.indexOf(row);
                              return (
                                <tr key={rowIndex} className="hover:bg-[#e8f4ea]">
                                  <td className="sticky left-0 z-10 w-12 min-w-12 px-2 py-1 text-center text-xs font-medium bg-[#f3f4f6] text-gray-600 border border-gray-300">{rowIndex + 1}</td>
                                  {viewColumnsComputed.map((col) => (
                                    <td key={col} className="px-2 py-1 text-sm border border-gray-300 min-w-[120px] max-w-[200px] bg-white">
                                      {viewLoginColumnName && col === viewLoginColumnName && viewingFileId ? (
                                        <select value={String(row[col] ?? '')} onChange={(e) => handleUpdateRowCell(actualRowIndex, col, e.target.value)} disabled={updatingRowCell === `${actualRowIndex}-${col}`} className="w-full px-1 py-0.5 border border-gray-300 rounded text-sm bg-white">
                                          <option value="">— Select site —</option>
                                          {siteList.map((s) => <option key={s.siteValue} value={s.siteValue}>{s.siteValue}</option>)}
                                        </select>
                                      ) : highlightAllSearchMatches(row[col], debouncedDataGridSearch)}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {filteredData.length === 0 && <p className="text-gray-500 py-4">No rows (or no rows match the current search/filter).</p>}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      ) : (
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
          <label className="mr-2">Search:</label>
          <input type="text" value={filesListSearch} onChange={(e) => setFilesListSearch(e.target.value)} placeholder="Filename, created by, labour type..." className="px-3 py-2 border border-gray-300 rounded-md text-sm w-56 focus:ring-1 focus:ring-blue-500" />
          <button type="button" onClick={() => setFilesListSearch('')} className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm">Clear</button>
          <span className="text-sm text-gray-500 mr-4">Showing {filteredFiles.length} file(s)</span>
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

        {/* File Edit Notifications */}
        {fileEditNotifications.length > 0 && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-semibold text-blue-900">📝 Recently Edited Files</h3>
              <button
                onClick={() => setFileEditNotifications([])}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                Dismiss All
              </button>
            </div>
            <div className="space-y-2">
              {fileEditNotifications.map((notif) => (
                <div key={notif.fileId} className="text-sm text-blue-800 bg-white p-2 rounded border border-blue-200">
                  <span className="font-medium">{notif.filename}</span> was edited by <span className="font-medium">{notif.editedBy}</span> at {new Date(notif.editedAt).toLocaleString()}
                  <button
                    onClick={() => setFileEditNotifications(prev => prev.filter((n: FileEditNotification) => n.fileId !== notif.fileId))}
                    className="ml-2 text-blue-600 hover:text-blue-800 text-xs"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Edited</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredFiles.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-4 text-center text-gray-500">
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{highlightAllSearchMatches(file.originalFilename, filesListSearch)}</span>
                        {file.formatId && Array.isArray(file.pickedTemplateRowIndices) && file.pickedTemplateRowIndices.length > 0 ? (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 whitespace-nowrap">Employee data</span>
                        ) : (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap">Admin data</span>
                        )}
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
                      <div>{highlightAllSearchMatches(getCreatorName(file), filesListSearch)}</div>
                      <div className="text-xs text-gray-500">{highlightAllSearchMatches(getCreatorEmail(file), filesListSearch)}</div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        file.labourType === 'OUR_LABOUR' ? 'bg-blue-100 text-blue-800' :
                        file.labourType === 'SUPPLY_LABOUR' ? 'bg-green-100 text-green-800' :
                        'bg-purple-100 text-purple-800'
                      }`}>
                        {highlightAllSearchMatches(file.labourType.replace('_', ' '), filesListSearch)}
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
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {file.lastEditedAt ? (
                        <div className="space-y-1">
                          <div className="font-medium text-gray-700">
                            {new Date(file.lastEditedAt).toLocaleDateString('en-GB', { 
                              day: '2-digit', 
                              month: '2-digit', 
                              year: 'numeric' 
                            })}
                          </div>
                          <div className="text-xs text-gray-600">
                            {new Date(file.lastEditedAt).toLocaleTimeString('en-GB', { 
                              hour: '2-digit', 
                              minute: '2-digit', 
                              second: '2-digit',
                              hour12: false
                            })}
                          </div>
                          {file.lastEditedByName && (
                            <div className="text-xs text-blue-600 font-medium">
                              by {file.lastEditedByName}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Never</span>
                      )}
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

        </div>
      )}

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
