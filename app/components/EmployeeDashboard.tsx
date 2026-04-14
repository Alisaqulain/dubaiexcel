'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import ExcelCreator from './ExcelCreator';

interface CreatedFile {
  _id: string;
  originalFilename: string;
  labourType: string;
  rowCount: number;
  formatId?: string;
  pickedTemplateRowIndices?: number[];
  dailyWorkDate?: string;
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

/** Day-stamped work file from Save Excel (e.g. FormatName_2026-04-13.xlsx) — not a row-pick snapshot */
function isDailyWorkFilename(name: string | undefined): boolean {
  if (!name) return false;
  return /_[0-9]{4}-[0-9]{2}-[0-9]{2}\.xlsx$/i.test(name.trim());
}

function dayStampFromDailyFilename(name: string | undefined): string | null {
  if (!name) return null;
  const m = name.trim().match(/_([0-9]{4}-[0-9]{2}-[0-9]{2})\.xlsx$/i);
  return m ? m[1] : null;
}

function hasPickRowIndices(f: CreatedFile): boolean {
  return !!(f.formatId && Array.isArray(f.pickedTemplateRowIndices) && f.pickedTemplateRowIndices.length > 0);
}

/** Same calendar day as “today’s” save (dailyWorkDate, filename stamp, or last-edit date). */
function isFileForLocalCalendarDay(f: CreatedFile, ymd: string): boolean {
  if (f.dailyWorkDate === ymd) return true;
  if (dayStampFromDailyFilename(f.originalFilename) === ymd) return true;
  return fileLocalYmd(f) === ymd;
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
  const [fileData, setFileData] = useState<any[]>([]);
  /** Work with this: rows already = template + all day saves (server); skip client re-merge in ExcelCreator */
  const [pickWorkspacePremerged, setPickWorkspacePremerged] = useState(false);
  const [activeTab, setActiveTab] = useState<'formats' | 'mydata'>('formats');

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

  const fetchMyCreatedFiles = async (opts?: { silent?: boolean }): Promise<CreatedFile[]> => {
    try {
      if (!opts?.silent) setLoadingCreatedFiles(true);
      const authToken = token ?? (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
      const response = await fetch('/api/employee/created-excel-files', {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${authToken ?? ''}`,
        },
      });
      const result = await response.json();
      if (result.success) {
        const list = (result.data || []) as CreatedFile[];
        setMyCreatedFiles(list);
        return list;
      }
    } catch (err: any) {
      console.error('Failed to fetch created files:', err);
    } finally {
      if (!opts?.silent) setLoadingCreatedFiles(false);
    }
    return [];
  };

  /** Row-pick snapshots only (exclude day files even if DB once stored template indices on them) */
  const pickSavedFiles = useMemo(() => {
    const picks = myCreatedFiles.filter(
      (f) => hasPickRowIndices(f) && !isDailyWorkFilename(f.originalFilename)
    );
    const byKey = new Map<string, CreatedFile>();
    for (const f of picks) {
      const key = `${f.formatId}:${JSON.stringify([...(f.pickedTemplateRowIndices || [])].sort((a, b) => a - b))}`;
      const prev = byKey.get(key);
      const tNew = new Date(f.updatedAt || f.lastEditedAt || f.createdAt).getTime();
      const tPrev = prev ? new Date(prev.updatedAt || prev.lastEditedAt || prev.createdAt).getTime() : -1;
      if (!prev || tNew >= tPrev) byKey.set(key, f);
    }
    return Array.from(byKey.values()).sort(
      (a, b) =>
        new Date(b.updatedAt || b.lastEditedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.lastEditedAt || a.createdAt).getTime()
    );
  }, [myCreatedFiles]);
  /** Non-pick files for this format: daily saves from My data (appear in Saved files). One row per format+day. */
  const myDataSavedFiles = useMemo(() => {
    const candidates = myCreatedFiles.filter((f) => {
      if (hasPickRowIndices(f) && !isDailyWorkFilename(f.originalFilename)) return false;
      if (!f.formatId && !isDailyWorkFilename(f.originalFilename)) return false;
      return true;
    });
    const byKey = new Map<string, CreatedFile>();
    for (const f of candidates) {
      const dayKey =
        f.dailyWorkDate || dayStampFromDailyFilename(f.originalFilename) || fileLocalYmd(f);
      const fmt = f.formatId || '_';
      const key = `${fmt}:${dayKey}`;
      const prev = byKey.get(key);
      const tNew = new Date(f.updatedAt || f.lastEditedAt || f.createdAt).getTime();
      const tPrev = prev ? new Date(prev.updatedAt || prev.lastEditedAt || prev.createdAt).getTime() : -1;
      if (!prev || tNew >= tPrev) byKey.set(key, f);
    }
    return Array.from(byKey.values()).sort(
      (a, b) =>
        new Date(b.updatedAt || b.lastEditedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.lastEditedAt || a.createdAt).getTime()
    );
  }, [myCreatedFiles]);

  const myDataDailySave = useMemo(() => {
    if (!showExcelCreator || !selectedFormat) return null;
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
        (!hasPickRowIndices(f) || isDailyWorkFilename(f.originalFilename))
    );

    const newestForDay = (list: CreatedFile[]) => {
      const onDay = list.filter((f) => isFileForLocalCalendarDay(f, ymd));
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
      const isPick = !!cur && hasPickRowIndices(cur) && !isDailyWorkFilename(cur.originalFilename);
      if (cur && !isPick) {
        putTargetId = isFileForLocalCalendarDay(cur, ymd) ? editingFileId : null;
      } else if (cur && isPick) {
        putTargetId = newestForDay(nonPickSameFormat);
      } else if (!cur) {
        // List not refreshed yet after first save today — still PUT this file
        putTargetId = editingFileId;
      }
    }

    return { putTargetId, defaultFilename, dailyWorkYmd: ymd };
  }, [showExcelCreator, selectedFormat, editingFileId, editingFilePickedIndices, myCreatedFiles]);

  const handleWorkWithPickFile = async (file: CreatedFile) => {
    try {
      const authToken = token ?? (typeof window !== 'undefined' ? localStorage.getItem('token') : null);

      const [wkRes] = await Promise.all([
        fetch(
          `/api/employee/pick-workspace-data?pickFileId=${encodeURIComponent(file._id)}`,
          {
            cache: 'no-store',
            headers: { Authorization: `Bearer ${authToken ?? ''}` },
          }
        ),
        fetchMyCreatedFiles({ silent: true }),
      ]);

      const wk = await wkRes.json();
      if (!wk.success || !Array.isArray(wk.data?.rows)) {
        setMessage({ type: 'error', text: wk.error || 'Failed to load workspace' });
        return;
      }

      const fmtId = wk.data.formatId || file.formatId;
      let format = formats.find((f) => f._id === fmtId) ?? null;
      if (!format && fmtId && authToken) {
        const formatRes = await fetch(`/api/employee/excel-formats/${fmtId}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const formatJson = await formatRes.json();
        if (formatJson.success && formatJson.data) format = formatJson.data;
      }

      setFileData(wk.data.rows);
      setEditingFileId(wk.data.editingFileId);
      setEditingFileName(wk.data.editingFilename || null);
      setEditingFilePickedIndices(
        Array.isArray(wk.data.pickedTemplateRowIndices) ? wk.data.pickedTemplateRowIndices : undefined
      );
      setSelectedFormat(format || formats[0] || null);
      setPickWorkspacePremerged(true);
      setShowExcelCreator(true);
      setMessage(null);
      setActiveTab('mydata');
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
        setPickWorkspacePremerged(false);
        setFileData(result.data.data);
        setEditingFileId(fileId);
        setEditingFileName(file?.originalFilename || result.data?.filename || null);
        setEditingFilePickedIndices(Array.isArray(result.data?.pickedTemplateRowIndices) ? result.data.pickedTemplateRowIndices : undefined);
        const formatId = file?.formatId || result.data?.formatId;
        if (formatId && formats.length > 0) {
          const match = formats.find((f) => f._id === formatId);
          setSelectedFormat(match || formats[0]);
        } else if (formats.length > 0 && !selectedFormat) {
          setSelectedFormat(formats[0]);
        }
        setShowExcelCreator(true);
        setActiveTab('mydata');
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

  const openFormatWorkspace = (format: ExcelFormat) => {
    setSelectedFormat(format);
    setEditingFileId(null);
    setEditingFileName(null);
    setEditingFilePickedIndices(undefined);
    setFileData([]);
    setPickWorkspacePremerged(false);
    setShowExcelCreator(true);
    setMessage(null);
    setActiveTab('formats');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">My Dashboard</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Welcome, {user?.name || (user as any)?.empId || 'Employee'}</h2>
          <p className="text-gray-600 mb-4">
            Use <strong>Formats</strong> to open the admin-uploaded sheet, pick rows, and save your pick. Use <strong>My data</strong> to open those picks, edit, and see day-stamped saves.
          </p>
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
            <h3 className="font-semibold text-blue-900 mb-2">📋 Admin data &amp; picking</h3>
            <p className="text-sm text-blue-700 mb-2">
              Each card is a format your admin uploaded. Open the live sheet here, use the <strong>Pick</strong> column, then <strong>Save my pick</strong>. Your pick appears under the{' '}
              <button type="button" onClick={() => setActiveTab('mydata')} className="text-blue-900 font-semibold underline">
                My data
              </button>{' '}
              tab; daily edits after <strong>Work with this</strong> show there too.
            </p>
            <p className="text-xs text-blue-600">
              Files must match your assigned format. Invalid uploads are rejected.
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
                    <button
                      type="button"
                      onClick={() => openFormatWorkspace(format)}
                      className="w-full px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium flex items-center justify-center gap-2"
                    >
                      Open admin data — pick &amp; save
                    </button>
                    <button
                      type="button"
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
                  You have <strong>{pickSavedFiles.length}</strong> saved pick{pickSavedFiles.length !== 1 ? 's' : ''} — open the{' '}
                  <button type="button" onClick={() => setActiveTab('mydata')} className="text-emerald-600 hover:underline font-medium">
                    My data
                  </button>{' '}
                  tab to work with them or see day files.
                </p>
              )}
            </div>
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
            Files from <strong>Save my pick</strong> (auto-named). <strong>Work with this</strong> loads the <strong>admin master</strong> for your picked rows, then applies every <strong>Save Excel</strong> from your day files in order — <strong>latest save wins</strong> for each cell in columns marked <strong>editable</strong> in the format; all other columns stay master/HR data. Edit, then <strong>Save Excel</strong> (one file per calendar day). Day files also appear under Saved files below.
          </p>
          {loadingCreatedFiles ? (
            <div className="text-center py-12 text-gray-500">Loading...</div>
          ) : pickSavedFiles.length === 0 ? (
            <div className="text-center py-12 text-gray-500 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 px-4">
              <p className="mb-3">No saved pick files yet.</p>
              {formats.length > 0 ? (
                <p className="text-sm text-gray-600 max-w-lg mx-auto">
                  Go to the{' '}
                  <button type="button" onClick={() => setActiveTab('formats')} className="text-emerald-700 font-semibold underline">
                    Formats
                  </button>{' '}
                  tab, choose your format, and click <strong>Open admin data — pick &amp; save</strong>. Pick rows, then <strong>Save my pick</strong>. Your pick will show here.
                </p>
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
            Day-stamped files after you <strong>Work with this</strong> on a pick and use <strong>Save Excel</strong>. Same day updates one file; a new day creates a new file.
          </p>
          {loadingCreatedFiles ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : myDataSavedFiles.length === 0 ? (
            <p className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50 text-sm">
              No day-saved files yet. Open a pick above with <strong>Work with this</strong>, edit, then <strong>Save Excel</strong>.
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
                    This is the <strong>admin-uploaded sheet</strong> (pick rows, then Save my pick). Files you already saved are opened from the <strong>My data</strong> tab.
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
                  setPickWorkspacePremerged(false);
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
              workspaceDataPremerged={pickWorkspacePremerged}
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
                await fetchMyCreatedFiles({ silent: true });
                setMessage({
                  type: 'success',
                  text: 'List updated. Picks and day files are under the My data tab.',
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
                setPickWorkspacePremerged(false);
                setActiveTab('mydata');
                void fetchMyCreatedFiles({ silent: true });
                setMessage({
                  type: 'success',
                  text: fileIsPickWorkflow
                    ? 'Workspace closed. Your pick is under My data.'
                    : 'Workspace closed. Your files are under My data.',
                });
              }}
              editingFileName={editingFileName || undefined}
              initialPickedTemplateRowIndices={editingFilePickedIndices}
            />
          </div>
        )}

      </div>
    </div>
  );
}

