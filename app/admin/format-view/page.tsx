'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';
import { highlightAllSearchMatches } from '../../components/HighlightSearch';
import { useDebounce, SEARCH_DEBOUNCE_MS } from '@/lib/useDebounce';
import Link from 'next/link';

interface Column {
  name: string;
  type: 'text' | 'number' | 'date' | 'email' | 'dropdown' | string;
  required: boolean;
  editable: boolean;
  unique?: boolean;
  validation?: { min?: number; max?: number; pattern?: string; options?: string[] };
  order: number;
}

interface ExcelFormat {
  _id: string;
  name: string;
  description?: string;
  columns: Column[];
}

function getColumnLetter(index: number): string {
  let s = '';
  let n = index;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function formatCellValueForDisplay(value: unknown, columnType: string): string {
  if (value === undefined || value === null || value === '') return '';
  const stringValue = String(value).trim();
  if (columnType === 'date') {
    const excelSerial = parseFloat(stringValue);
    if (!isNaN(excelSerial) && excelSerial > 0 && excelSerial < 1000000) {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + excelSerial * 24 * 60 * 60 * 1000);
      if (!isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
      }
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
      const parts = stringValue.split('-');
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const parsedDate = new Date(stringValue);
    if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 1900 && parsedDate.getFullYear() < 2100) {
      const day = String(parsedDate.getDate()).padStart(2, '0');
      const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
      const year = parsedDate.getFullYear();
      return `${day}/${month}/${year}`;
    }
  }
  return stringValue;
}

export default function FormatViewPage() {
  return (
    <ProtectedRoute requireAdmin>
      <Navigation />
      <FormatViewAndEmpPickContent />
    </ProtectedRoute>
  );
}

function FormatViewAndEmpPickContent() {
  const { token } = useAuth();
  const searchParams = useSearchParams();
  const formatIdFromUrl = searchParams.get('formatId') || '';

  const [formats, setFormats] = useState<ExcelFormat[]>([]);
  const [formatSearch, setFormatSearch] = useState('');
  const debouncedFormatSearch = useDebounce(formatSearch, SEARCH_DEBOUNCE_MS);
  const [rowSearch, setRowSearch] = useState('');
  const debouncedRowSearch = useDebounce(rowSearch, SEARCH_DEBOUNCE_MS);

  const [selectedFormatId, setSelectedFormatId] = useState<string>(formatIdFromUrl);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editedRows, setEditedRows] = useState<Record<string, unknown>[]>([]);
  const [editedColumns, setEditedColumns] = useState<Column[]>([]);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [editPage, setEditPage] = useState(0);
  const [templateTab, setTemplateTab] = useState<'active' | 'deleted'>('active');
  const [picks, setPicks] = useState<Record<string, { empId: string; empName: string; pickedBy: string }>>({});
  const [employees, setEmployees] = useState<{ _id: string; empId: string; name: string }[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingView, setLoadingView] = useState(false);
  const [releasingRow, setReleasingRow] = useState<number | null>(null);
  const [assigningRow, setAssigningRow] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (formatIdFromUrl) setSelectedFormatId(formatIdFromUrl);
  }, [formatIdFromUrl]);

  const fetchFormats = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch('/api/admin/excel-formats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (result.success) {
        const list = result.data || [];
        setFormats(list);
        if (list.length > 0) {
          setSelectedFormatId((prev) => (prev ? prev : list[0]._id));
        }
      }
    } catch (err) {
      console.error('Failed to fetch formats:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchFormats();
  }, [fetchFormats]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/admin/employees?limit=5000', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((result) => {
        if (result.success && Array.isArray(result.data)) {
          setEmployees(result.data);
        }
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!selectedFormatId || !token) {
      setRows([]);
      setColumns([]);
      setEditMode(false);
      setEditedRows([]);
      setEditedColumns([]);
      setTemplateDirty(false);
      setEditPage(0);
      setTemplateTab('active');
      setPicks({});
      return;
    }
    let cancelled = false;
    setLoadingView(true);
    Promise.all([
      fetch(`/api/admin/excel-formats/${selectedFormatId}/view`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json()),
      fetch(`/api/admin/emp-pick/picks?formatId=${encodeURIComponent(selectedFormatId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json()),
    ])
      .then(([viewRes, picksRes]) => {
        if (cancelled) return;
        if (viewRes.success) {
          setRows(viewRes.data?.rows || []);
          setColumns(viewRes.data?.columns || []);
          setEditedRows(viewRes.data?.rows || []);
          setEditedColumns(viewRes.data?.columns || []);
          setEditMode(false);
          setTemplateDirty(false);
          setEditPage(0);
          setTemplateTab('active');
        } else {
          setRows([]);
          setColumns([]);
          setEditedRows([]);
          setEditedColumns([]);
          setEditMode(false);
          setTemplateDirty(false);
          setEditPage(0);
          setTemplateTab('active');
        }
        if (picksRes.success && picksRes.data?.picks) {
          setPicks(picksRes.data.picks);
        } else {
          setPicks({});
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setColumns([]);
          setPicks({});
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingView(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFormatId, token]);

  const handleRelease = async (rowIndex: number) => {
    if (!token || !selectedFormatId) return;
    setReleasingRow(rowIndex);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/emp-pick/release', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ formatId: selectedFormatId, rowIndex }),
      });
      const result = await response.json();
      if (result.success) {
        setPicks((prev) => {
          const next = { ...prev };
          delete next[String(rowIndex)];
          return next;
        });
        setMessage({ type: 'success', text: result.message || 'Row released.' });
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to release' });
      }
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to release' });
    } finally {
      setReleasingRow(null);
    }
  };

  const handleAssignChange = async (rowIndex: number, employeeId: string) => {
    if (!token || !selectedFormatId) return;
    if (employeeId === '') {
      await handleRelease(rowIndex);
      return;
    }
    setAssigningRow(rowIndex);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/emp-pick/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          formatId: selectedFormatId,
          rowIndex,
          employeeId,
        }),
      });
      const result = await response.json();
      if (result.success) {
        const emp = employees.find((e) => e._id === employeeId);
        setPicks((prev) => ({
          ...prev,
          [String(rowIndex)]: {
            empId: emp?.empId || '',
            empName: emp?.name || 'Unknown',
            pickedBy: employeeId,
          },
        }));
        setMessage({ type: 'success', text: result.message || 'Row assigned.' });
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to assign' });
      }
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to assign' });
    } finally {
      setAssigningRow(null);
    }
  };

  const filteredFormatsForSelect = debouncedFormatSearch.trim()
    ? formats.filter(
        (f) =>
          (f.name || '').toLowerCase().includes(debouncedFormatSearch.trim().toLowerCase()) ||
          (f.description || '').toLowerCase().includes(debouncedFormatSearch.trim().toLowerCase())
      )
    : formats;

  const selectedFormat = formats.find((f) => f._id === selectedFormatId);
  const sortedColumns = [...columns].sort((a, b) => a.order - b.order);
  const sortedEditedColumns = [...editedColumns].sort((a, b) => a.order - b.order);
  const q = debouncedRowSearch.trim().toLowerCase();
  const filteredIndices = q
    ? rows
        .map((_, i) => i)
        .filter((i) =>
          sortedColumns.some((col) =>
            String(formatCellValueForDisplay(rows[i][col.name], col.type)).toLowerCase().includes(q)
          )
        )
    : rows.map((_, i) => i);

  const filteredIndicesWithDeleted = useMemo(() => {
    const base = filteredIndices;
    const source = editMode ? editedRows : rows;
    return base.filter((i) => {
      const r: any = source[i];
      const isDeleted = !!(r && typeof r === 'object' && r.__deleted === true);
      return templateTab === 'deleted' ? isDeleted : !isDeleted;
    });
  }, [filteredIndices, editMode, editedRows, rows, templateTab]);

  // Performance: keep keystrokes out of React state; commit to state on blur.
  const cellDraftsRef = useRef<Map<string, unknown>>(new Map());
  const commitDraftToState = (rowIndex: number, colName: string, fallbackValue: unknown) => {
    const key = `${rowIndex}::${colName}`;
    const draftValue = cellDraftsRef.current.has(key) ? cellDraftsRef.current.get(key) : fallbackValue;
    cellDraftsRef.current.delete(key);
    setEditedRows((prev) => {
      const next = [...prev];
      const row = { ...(next[rowIndex] || {}) };
      row[colName] = draftValue;
      next[rowIndex] = row;
      return next;
    });
    setTemplateDirty(true);
  };

  const EDIT_PAGE_SIZE = 50;
  const editTotalPages = useMemo(() => {
    const count = Math.ceil(filteredIndicesWithDeleted.length / EDIT_PAGE_SIZE) || 1;
    return count;
  }, [filteredIndicesWithDeleted.length]);
  useEffect(() => {
    // Keep page in range when filters change
    setEditPage((p) => Math.max(0, Math.min(p, editTotalPages - 1)));
  }, [editTotalPages]);

  const visibleIndices = useMemo(() => {
    if (!editMode) return filteredIndicesWithDeleted;
    const start = editPage * EDIT_PAGE_SIZE;
    return filteredIndicesWithDeleted.slice(start, start + EDIT_PAGE_SIZE);
  }, [editMode, filteredIndicesWithDeleted, editPage]);

  const markRowDeleted = (rowIndex: number, deleted: boolean) => {
    setEditedRows((prev) => {
      const next = [...prev];
      const row: any = { ...(next[rowIndex] || {}) };
      row.__deleted = deleted;
      next[rowIndex] = row;
      return next;
    });
    // If deleting, also clear pick assignment view immediately
    if (deleted) {
      setPicks((prev) => {
        const next = { ...prev };
        delete next[String(rowIndex)];
        return next;
      });
    }
    setTemplateDirty(true);
  };

  const addTemplateRow = () => {
    const newRow: Record<string, unknown> = {};
    sortedEditedColumns.forEach((c) => {
      newRow[c.name] = '';
    });
    setEditedRows((prev) => [...prev, newRow]);
    setTemplateDirty(true);
  };

  const addTemplateColumn = () => {
    const name = prompt('New column name?');
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    if (editedColumns.some((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      alert('Column already exists.');
      return;
    }
    const newCol: Column = {
      name: trimmed,
      type: 'text',
      required: false,
      editable: true,
      order: editedColumns.length,
    };
    setEditedColumns((prev) => [...prev, newCol]);
    setEditedRows((prev) =>
      prev.map((r) => ({
        ...r,
        [trimmed]: r && typeof r === 'object' && trimmed in (r as any) ? (r as any)[trimmed] : '',
      }))
    );
    setTemplateDirty(true);
  };

  const saveTemplate = async () => {
    if (!token || !selectedFormatId) return;
    setSavingTemplate(true);
    setMessage(null);
    try {
      // Persist columns first (so everyone sees the new columns)
      const colRes = await fetch(`/api/admin/excel-formats/${selectedFormatId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ columns: editedColumns.map((c, i) => ({ ...c, order: c.order ?? i })) }),
      });
      const colJson = await colRes.json();
      if (!colRes.ok || !colJson.success) {
        throw new Error(colJson.error || 'Failed to update columns');
      }

      // Then persist template rows
      const res = await fetch('/api/admin/excel-formats/save-template-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ formatId: selectedFormatId, rows: editedRows }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to save template data');
      }

      // Refresh view state
      setRows(editedRows);
      setColumns(editedColumns);
      setTemplateDirty(false);
      setEditMode(false);
      setMessage({ type: 'success', text: 'Template saved. Employee pick files will reflect these changes automatically.' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Failed to save template' });
    } finally {
      setSavingTemplate(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="h-[calc(100vh-6rem)] flex flex-col bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden max-w-[100%] mx-auto">
        <div className="px-4 py-3 border-b border-gray-200 bg-[#f8f9fa] shrink-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2 gap-y-2">
            <h1 className="text-lg font-semibold text-gray-800 w-full sm:w-auto">Format data & employee picks</h1>
            <span className="text-xs text-gray-500 hidden sm:inline">
              View template rows, search, and assign or release picks in one place.
            </span>
          </div>

          {message && (
            <div
              className={`p-2 rounded-md text-sm ${
                message.type === 'success'
                  ? 'bg-green-100 text-green-800 border border-green-300'
                  : 'bg-red-100 text-red-800 border border-red-300'
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 gap-y-2">
            <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Filter formats</label>
            <input
              type="text"
              value={formatSearch}
              onChange={(e) => setFormatSearch(e.target.value)}
              placeholder="Search format names…"
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm w-44 focus:ring-1 focus:ring-blue-500"
            />
            {formatSearch && (
              <button
                type="button"
                onClick={() => setFormatSearch('')}
                className="px-2 py-1.5 bg-gray-200 rounded hover:bg-gray-300 text-sm"
              >
                Clear
              </button>
            )}
            <select
              value={selectedFormatId}
              onChange={(e) => setSelectedFormatId(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-800 bg-white min-w-[200px]"
            >
              {loading ? (
                <option value="">Loading formats…</option>
              ) : filteredFormatsForSelect.length === 0 ? (
                <option value="">No formats match filter</option>
              ) : (
                filteredFormatsForSelect.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name}
                  </option>
                ))
              )}
            </select>
            <span className="text-xs text-gray-500">
              {filteredFormatsForSelect.length}/{formats.length} format(s)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 gap-y-2">
            <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Search in rows</label>
            <input
              type="text"
              value={rowSearch}
              onChange={(e) => setRowSearch(e.target.value)}
              placeholder="Highlight & filter table data…"
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm w-52 focus:ring-1 focus:ring-blue-500"
            />
            {rowSearch && (
              <button
                type="button"
                onClick={() => setRowSearch('')}
                className="px-2 py-1.5 bg-gray-200 rounded hover:bg-gray-300 text-sm"
              >
                Clear
              </button>
            )}
            {selectedFormat && (
              <span className="text-xs text-gray-500">
                {filteredIndices.length}
                {filteredIndices.length !== rows.length ? ` of ${rows.length}` : ''} rows × {columns.length} columns
              </span>
            )}
            <div className="flex items-center gap-2 ml-2">
              <button
                type="button"
                onClick={() => setTemplateTab('active')}
                className={`px-3 py-1.5 text-sm font-medium rounded border ${
                  templateTab === 'active' ? 'bg-white text-gray-900 border-gray-300' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                }`}
              >
                Active rows
              </button>
              <button
                type="button"
                onClick={() => setTemplateTab('deleted')}
                className={`px-3 py-1.5 text-sm font-medium rounded border ${
                  templateTab === 'deleted' ? 'bg-red-50 text-red-800 border-red-200' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                }`}
              >
                Deleted data
              </button>
              {selectedFormatId && (
                <Link
                  href={`/admin/deleted-data?formatId=${encodeURIComponent(selectedFormatId)}`}
                  className="text-xs text-blue-700 hover:underline whitespace-nowrap"
                >
                  Full deleted-data page →
                </Link>
              )}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!editMode) {
                    setEditedRows(rows);
                    setEditedColumns(columns);
                    setTemplateDirty(false);
                    cellDraftsRef.current.clear();
                    setEditPage(0);
                    setEditMode(true);
                  } else {
                    if (templateDirty && !confirm('Discard template changes?')) return;
                    setEditedRows(rows);
                    setEditedColumns(columns);
                    setTemplateDirty(false);
                    cellDraftsRef.current.clear();
                    setEditPage(0);
                    setEditMode(false);
                  }
                }}
                disabled={!selectedFormatId || loadingView}
                className={`px-3 py-1.5 text-sm font-medium rounded border ${
                  editMode ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
                title="Edit the master template rows/columns"
              >
                {editMode ? 'Exit edit mode' : 'Edit template'}
              </button>
              {editMode && (
                <>
                  <div className="flex items-center gap-2 px-2 py-1 rounded border border-gray-200 bg-white text-xs text-gray-700">
                    <button type="button" onClick={() => setEditPage((p) => Math.max(0, p - 1))} disabled={editPage === 0} className="px-2 py-1 border border-gray-300 rounded disabled:opacity-50">
                      Prev
                    </button>
                    <span>
                      Page <strong>{editPage + 1}</strong> / <strong>{editTotalPages}</strong>
                    </span>
                    <button type="button" onClick={() => setEditPage((p) => Math.min(editTotalPages - 1, p + 1))} disabled={editPage >= editTotalPages - 1} className="px-2 py-1 border border-gray-300 rounded disabled:opacity-50">
                      Next
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={addTemplateRow}
                    className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100"
                  >
                    + Add row
                  </button>
                  <button
                    type="button"
                    onClick={addTemplateColumn}
                    className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
                  >
                    + Add column
                  </button>
                  <button
                    type="button"
                    onClick={saveTemplate}
                    disabled={savingTemplate || !templateDirty}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 border border-blue-700 rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {savingTemplate ? 'Saving…' : 'Save template'}
                  </button>
                </>
              )}
            </div>
            <Link
              href="/admin/excel-formats"
              className="ml-auto px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
            >
              Manage Excel Formats
            </Link>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2 bg-[#e2e8f0] min-h-0">
          {!selectedFormatId ? (
            <div className="flex items-center justify-center h-full text-gray-500">Select a format.</div>
          ) : loadingView ? (
            <div className="flex items-center justify-center h-full text-gray-500">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">No template data for this format.</div>
          ) : (
            <div
              className="inline-block min-w-full border border-gray-300 bg-white shadow-sm"
              style={{ fontFamily: 'Calibri, Arial, sans-serif' }}
            >
              <table className="border-collapse" style={{ tableLayout: 'fixed', minWidth: 'max-content' }}>
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-20 w-12 min-w-12 px-2 py-1.5 text-center text-xs font-semibold bg-[#217346] text-white border border-gray-400 shadow-sm">
                      #
                    </th>
                    {(editMode ? sortedEditedColumns : sortedColumns).map((col, idx) => (
                      <th
                        key={col.name}
                        className="sticky top-0 z-10 min-w-[100px] max-w-[200px] px-2 py-1.5 text-left text-xs font-semibold bg-[#217346] text-white border border-gray-400 whitespace-nowrap"
                      >
                        <span className="text-[10px] text-gray-200 mr-1">{getColumnLetter(idx)}</span>
                        {col.name}
                        {col.required && <span className="text-red-300 ml-0.5">*</span>}
                      </th>
                    ))}
                    <th className="sticky top-0 z-10 min-w-[160px] px-2 py-1.5 text-left text-xs font-semibold bg-amber-600 text-white border border-gray-400 whitespace-nowrap">
                      Picked by
                    </th>
                    <th className="sticky top-0 z-10 min-w-[200px] px-2 py-1.5 text-left text-xs font-semibold bg-blue-600 text-white border border-gray-400 whitespace-nowrap">
                      Assign to
                    </th>
                    <th className="sticky top-0 z-10 w-24 min-w-24 px-2 py-1.5 text-center text-xs font-semibold bg-amber-600 text-white border border-gray-400">
                      Release
                    </th>
                    {editMode && (
                      <th className="sticky top-0 z-10 w-28 min-w-28 px-2 py-1.5 text-center text-xs font-semibold bg-red-600 text-white border border-gray-400">
                        Delete
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibleIndices.map((idx) => {
                    const row = editMode ? editedRows[idx] : rows[idx];
                    const pick = picks[String(idx)];
                    return (
                      <tr key={idx} className={pick ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-[#e8f4ea]'}>
                        <td className="sticky left-0 z-10 w-12 min-w-12 px-2 py-1 text-center text-xs font-medium bg-[#f3f4f6] text-gray-600 border border-gray-300">
                          {idx + 1}
                        </td>
                        {(editMode ? sortedEditedColumns : sortedColumns).map((col) => (
                          <td
                            key={col.name}
                            className={`px-2 py-1 text-sm border border-gray-300 min-w-[100px] max-w-[200px] ${
                              col.editable === false ? 'bg-[#f9fafb]' : 'bg-white'
                            }`}
                          >
                            {editMode ? (
                              col.type === 'dropdown' && col.validation?.options ? (
                                <select
                                  defaultValue={String((row as any)?.[col.name] ?? '')}
                                  onChange={(e) => {
                                    const key = `${idx}::${col.name}`;
                                    cellDraftsRef.current.set(key, e.target.value);
                                  }}
                                  onBlur={(e) => commitDraftToState(idx, col.name, e.target.value)}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white"
                                >
                                  <option value="">Select...</option>
                                  {col.validation.options.map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : col.type === 'email' ? 'email' : 'text'}
                                  defaultValue={String((row as any)?.[col.name] ?? '')}
                                  onChange={(e) => {
                                    const key = `${idx}::${col.name}`;
                                    cellDraftsRef.current.set(key, e.target.value);
                                  }}
                                  onBlur={(e) => commitDraftToState(idx, col.name, e.target.value)}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white"
                                />
                              )
                            ) : (
                              highlightAllSearchMatches(
                                formatCellValueForDisplay((row as any)?.[col.name], col.type),
                                debouncedRowSearch
                              )
                            )}
                          </td>
                        ))}
                        <td className="min-w-[160px] px-2 py-1 text-sm border border-gray-300 bg-white">
                          {pick ? (
                            <span className="text-gray-800" title={`ID: ${pick.empId}`}>
                              {pick.empName} <span className="text-gray-500 text-xs">({pick.empId})</span>
                            </span>
                          ) : (
                            <span className="text-gray-400 italic">—</span>
                          )}
                        </td>
                        <td className="min-w-[200px] px-2 py-1 border border-gray-300 bg-white">
                          <select
                            value={pick?.pickedBy ?? ''}
                            onChange={(e) => handleAssignChange(idx, e.target.value)}
                            disabled={assigningRow === idx || releasingRow === idx}
                            className="w-full min-w-[180px] px-2 py-1 text-sm border border-gray-300 rounded bg-white focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
                          >
                            <option value="">— None —</option>
                            {employees.map((emp) => (
                              <option key={emp._id} value={emp._id}>
                                {emp.name} ({emp.empId})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="w-24 min-w-24 px-2 py-1 text-center border border-gray-300 bg-white">
                          {pick ? (
                            <button
                              type="button"
                              onClick={() => handleRelease(idx)}
                              disabled={releasingRow === idx}
                              className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 disabled:opacity-50"
                            >
                              {releasingRow === idx ? '…' : 'Release'}
                            </button>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        {editMode && (
                          <td className="w-28 min-w-28 px-2 py-1 text-center border border-gray-300 bg-white">
                            {templateTab === 'deleted' ? (
                              <button
                                type="button"
                                onClick={() => markRowDeleted(idx, false)}
                                className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100"
                              >
                                Restore
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`Delete row ${idx + 1}? It will move to Deleted data and be removed from employee picks.`)) {
                                    markRowDeleted(idx, true);
                                  }
                                }}
                                className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100"
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
