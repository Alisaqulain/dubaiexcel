'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import ExcelCreator from './ExcelCreator';
import { highlightAllSearchMatches } from './HighlightSearch';
import { useDebounce, SEARCH_DEBOUNCE_MS } from '@/lib/useDebounce';

function getColumnLetter(index: number): string {
  let s = '';
  let n = index;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}


interface CreatedFile {
  _id: string;
  originalFilename: string;
  labourType: string;
  rowCount: number;
  formatId?: string;
  pickedTemplateRowIndices?: number[];
  createdAt: string;
  updatedAt?: string;
  lastEditedAt?: string;
}

function todayLocalYmd(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fileLocalYmd(f: Pick<CreatedFile, 'lastEditedAt' | 'updatedAt' | 'createdAt'>): string {
  const raw = f.lastEditedAt || f.updatedAt || f.createdAt;
  if (!raw) return todayLocalYmd();
  const d = new Date(raw);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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
  const [loading] = useState(false);
  const [formats, setFormats] = useState<ExcelFormat[]>([]);
  const [loadingFormats, setLoadingFormats] = useState(true);
  const [selectedFormat, setSelectedFormat] = useState<ExcelFormat | null>(null);
  const [showExcelCreator, setShowExcelCreator] = useState(false);
  const [createdFile, setCreatedFile] = useState<File | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [myCreatedFiles, setMyCreatedFiles] = useState<CreatedFile[]>([]);
  const [loadingCreatedFiles, setLoadingCreatedFiles] = useState(true);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState<string | null>(null);
  const [editingFilePickedIndices, setEditingFilePickedIndices] = useState<number[] | undefined>(undefined);
  const [viewingFileId, setViewingFileId] = useState<string | null>(null);
  const [fileData, setFileData] = useState<any[]>([]);
  const [filesListSearch, setFilesListSearch] = useState('');
  const [viewDataSearch, setViewDataSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'formats' | 'mydata'>('formats');
  const debouncedFilesListSearch = useDebounce(filesListSearch, SEARCH_DEBOUNCE_MS);
  const debouncedViewDataSearch = useDebounce(viewDataSearch, SEARCH_DEBOUNCE_MS);

  const [workspaceFormatId, setWorkspaceFormatId] = useState('');

  useEffect(() => {
    if (formats.length === 0) return;
    setWorkspaceFormatId((id) => id || formats[0]._id);
  }, [formats]);

  useEffect(() => {
    fetchMyFormats();
    fetchMyCreatedFiles();
  }, []);

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

  const fetchMyCreatedFiles = async () => {
    try {
      setLoadingCreatedFiles(true);
      const authToken = token ?? (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
      const response = await fetch('/api/employee/created-excel-files', {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${authToken ?? ''}`,
        },
      });
      const result = await response.json();
      if (result.success) {
        setMyCreatedFiles(result.data || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch created files:', err);
    } finally {
      setLoadingCreatedFiles(false);
    }
  };

  const handleViewFile = async (fileId: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/employee/created-excel-files/${fileId}`, {
        cache: 'no-store',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const result = await response.json();
      if (result.success) {
        setFileData(result.data.data);
        setViewingFileId(fileId);
        setViewDataSearch('');
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to load file' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load file' });
    }
  };

  const pickSavedFiles = useMemo(() =>
    myCreatedFiles.filter((f) => f.formatId && Array.isArray(f.pickedTemplateRowIndices) && f.pickedTemplateRowIndices.length > 0),
    [myCreatedFiles]
  );
  const savedFilesOnly = useMemo(() =>
    myCreatedFiles.filter((f) => !(f.formatId && Array.isArray(f.pickedTemplateRowIndices) && f.pickedTemplateRowIndices.length > 0)),
    [myCreatedFiles]
  );

  /** Non-pick files for this format: daily saves from My data (appear in Saved files). */
  const myDataSavedFiles = useMemo(() => {
    return myCreatedFiles.filter(
      (f) =>
        f.formatId &&
        !(Array.isArray(f.pickedTemplateRowIndices) && f.pickedTemplateRowIndices.length > 0)
    );
  }, [myCreatedFiles]);

  const myDataDailySave = useMemo(() => {
    if (activeTab !== 'mydata' || !showExcelCreator || !selectedFormat) return null;
    const fmtId = selectedFormat._id;
    const ymd = todayLocalYmd();
    const slug =
      selectedFormat.name
        .replace(/[^a-z0-9]+/gi, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48) || 'format';
    const defaultFilename = `${slug}_${ymd}.xlsx`;

    const nonPickSameFormat = myCreatedFiles.filter(
      (f) =>
        f.formatId === fmtId &&
        !(Array.isArray(f.pickedTemplateRowIndices) && f.pickedTemplateRowIndices.length > 0)
    );

    const newestForDay = (list: CreatedFile[]) => {
      const onDay = list.filter((f) => fileLocalYmd(f) === ymd);
      onDay.sort(
        (a, b) =>
          new Date(b.updatedAt || b.lastEditedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.lastEditedAt || a.createdAt).getTime()
      );
      return onDay[0]?._id ?? null;
    };

    const pickOpen = !!(
      editingFileId &&
      Array.isArray(editingFilePickedIndices) &&
      editingFilePickedIndices.length > 0
    );

    let putTargetId: string | null = null;
    if (pickOpen) {
      putTargetId = newestForDay(nonPickSameFormat);
    } else if (editingFileId) {
      const cur = myCreatedFiles.find((f) => f._id === editingFileId);
      const isPick =
        !!cur &&
        Array.isArray(cur.pickedTemplateRowIndices) &&
        cur.pickedTemplateRowIndices.length > 0;
      if (cur && !isPick) {
        putTargetId = fileLocalYmd(cur) === ymd ? editingFileId : null;
      } else if (cur && isPick) {
        putTargetId = newestForDay(nonPickSameFormat);
      }
    }

    return { putTargetId, defaultFilename };
  }, [
    activeTab,
    showExcelCreator,
    selectedFormat,
    editingFileId,
    editingFilePickedIndices,
    myCreatedFiles,
  ]);

  const handleWorkWithPickFile = async (file: CreatedFile) => {
    try {
      const token = localStorage.getItem('token');
      const [fileRes, formatFromList] = await Promise.all([
        fetch(`/api/employee/created-excel-files/${file._id}`, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } }),
        Promise.resolve(formats.find((f) => f._id === file.formatId)),
      ]);
      const fileResult = await fileRes.json();
      if (!fileResult.success) {
        setMessage({ type: 'error', text: fileResult.error || 'Failed to load file' });
        return;
      }
      let format = formatFromList ?? null;
      if (!format && file.formatId && token) {
        const formatRes = await fetch(`/api/employee/excel-formats/${file.formatId}`, { headers: { Authorization: `Bearer ${token}` } });
        const formatJson = await formatRes.json();
        if (formatJson.success && formatJson.data) format = formatJson.data;
      }
      setFileData(fileResult.data.data);
      setEditingFileId(file._id);
      setEditingFileName(file.originalFilename || null);
      setEditingFilePickedIndices(Array.isArray(fileResult.data.pickedTemplateRowIndices) ? fileResult.data.pickedTemplateRowIndices : undefined);
      setViewingFileId(null);
      setSelectedFormat(format || formats[0] || null);
      setShowExcelCreator(true);
      setMessage(null);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load file' });
    }
  };

  const handleEditFile = async (fileId: string, file?: CreatedFile) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/employee/created-excel-files/${fileId}`, {
        cache: 'no-store',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const result = await response.json();
      if (result.success) {
        setFileData(result.data.data);
        setEditingFileId(fileId);
        setEditingFileName(file?.originalFilename || result.data?.filename || null);
        setEditingFilePickedIndices(Array.isArray(result.data?.pickedTemplateRowIndices) ? result.data.pickedTemplateRowIndices : undefined);
        setViewingFileId(null);
        const formatId = file?.formatId || result.data?.formatId;
        if (formatId && formats.length > 0) {
          const match = formats.find((f) => f._id === formatId);
          setSelectedFormat(match || formats[0]);
        } else if (formats.length > 0 && !selectedFormat) {
          setSelectedFormat(formats[0]);
        }
        setShowExcelCreator(true);
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to load file for editing' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load file for editing' });
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
          <p className="text-gray-600 mb-4">Create and save your Excel files here. All saved files will be visible to administrators.</p>
          <div className="flex gap-1 border-b border-gray-200">
            <button
              type="button"
              onClick={() => setActiveTab('formats')}
              className={`px-4 py-2 text-sm font-medium rounded-t-md border border-b-0 transition-colors ${
                activeTab === 'formats'
                  ? 'bg-white border-gray-300 text-blue-700 -mb-px'
                  : 'bg-gray-50 text-gray-600 border-transparent hover:bg-gray-100'
              }`}
            >
              📋 Formats
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('mydata')}
              className={`px-4 py-2 text-sm font-medium rounded-t-md border border-b-0 transition-colors ${
                activeTab === 'mydata'
                  ? 'bg-white border-gray-300 text-emerald-700 -mb-px'
                  : 'bg-gray-50 text-gray-600 border-transparent hover:bg-gray-100'
              }`}
            >
              📂 My data
              {pickSavedFiles.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-800">
                  {pickSavedFiles.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-4 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-red-100 text-red-700 border border-red-300'
          }`}>
            {message.text}
          </div>
        )}

        {activeTab === 'formats' && (
        <>
        {/* Assigned Formats Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">My Assigned Excel Formats</h2>
          <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-2">📋 Your Assigned Formats</h3>
            <p className="text-sm text-blue-700 mb-2">
              You can only use formats assigned to you. Download templates here. To <strong>pick rows and save</strong>, use the{' '}
              <button type="button" onClick={() => setActiveTab('mydata')} className="text-blue-900 font-semibold underline">
                My data
              </button>{' '}
              tab.
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
            <div className="space-y-6">
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
                    <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2 flex-wrap">
                      {format.name}
                      <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">Admin data</span>
                    </h3>
                    {format.description && (
                      <p className="text-sm text-gray-600 mb-3">{format.description}</p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
                      <span className="bg-gray-100 px-2 py-1 rounded">{format.columns.length} columns</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    {/* Primary "create from format" path disabled — use My data → open workspace to pick rows */}
                    <div className="w-full px-4 py-3 rounded-md text-sm bg-gray-100 text-gray-700 border border-gray-200 text-center">
                      Pick &amp; save is opened from <button type="button" onClick={() => setActiveTab('mydata')} className="text-emerald-700 font-semibold underline">My data</button>.
                    </div>
                    <button
                      onClick={() => handleDownloadTemplate(format._id, format.name)}
                      className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium flex items-center justify-center gap-2"
                    >
                      📥 Download Template
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
              {pickSavedFiles.length > 0 && (
                <p className="text-sm text-gray-500 mt-4">
                  Your saved picks from the main Excel are in the <button type="button" onClick={() => setActiveTab('mydata')} className="text-emerald-600 hover:underline font-medium">My data tab</button> ({pickSavedFiles.length} file{pickSavedFiles.length !== 1 ? 's' : ''}).
                </p>
              )}
            </div>
          )}
        </div>

        {/* My Created Files Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">My Saved Excel Files</h2>
          {loadingCreatedFiles ? (
            <div className="text-center py-8">Loading...</div>
          ) : savedFilesOnly.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No saved files yet that are not &quot;picks&quot;. Pick saves use <strong>My data</strong>; other uploads may appear here when your workflow uses them.
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <label className="text-sm font-medium text-gray-700">Search:</label>
                <input
                  type="text"
                  value={filesListSearch}
                  onChange={(e) => setFilesListSearch(e.target.value)}
                  placeholder="Search filename, labour type..."
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm w-64 focus:ring-1 focus:ring-blue-500"
                />
                {filesListSearch && (
                  <button type="button" onClick={() => setFilesListSearch('')} className="px-2 py-1.5 text-sm bg-gray-200 rounded hover:bg-gray-300">Clear</button>
                )}
                <span className="text-xs text-gray-500">
                  {(debouncedFilesListSearch.trim() ? savedFilesOnly.filter((f) => (f.originalFilename || '').toLowerCase().includes(debouncedFilesListSearch.trim().toLowerCase()) || (f.labourType || '').toLowerCase().includes(debouncedFilesListSearch.trim().toLowerCase())).length : savedFilesOnly.length)} of {savedFilesOnly.length} file(s)
                </span>
              </div>
              <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Filename</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Labour Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rows</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(debouncedFilesListSearch.trim() ? savedFilesOnly.filter((f) => (f.originalFilename || '').toLowerCase().includes(debouncedFilesListSearch.trim().toLowerCase()) || (f.labourType || '').toLowerCase().includes(debouncedFilesListSearch.trim().toLowerCase())) : savedFilesOnly).map((file) => (
                    <tr key={file._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{highlightAllSearchMatches(file.originalFilename, debouncedFilesListSearch)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          file.labourType === 'OUR_LABOUR' ? 'bg-blue-100 text-blue-800' :
                          file.labourType === 'SUPPLY_LABOUR' ? 'bg-green-100 text-green-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>
                          {highlightAllSearchMatches(file.labourType.replace('_', ' '), debouncedFilesListSearch)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{file.rowCount}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(file.createdAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleViewFile(file._id)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Show
                          </button>
                          <button
                            onClick={() => handleEditFile(file._id, file)}
                            className="text-green-600 hover:text-green-900"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>

        </>
        )}

        {/* My data tab - saved picks only */}
        {activeTab === 'mydata' && (
        <>
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-2">My picks</h2>
          <p className="text-gray-600 mb-6">
            Files from <strong>Save my pick</strong>. Open <strong>Work with this</strong>, edit cells, then <strong>Save Excel</strong> — a popup uses today&apos;s date in the name. The same day always updates one file; a new day creates a new file. Those day files appear below under Saved files.
          </p>
          {loadingCreatedFiles ? (
            <div className="text-center py-12 text-gray-500">Loading...</div>
          ) : pickSavedFiles.length === 0 ? (
            <div className="text-center py-12 text-gray-500 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 px-4">
              <p className="mb-4">No saved pick files yet.</p>
              {formats.length > 0 ? (
                <div className="max-w-md mx-auto text-left space-y-3">
                  <p className="text-sm text-gray-600">
                    Open the format workspace here, pick rows in the main grid, then use <strong>Save my pick</strong> (default filename includes date and time).
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Format</label>
                      <select
                        value={workspaceFormatId}
                        onChange={(e) => setWorkspaceFormatId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      >
                        {formats.map((f) => (
                          <option key={f._id} value={f._id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const f = formats.find((x) => x._id === workspaceFormatId) || formats[0];
                        if (!f) return;
                        setSelectedFormat(f);
                        setEditingFileId(null);
                        setEditingFileName(null);
                        setEditingFilePickedIndices(undefined);
                        setFileData([]);
                        setViewingFileId(null);
                        setShowExcelCreator(true);
                        setMessage(null);
                        setActiveTab('mydata');
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 whitespace-nowrap"
                    >
                      Open workspace — pick &amp; save
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm">No formats assigned. Contact your administrator.</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {pickSavedFiles.map((file) => (
                <div
                  key={file._id}
                  className="border-2 border-emerald-200 rounded-xl p-6 bg-emerald-50/60 hover:shadow-lg hover:border-emerald-300 transition-all"
                >
                  <div className="mb-4">
                    <h3 className="text-base font-semibold text-gray-900 mb-2 flex items-center gap-2 flex-wrap break-words">
                      {file.originalFilename}
                      <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-emerald-200 text-emerald-900 border border-emerald-300 shrink-0">My data</span>
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span className="bg-white/80 px-2 py-1 rounded border border-emerald-200">{file.rowCount} rows</span>
                      <span className="text-gray-500">{new Date(file.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleWorkWithPickFile(file)}
                    className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center justify-center gap-2"
                  >
                    ✏️ Work with this
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-2">Saved files (by day)</h2>
          <p className="text-gray-600 text-sm mb-4">
            Day-stamped saves from My picks (after you use Save Excel). Edit keeps updating today&apos;s file; tomorrow opens a new one automatically.
          </p>
          {loadingCreatedFiles ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : myDataSavedFiles.length === 0 ? (
            <p className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50 text-sm">
              No day-saved files yet. Work with a pick above, edit, then Save Excel.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...myDataSavedFiles]
                .sort(
                  (a, b) =>
                    new Date(b.updatedAt || b.lastEditedAt || b.createdAt).getTime() -
                    new Date(a.updatedAt || a.lastEditedAt || a.createdAt).getTime()
                )
                .map((file) => (
                  <div
                    key={file._id}
                    className="border-2 border-slate-200 rounded-xl p-5 bg-slate-50/80 hover:shadow-md transition-all"
                  >
                    <h3 className="font-semibold text-gray-900 break-words mb-2">{file.originalFilename}</h3>
                    <div className="text-xs text-gray-500 mb-3 space-y-1">
                      <div>{file.rowCount} rows</div>
                      <div>
                        Last updated:{' '}
                        {new Date(file.lastEditedAt || file.updatedAt || file.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleEditFile(file._id, file)}
                      className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 text-sm font-medium"
                    >
                      ✏️ Edit
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
        </>
        )}

        {/* Excel Creator - shown when "Work with this" / Edit opens the workspace */}
        {showExcelCreator && selectedFormat && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-semibold">Create Excel File</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Working with format: <strong>{selectedFormat.name}</strong>
                </p>
                {!editingFileId && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1.5 mt-2 max-w-3xl">
                    This screen is the <strong>live admin template</strong> (pick / new saves). To change a file you already saved, open it from the{' '}
                    <strong>My data</strong> tab and save there — those edits stay in your saved file.
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setShowExcelCreator(false);
                  setSelectedFormat(null);
                  setEditingFileId(null);
                  setEditingFileName(null);
                  setEditingFilePickedIndices(undefined);
                  setFileData([]);
                  setViewingFileId(null);
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md"
              >
                Close
              </button>
            </div>
            <ExcelCreator 
              key={`${selectedFormat._id}-${editingFileId || 'new'}`}
              labourType="OUR_LABOUR"
              useCustomFormat={true}
              formatId={selectedFormat._id}
              editingFileId={editingFileId || undefined}
              initialData={fileData.length > 0 ? fileData : undefined}
              myDataDailySave={myDataDailySave}
              onMyDataDailyFileSaved={(id, filename) => {
                setEditingFileId(id);
                setEditingFileName(filename);
                setEditingFilePickedIndices(undefined);
              }}
              onFileCreated={(file) => {
                setCreatedFile(file);
              }}
              onSaveSuccess={async () => {
                await fetchMyCreatedFiles();
                setMessage({
                  type: 'success',
                  text:
                    'List updated. Check Formats → My Saved Excel Files for normal saves, or My data for “Save my pick” files.',
                });
              }}
              onSaveAndClose={() => {
                const fileIsPickWorkflow =
                  !!(editingFileId &&
                    Array.isArray(editingFilePickedIndices) &&
                    editingFilePickedIndices.length > 0);
                setShowExcelCreator(false);
                setSelectedFormat(null);
                setEditingFileId(null);
                setEditingFileName(null);
                setEditingFilePickedIndices(undefined);
                setFileData([]);
                setViewingFileId(null);
                setActiveTab(fileIsPickWorkflow ? 'mydata' : 'formats');
                void fetchMyCreatedFiles();
                setMessage({
                  type: 'success',
                  text: fileIsPickWorkflow
                    ? 'Workspace closed. Your pick file is under the My data tab.'
                    : 'Workspace closed. Your file is under Formats → My Saved Excel Files (newest first).',
                });
              }}
              editingFileName={editingFileName || undefined}
              initialPickedTemplateRowIndices={editingFilePickedIndices}
            />
          </div>
        )}

        {/* View File Modal - Excel-style view with search and yellow highlight */}
        {viewingFileId && fileData.length > 0 && (() => {
          const columns = Object.keys(fileData[0] || {});
          const q = debouncedViewDataSearch.trim().toLowerCase();
          const filteredRows = q
            ? fileData.filter((row) =>
                columns.some((col) => String(row[col] ?? '').toLowerCase().includes(q))
              )
            : fileData;
          return (
            <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6 mb-6">
              <div className="flex justify-between items-center mb-4 flex-wrap gap-3 bg-[#f8f9fa] -m-6 p-4 rounded-t-lg border-b">
                <h2 className="text-xl font-semibold text-gray-800">View File Data (Excel View)</h2>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={viewDataSearch}
                    onChange={(e) => setViewDataSearch(e.target.value)}
                    placeholder="Search in data..."
                    className="px-3 py-1.5 border border-gray-300 rounded text-sm w-52 focus:ring-1 focus:ring-blue-500"
                  />
                  {viewDataSearch && (
                    <button type="button" onClick={() => setViewDataSearch('')} className="px-2 py-1.5 text-sm bg-gray-200 rounded hover:bg-gray-300">Clear</button>
                  )}
                </div>
                <button
                  onClick={() => {
                    setViewingFileId(null);
                    setFileData([]);
                    setViewDataSearch('');
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md"
                >
                  Close
                </button>
              </div>
              <div className="overflow-auto max-h-[70vh] bg-[#e2e8f0] p-2 rounded">
                <div className="inline-block min-w-full border border-gray-300 bg-white shadow-sm" style={{ fontFamily: 'Calibri, Arial, sans-serif' }}>
                  <table className="border-collapse" style={{ tableLayout: 'fixed', minWidth: 'max-content' }}>
                    <thead>
                      <tr>
                        <th className="sticky left-0 top-0 z-20 w-12 min-w-12 px-2 py-1.5 text-center text-xs font-semibold bg-[#217346] text-white border border-gray-400 shadow-sm" />
                        {columns.map((col, idx) => (
                          <th key={col} className="sticky top-0 z-10 min-w-[120px] max-w-[200px] px-2 py-1.5 text-left text-xs font-semibold bg-[#217346] text-white border border-gray-400 whitespace-nowrap">
                            <span className="text-[10px] text-gray-200 mr-1">{getColumnLetter(idx)}</span>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="hover:bg-[#e8f4ea]">
                          <td className="sticky left-0 z-10 w-12 min-w-12 px-2 py-1 text-center text-xs font-medium bg-[#f3f4f6] text-gray-600 border border-gray-300">
                            {rowIndex + 1}
                          </td>
                          {columns.map((col) => (
                            <td key={col} className="px-2 py-1 text-sm border border-gray-300 min-w-[120px] max-w-[200px] bg-white">
                              {highlightAllSearchMatches(row[col], debouncedViewDataSearch)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredRows.length === 0 && <p className="text-gray-500 py-4 text-center">No rows match search.</p>}
              </div>
              <div className="mt-3 text-sm text-gray-600">
                {fileData.length} row(s){debouncedViewDataSearch && ` (showing ${filteredRows.length} matching)`} × {columns.length} columns
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}

