'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';
import { highlightAllSearchMatches } from '../../components/HighlightSearch';
import { useDebounce, SEARCH_DEBOUNCE_MS } from '@/lib/useDebounce';
import Link from 'next/link';
const SAVED_AT_HEADER = 'Saved at (file)';
const LAST_SAVED_HEADER = 'Last saved';
const ROW_SOURCE_FILE_ID = '_sourceFileId';

const TAIL_HEADER_META = new Set(['Submitted by', SAVED_AT_HEADER, LAST_SAVED_HEADER]);

function getColumnLetter(index: number): string {
  let s = '';
  let n = index;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

interface Fmt {
  _id: string;
  name: string;
}

function localDayRangeParams(ymd: string): { rangeStart: string; rangeEnd: string } {
  const [y, m, d] = ymd.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { rangeStart: start.toISOString(), rangeEnd: end.toISOString() };
}

function formatCellForDisplay(column: string, raw: unknown): string {
  if (column === LAST_SAVED_HEADER && raw !== '' && raw != null) {
    const t = new Date(String(raw));
    if (!Number.isNaN(t.getTime())) return t.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' });
  }
  return raw === null || raw === undefined ? '' : String(raw);
}

export default function AllMergeDataAdminPage() {
  return (
    <ProtectedRoute requireAdmin>
      <Navigation />
      <AllMergeDataContent />
    </ProtectedRoute>
  );
}

function AllMergeDataContent() {
  const [tab, setTab] = useState<'files' | 'merged'>('files');

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h1 className="text-2xl font-semibold text-gray-900 mr-2">All merge data</h1>
        <button
          type="button"
          onClick={() => setTab('files')}
          className={`px-3 py-1.5 text-sm font-medium rounded border ${
            tab === 'files' ? 'bg-white text-gray-900 border-gray-300' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
          }`}
        >
          Files by date
        </button>
        <button
          type="button"
          onClick={() => setTab('merged')}
          className={`px-3 py-1.5 text-sm font-medium rounded border ${
            tab === 'merged' ? 'bg-white text-gray-900 border-gray-300' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
          }`}
        >
          Daily merged view
        </button>
        <span className="text-xs text-gray-500">
          {tab === 'files'
            ? 'Pick a day → choose a file → view complete Excel with search, download, and analysis.'
            : 'Old behavior: daily overlay merged grid (template + all saves for that day).'}
        </span>
      </div>

      {tab === 'files' ? <FilesByDateView /> : <DailyMergedView />}
    </div>
  );
}

interface CreatedExcelFileListItem {
  _id: string;
  originalFilename?: string;
  filename?: string;
  labourType?: string;
  rowCount?: number;
  createdAt?: string;
  updatedAt?: string;
  isMerged?: boolean;
  mergeCount?: number;
  createdByName?: string;
  createdByEmail?: string;
  createdBy?: { name?: string; email?: string } | null;
}

function unionColumnsFromRows(rows: Record<string, unknown>[]): string[] {
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r || {})) {
      if (!seen.has(k)) {
        seen.add(k);
        cols.push(k);
      }
    }
  }
  return cols;
}

function normalizeForCount(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function FilesByDateView() {
  const { token } = useAuth();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const dayRange = useMemo(() => localDayRangeParams(date), [date]);

  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [files, setFiles] = useState<CreatedExcelFileListItem[]>([]);
  const [listSearch, setListSearch] = useState('');
  const debouncedListSearch = useDebounce(listSearch, SEARCH_DEBOUNCE_MS);

  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('');

  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileRows, setFileRows] = useState<Record<string, unknown>[]>([]);
  const [fileColumns, setFileColumns] = useState<string[]>([]);

  const [sheetSearch, setSheetSearch] = useState('');
  const debouncedSheetSearch = useDebounce(sheetSearch, SEARCH_DEBOUNCE_MS);

  const [analysisColumn, setAnalysisColumn] = useState<string>('');
  const [analysisMode, setAnalysisMode] = useState<'counts' | 'pa'>('pa');

  const downloadFile = useCallback(
    async (fileId: string, fallbackName: string) => {
      if (!token) return;
      const url = `/api/admin/created-excel-files/${encodeURIComponent(fileId)}/download`;
      try {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          alert(j.error || 'Download failed');
          return;
        }
        const blob = await r.blob();
        const cd = r.headers.get('Content-Disposition');
        let fname = fallbackName || 'file.xlsx';
        if (cd) {
          const m = cd.match(/filename="([^"]+)"/) || cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i);
          if (m) fname = decodeURIComponent(m[1].trim());
        }
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = fname;
        a.click();
        URL.revokeObjectURL(objUrl);
      } catch {
        alert('Download failed');
      }
    },
    [token]
  );

  const loadList = useCallback(async () => {
    if (!token) return;
    setLoadingList(true);
    setListError(null);
    try {
      const q = new URLSearchParams({
        rangeStart: dayRange.rangeStart,
        rangeEnd: dayRange.rangeEnd,
        limit: '5000',
        skip: '0',
      });
      const res = await fetch(`/api/admin/created-excel-files?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to load files');
      }
      setFiles(Array.isArray(json.data) ? json.data : []);
    } catch (e: unknown) {
      setListError(e instanceof Error ? e.message : 'Failed to load files');
      setFiles([]);
    } finally {
      setLoadingList(false);
    }
  }, [token, dayRange.rangeStart, dayRange.rangeEnd]);

  useEffect(() => {
    void loadList();
    // Reset selection when day changes
    setSelectedFileId(null);
    setSelectedFileName('');
    setFileRows([]);
    setFileColumns([]);
    setSheetSearch('');
    setAnalysisColumn('');
  }, [loadList, date]);

  const openFile = useCallback(
    async (fileId: string, displayName: string) => {
      if (!token) return;
      setSelectedFileId(fileId);
      setSelectedFileName(displayName);
      setLoadingFile(true);
      setFileError(null);
      try {
        const res = await fetch(`/api/admin/created-excel-files/${encodeURIComponent(fileId)}/view`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Failed to open file');
        }
        const dataRows = (json.data?.data || []) as Record<string, unknown>[];
        setFileRows(Array.isArray(dataRows) ? dataRows : []);
        const cols = unionColumnsFromRows(Array.isArray(dataRows) ? dataRows : []);
        setFileColumns(cols);
        setAnalysisColumn((prev) => (prev && cols.includes(prev) ? prev : cols[0] || ''));
      } catch (e: unknown) {
        setFileError(e instanceof Error ? e.message : 'Failed to open file');
        setFileRows([]);
        setFileColumns([]);
      } finally {
        setLoadingFile(false);
      }
    },
    [token]
  );

  const filteredFiles = useMemo(() => {
    const q = debouncedListSearch.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => {
      const name = String(f.originalFilename || f.filename || '').toLowerCase();
      const by = String(f.createdByName || f.createdBy?.name || f.createdByEmail || f.createdBy?.email || '').toLowerCase();
      const lt = String(f.labourType || '').toLowerCase();
      return name.includes(q) || by.includes(q) || lt.includes(q);
    });
  }, [files, debouncedListSearch]);

  const filteredRows = useMemo(() => {
    const q = debouncedSheetSearch.trim().toLowerCase();
    if (!q) return fileRows;
    return fileRows.filter((row) => fileColumns.some((c) => String(row?.[c] ?? '').toLowerCase().includes(q)));
  }, [fileRows, fileColumns, debouncedSheetSearch]);

  const analysis = useMemo(() => {
    if (!analysisColumn) {
      return { total: 0, present: 0, absent: 0, other: 0, counts: [] as Array<{ value: string; count: number }> };
    }
    const map = new Map<string, number>();
    let present = 0;
    let absent = 0;
    let other = 0;
    for (const r of fileRows) {
      const raw = normalizeForCount(r?.[analysisColumn]);
      const v = raw.toLowerCase();
      if (analysisMode === 'pa') {
        if (v === 'p' || v === 'present') present += 1;
        else if (v === 'a' || v === 'ab' || v === 'absent') absent += 1;
        else if (raw !== '') other += 1;
      }
      if (raw !== '') map.set(raw, (map.get(raw) || 0) + 1);
    }
    const counts = Array.from(map.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    return { total: fileRows.length, present, absent, other, counts };
  }, [fileRows, analysisColumn, analysisMode]);

  const localDayLongLabel = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [date]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Day (your time zone)</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          {localDayLongLabel && (
            <p className="text-xs text-gray-600 mt-1 max-w-[16rem]">
              Showing files created on: <span className="font-medium text-gray-800">{localDayLongLabel}</span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void loadList()}
          disabled={loadingList}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {loadingList ? 'Loading…' : 'Refresh list'}
        </button>
        <div className="flex-1 min-w-[260px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">Search files</label>
          <input
            type="text"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            placeholder="Search by filename, created by, labour type…"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
      </div>

      {listError && <div className="p-3 rounded bg-red-50 text-red-800 text-sm">{listError}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* File list */}
        <div className="lg:col-span-4 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-[#f8f9fa] flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-gray-800">Excel files</div>
              <div className="text-xs text-gray-500">
                {filteredFiles.length}
                {filteredFiles.length !== files.length ? ` of ${files.length}` : ''} file(s)
              </div>
            </div>
            {loadingList && <span className="text-xs text-gray-500">Loading…</span>}
          </div>
          <div className="max-h-[70vh] overflow-auto divide-y">
            {filteredFiles.length === 0 ? (
              <div className="p-6 text-sm text-gray-500 text-center">{loadingList ? 'Loading…' : 'No files for this day.'}</div>
            ) : (
              filteredFiles.map((f) => {
                const name = String(f.originalFilename || f.filename || 'Excel file');
                const createdAt = f.createdAt ? new Date(f.createdAt).toLocaleString() : '';
                const by = String(f.createdByName || f.createdBy?.name || f.createdByEmail || f.createdBy?.email || '');
                const active = selectedFileId === f._id;
                return (
                  <button
                    key={f._id}
                    type="button"
                    onClick={() => void openFile(f._id, name)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${active ? 'bg-blue-50' : 'bg-white'}`}
                  >
                    <div className="text-sm font-medium text-gray-900 break-words">{name}</div>
                    <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {createdAt && <span>🕒 {createdAt}</span>}
                      {typeof f.rowCount === 'number' && <span>Rows: {f.rowCount}</span>}
                      {f.labourType && <span>{f.labourType}</span>}
                      {by && <span>By: {by}</span>}
                      {f.isMerged && <span className="text-amber-700 font-semibold">Merged</span>}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Viewer + analysis */}
        <div className="lg:col-span-8 space-y-3">
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-[#f8f9fa] flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-gray-800">Complete Excel</div>
                <div className="text-xs text-gray-500 break-words">
                  {selectedFileId ? selectedFileName : 'Select a file to view it here.'}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={sheetSearch}
                  onChange={(e) => setSheetSearch(e.target.value)}
                  placeholder="Search in sheet…"
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm w-52"
                  disabled={!selectedFileId}
                />
                {sheetSearch && (
                  <button type="button" onClick={() => setSheetSearch('')} className="px-2 py-1.5 text-sm bg-gray-200 rounded hover:bg-gray-300" disabled={!selectedFileId}>
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => selectedFileId && void downloadFile(selectedFileId, selectedFileName)}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
                  disabled={!selectedFileId}
                >
                  ⬇ Download
                </button>
              </div>
            </div>

            {fileError && <div className="m-3 p-3 rounded bg-red-50 text-red-800 text-sm">{fileError}</div>}

            <div className="p-2 bg-[#e2e8f0] overflow-auto max-h-[55vh]">
              {!selectedFileId ? (
                <div className="p-10 text-center text-sm text-gray-500">Pick a file on the left.</div>
              ) : loadingFile ? (
                <div className="p-10 text-center text-sm text-gray-500">Loading file…</div>
              ) : fileColumns.length === 0 ? (
                <div className="p-10 text-center text-sm text-gray-500">No data in this Excel file.</div>
              ) : (
                <div className="inline-block min-w-full border border-gray-300 bg-white shadow-sm" style={{ fontFamily: 'Calibri, Arial, sans-serif' }}>
                  <table className="border-collapse" style={{ tableLayout: 'fixed', minWidth: 'max-content' }}>
                    <thead>
                      <tr>
                        <th className="sticky left-0 top-0 z-20 w-12 min-w-12 px-2 py-1.5 text-center text-xs font-semibold bg-[#217346] text-white border border-gray-400 shadow-sm">
                          #
                        </th>
                        {fileColumns.map((col, idx) => (
                          <th
                            key={col}
                            className="sticky top-0 z-10 min-w-[120px] max-w-[240px] px-2 py-1.5 text-left text-xs font-semibold bg-[#217346] text-white border border-gray-400 whitespace-nowrap"
                          >
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
                          {fileColumns.map((col) => (
                            <td key={col} className="px-2 py-1 text-sm border border-gray-300 min-w-[120px] max-w-[240px] bg-white whitespace-pre-wrap break-words">
                              {highlightAllSearchMatches(String(row?.[col] ?? ''), debouncedSheetSearch)}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {filteredRows.length === 0 && (
                        <tr>
                          <td className="px-4 py-6 text-center text-sm text-gray-500" colSpan={fileColumns.length + 1}>
                            No rows match search.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {selectedFileId && (
              <div className="px-4 py-3 border-t bg-[#f8f9fa] text-xs text-gray-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>
                  Rows: <strong>{fileRows.length}</strong> (showing <strong>{filteredRows.length}</strong>)
                </span>
                <span>
                  Columns: <strong>{fileColumns.length}</strong>
                </span>
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-[#f8f9fa] flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-gray-800">Analysis</div>
                <div className="text-xs text-gray-500">Select a column and get counts (P/A summary + value frequency).</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={analysisColumn}
                  onChange={(e) => setAnalysisColumn(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm min-w-[240px]"
                  disabled={!selectedFileId || fileColumns.length === 0}
                >
                  {fileColumns.length === 0 ? <option value="">No columns</option> : fileColumns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                  value={analysisMode}
                  onChange={(e) => setAnalysisMode(e.target.value as any)}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm"
                  disabled={!selectedFileId || !analysisColumn}
                  title="P/A mode counts Present/Absent, plus Other"
                >
                  <option value="pa">P/A summary</option>
                  <option value="counts">Counts only</option>
                </select>
              </div>
            </div>
            <div className="p-4">
              {!selectedFileId ? (
                <div className="text-sm text-gray-500">Select a file first.</div>
              ) : !analysisColumn ? (
                <div className="text-sm text-gray-500">Select a column.</div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded border bg-white">
                      <div className="text-xs text-gray-500">Total rows</div>
                      <div className="text-lg font-semibold text-gray-900">{analysis.total}</div>
                    </div>
                    <div className="p-3 rounded border bg-green-50">
                      <div className="text-xs text-green-700">Present (P)</div>
                      <div className="text-lg font-semibold text-green-900">{analysis.present}</div>
                    </div>
                    <div className="p-3 rounded border bg-red-50">
                      <div className="text-xs text-red-700">Absent (A)</div>
                      <div className="text-lg font-semibold text-red-900">{analysis.absent}</div>
                    </div>
                    <div className="p-3 rounded border bg-amber-50">
                      <div className="text-xs text-amber-700">Other (non-empty)</div>
                      <div className="text-lg font-semibold text-amber-900">{analysis.other}</div>
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-medium text-gray-800 mb-2">Value counts (top 30)</div>
                    {analysis.counts.length === 0 ? (
                      <div className="text-sm text-gray-500">No non-empty values found in this column.</div>
                    ) : (
                      <div className="overflow-auto border rounded">
                        <table className="min-w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase border-b">Value</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase border-b w-28">Count</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analysis.counts.slice(0, 30).map((x) => (
                              <tr key={x.value} className="odd:bg-white even:bg-gray-50">
                                <td className="px-3 py-2 border-b break-words">{x.value}</td>
                                <td className="px-3 py-2 border-b text-right font-medium">{x.count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DailyMergedView() {
  const { token } = useAuth();
  const [formats, setFormats] = useState<Fmt[]>([]);
  const [formatId, setFormatId] = useState<string>('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [formatName, setFormatName] = useState('');
  const [fileCount, setFileCount] = useState(0);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [liveConnected, setLiveConnected] = useState(false);

  const dayRange = useMemo(() => localDayRangeParams(date), [date]);
  const formatIdRef = useRef(formatId);
  const loadRef = useRef<() => Promise<void>>(async () => {});
  formatIdRef.current = formatId;

  const downloadSourceFile = useCallback(
    async (fileId: string, fallbackName: string) => {
      if (!token) return;
      const url = `/api/admin/created-excel-files/${encodeURIComponent(fileId)}/download`;
      try {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          alert(j.error || 'Could not open file');
          return;
        }
        const blob = await r.blob();
        const cd = r.headers.get('Content-Disposition');
        let fname = fallbackName || 'file.xlsx';
        if (cd) {
          const m = cd.match(/filename="([^"]+)"/) || cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i);
          if (m) fname = decodeURIComponent(m[1].trim());
        }
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = fname;
        a.click();
        URL.revokeObjectURL(objUrl);
      } catch {
        alert('Could not open file');
      }
    },
    [token]
  );

  useEffect(() => {
    if (!token) return;
    fetch('/api/admin/excel-formats', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((j) => {
        if (j.success && Array.isArray(j.data)) {
          const list = j.data.map((x: { _id: string; name: string }) => ({ _id: x._id, name: x.name }));
          setFormats(list);
          setFormatId((prev) => prev || (list.length ? list[0]._id : ''));
        }
      })
      .catch(() => {});
  }, [token]);

  const load = useCallback(async () => {
    if (!token || !formatId) return;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        formatId,
        date,
        rangeStart: dayRange.rangeStart,
        rangeEnd: dayRange.rangeEnd,
      });
      const u = `/api/admin/format-daily-merge?${q.toString()}`;
      const res = await fetch(u, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Failed to load');
        setRows([]);
        setColumns([]);
        return;
      }
      const d = json.data;
      setRows(d.rows || []);
      setColumns(d.columns || []);
      setFormatName(d.formatName || '');
      setFileCount(d.fileCount ?? 0);
      setRowCount(d.rowCount ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, formatId, date, dayRange.rangeStart, dayRange.rangeEnd]);

  loadRef.current = load;

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!token) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const socket: Socket = io(origin, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    const onConnect = () => setLiveConnected(true);
    const onDisconnect = () => setLiveConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    const onInvalidate = (payload: { formatId?: string }) => {
      if (!payload?.formatId || payload.formatId !== formatIdRef.current) return;
      void loadRef.current();
    };
    socket.on('format_daily_merge_invalidate', onInvalidate);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('format_daily_merge_invalidate', onInvalidate);
      socket.disconnect();
      setLiveConnected(false);
    };
  }, [token]);

  useEffect(() => {
    if (!autoRefresh || !formatId) return;
    const id = setInterval(() => load(), 30000);
    return () => clearInterval(id);
  }, [autoRefresh, formatId, load]);

  const filteredRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      columns.some((col) => String(row[col] ?? '').toLowerCase().includes(q))
    );
  }, [rows, columns, debouncedSearch]);

  const columnExcelLetters = useMemo(() => {
    const m = new Map<string, string>();
    let idx = 0;
    for (const c of columns) {
      if (TAIL_HEADER_META.has(c)) {
        m.set(c, '');
        continue;
      }
      m.set(c, getColumnLetter(idx));
      idx += 1;
    }
    return m;
  }, [columns]);

  const downloadHref = useMemo(() => {
    if (!token || !formatId) return '#';
    const base =
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const q = new URLSearchParams({
      formatId,
      date,
      rangeStart: dayRange.rangeStart,
      rangeEnd: dayRange.rangeEnd,
      download: '1',
    });
    return `${base}/api/admin/format-daily-merge?${q.toString()}`;
  }, [formatId, date, token, dayRange.rangeStart, dayRange.rangeEnd]);

  const localDayLongLabel = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [date]);

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">Daily merged view (by date)</h2>
      <p className="text-sm text-gray-600 mb-6">
        The grid is the <strong>same master template</strong> as{' '}
        <Link href="/admin/format-view" className="text-blue-700 hover:underline font-medium">
          Format &amp; picks
        </Link>{' '}
        (complete sheet). For the day you select, cells are <strong>overlaid</strong> from each employee file saved
        that day (pick rows line up by row index). Rows nobody touched stay as template data. Trailing columns:{' '}
        <strong>Submitted by</strong>, <strong>Saved at (file)</strong> (click to download that workbook),{' '}
        <strong>Last saved</strong>. Refreshes over the socket when employees save (
        {liveConnected ? (
          <span className="text-green-700 font-semibold">live connected</span>
        ) : (
          <span className="text-amber-700 font-semibold">connecting…</span>
        )}
        ). Unchanged rows stay listed; edited rows show new cell values after refresh. Download names the file like{' '}
        <code className="text-xs bg-gray-100 px-1 rounded">YourFormat_all_merge_2026-04-12.xlsx</code>.
      </p>

      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Format</label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={formatId}
              onChange={(e) => setFormatId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm min-w-[240px]"
            >
              {formats.map((f) => (
                <option key={f._id} value={f._id}>
                  {f.name}
                </option>
              ))}
            </select>
            {formatId && (
              <Link
                href={`/admin/format-view?formatId=${encodeURIComponent(formatId)}`}
                className="text-sm text-blue-700 hover:underline whitespace-nowrap"
              >
                Open same format in Format &amp; picks →
              </Link>
            )}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Day (your time zone)</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          {localDayLongLabel && (
            <p className="text-xs text-gray-600 mt-1 max-w-[14rem]">
              Merging saves for: <span className="font-medium text-gray-800">{localDayLongLabel}</span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading || !formatId}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Refresh now'}
        </button>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          Fallback refresh every 30s
        </label>
        <a
          href={downloadHref}
          className="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 inline-flex items-center"
          onClick={(e) => {
            if (!token) {
              e.preventDefault();
              return;
            }
            e.preventDefault();
            fetch(downloadHref, { headers: { Authorization: `Bearer ${token}` } })
              .then(async (r) => {
                if (!r.ok) {
                  const j = (await r.json().catch(() => ({}))) as { error?: string };
                  alert(j.error || 'Download failed');
                  return;
                }
                const blob = await r.blob();
                const cd = r.headers.get('Content-Disposition');
                let fname = '';
                if (cd) {
                  const m = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i) || cd.match(/filename="([^"]+)"/);
                  if (m) fname = decodeURIComponent(m[1].trim());
                }
                if (!fname) {
                  const safe = (formatName || 'format').replace(/[^a-z0-9]+/gi, '_').slice(0, 80);
                  fname = `${safe}_all_merge_${date}.xlsx`;
                }
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fname;
                a.click();
                URL.revokeObjectURL(url);
              })
              .catch(() => alert('Download failed'));
          }}
        >
          ⬇ Download Excel
        </a>
      </div>

      {error && <div className="mb-4 p-3 rounded bg-red-50 text-red-800 text-sm">{error}</div>}

      <div className="text-sm text-gray-600 mb-2">
        {formatName && <span className="font-medium text-gray-800">{formatName}</span>}
        <span className="mx-2">·</span>
        {fileCount} file(s){' '}
        <span className="mx-2">·</span>
        {rowCount} row(s) total
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search all columns…"
          className="px-3 py-2 border border-gray-300 rounded-md text-sm w-64"
        />
        {search && (
          <button type="button" onClick={() => setSearch('')} className="text-sm text-gray-600 hover:underline">
            Clear
          </button>
        )}
      </div>

      <div className="overflow-auto max-h-[78vh] border border-gray-300 rounded-lg bg-white shadow-sm">
        {columns.length === 0 ? (
          <p className="p-8 text-gray-500 text-center">{loading ? 'Loading…' : 'No data for this day/format.'}</p>
        ) : (
          <table
            className="min-w-max text-sm border-collapse"
            style={{ fontFamily: 'Calibri, Arial, sans-serif' }}
          >
            <thead className="sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="sticky left-0 top-0 z-20 px-2 py-2 border border-gray-400 w-12 text-center text-xs font-semibold bg-[#217346] text-white">
                  #
                </th>
                {columns.map((c) => {
                  const letter = columnExcelLetters.get(c) || '';
                  const isTail = TAIL_HEADER_META.has(c);
                  return (
                    <th
                      key={c}
                      className={`px-3 py-2 border border-gray-400 text-left align-bottom font-semibold min-w-[100px] max-w-[480px] whitespace-pre-wrap text-xs top-0 ${
                        isTail ? 'bg-amber-700 text-white' : 'bg-[#217346] text-white'
                      }`}
                    >
                      {!isTail && letter && (
                        <span className="text-[10px] text-gray-200 mr-1">{letter}</span>
                      )}
                      {c}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="bg-white">
              {filteredRows.map((row, i) => {
                const rowFileId = row[ROW_SOURCE_FILE_ID] != null ? String(row[ROW_SOURCE_FILE_ID]) : '';
                const rk = `${rowFileId}-${i}-${String(row[SAVED_AT_HEADER] ?? '')}`;
                return (
                  <tr key={rk} className={i % 2 === 1 ? 'bg-[#f8fcf9]' : 'bg-white'}>
                    <td className="sticky left-0 z-10 px-2 py-2 border border-gray-300 bg-gray-100 text-center text-xs text-gray-700 align-top">
                      {i + 1}
                    </td>
                    {columns.map((c) => {
                      const text = formatCellForDisplay(c, row[c]);
                      if (c === SAVED_AT_HEADER && rowFileId) {
                        return (
                          <td
                            key={c}
                            className="px-3 py-2 border border-gray-300 align-top min-w-[120px] max-w-[480px]"
                            title={text ? `Download: ${text}` : 'Download file'}
                          >
                            <button
                              type="button"
                              onClick={() => void downloadSourceFile(rowFileId, text)}
                              className="text-left text-blue-700 hover:text-blue-900 hover:underline font-medium whitespace-pre-wrap break-words"
                            >
                              {highlightAllSearchMatches(text as string | number | null | undefined, debouncedSearch)}
                            </button>
                          </td>
                        );
                      }
                      return (
                        <td
                          key={c}
                          className="px-3 py-2 border border-gray-300 align-top text-gray-900 whitespace-pre-wrap break-words min-w-[120px] max-w-[480px]"
                          title={text}
                        >
                          {highlightAllSearchMatches(text as string | number | null | undefined, debouncedSearch)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
