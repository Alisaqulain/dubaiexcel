'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';
import { highlightAllSearchMatches } from '../../components/HighlightSearch';
import { useDebounce, SEARCH_DEBOUNCE_MS } from '@/lib/useDebounce';
import Link from 'next/link';

interface Column {
  name: string;
  type: 'text' | 'number' | 'date' | 'email' | 'dropdown';
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

function formatCellValueForDisplay(value: any, columnType: string): string {
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
      <FormatViewContent />
    </ProtectedRoute>
  );
}

function FormatViewContent() {
  const { token } = useAuth();
  const searchParams = useSearchParams();
  const formatIdFromUrl = searchParams.get('formatId') || '';
  const [formats, setFormats] = useState<ExcelFormat[]>([]);
  const [formatViewSearch, setFormatViewSearch] = useState('');
  const debouncedFormatViewSearch = useDebounce(formatViewSearch, SEARCH_DEBOUNCE_MS);
  const [selectedFormatId, setSelectedFormatId] = useState<string>(formatIdFromUrl);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingView, setLoadingView] = useState(false);

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
    if (!selectedFormatId || !token) {
      setRows([]);
      setColumns([]);
      return;
    }
    let cancelled = false;
    setLoadingView(true);
    fetch(`/api/admin/excel-formats/${selectedFormatId}/view`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((result) => {
        if (cancelled) return;
        if (result.success) {
          setRows(result.data?.rows || []);
          setColumns(result.data?.columns || []);
        } else {
          setRows([]);
          setColumns([]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setColumns([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingView(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFormatId, token]);

  const filteredFormatsForView = debouncedFormatViewSearch.trim()
    ? formats.filter((f) => (f.name || '').toLowerCase().includes(debouncedFormatViewSearch.trim().toLowerCase()) || (f.description || '').toLowerCase().includes(debouncedFormatViewSearch.trim().toLowerCase()))
    : formats;
  const selectedFormat = formats.find((f) => f._id === selectedFormatId);
  const sortedColumns = [...columns].sort((a, b) => a.order - b.order);
  const rowSearch = debouncedFormatViewSearch.trim().toLowerCase();
  const filteredRows = rowSearch
    ? rows.filter((row) =>
        sortedColumns.some((col) =>
          String(formatCellValueForDisplay(row[col.name], col.type)).toLowerCase().includes(rowSearch)
        )
      )
    : rows;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="h-[calc(100vh-6rem)] flex flex-col bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-[#f8f9fa] shrink-0 flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-lg font-semibold text-gray-800">Format Data View</h1>
            <input
              type="text"
              value={formatViewSearch}
              onChange={(e) => setFormatViewSearch(e.target.value)}
              placeholder="Search formats & data..."
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm w-52 focus:ring-1 focus:ring-blue-500"
            />
            <button type="button" onClick={() => setFormatViewSearch('')} className="px-2 py-1.5 bg-gray-200 rounded hover:bg-gray-300 text-sm">Clear</button>
            <select
              value={selectedFormatId}
              onChange={(e) => setSelectedFormatId(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-800 bg-white min-w-[200px]"
            >
              {loading ? (
                <option value="">Loading formats...</option>
              ) : filteredFormatsForView.length === 0 ? (
                <option value="">No formats match search</option>
              ) : (
                filteredFormatsForView.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name}
                  </option>
                ))
              )}
            </select>
            <span className="text-xs text-gray-500">{filteredFormatsForView.length} of {formats.length} format(s)</span>
            {selectedFormat && (
              <span className="text-sm text-gray-500">
                {filteredRows.length}{filteredRows.length !== rows.length ? ` of ${rows.length}` : ''} rows × {columns.length} columns
              </span>
            )}
            <Link
              href="/admin/excel-formats"
              className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
            >
              Manage Excel Formats
            </Link>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-2 bg-[#e2e8f0]">
          {!selectedFormatId ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              Select a format to view its data.
            </div>
          ) : loadingView ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              Loading format data...
            </div>
          ) : rows.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              No template data for this format.
            </div>
          ) : (
            <div
              className="inline-block min-w-full border border-gray-300 bg-white shadow-sm"
              style={{ fontFamily: 'Calibri, Arial, sans-serif' }}
            >
              <table className="border-collapse" style={{ tableLayout: 'fixed', minWidth: 'max-content' }}>
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-20 w-12 min-w-12 px-2 py-1.5 text-center text-xs font-semibold bg-[#217346] text-white border border-gray-400 shadow-sm">
                      {/* Excel top-left corner */}
                    </th>
                    {sortedColumns.map((col, idx) => (
                      <th
                        key={col.name}
                        className="sticky top-0 z-10 min-w-[120px] max-w-[200px] px-2 py-1.5 text-left text-xs font-semibold bg-[#217346] text-white border border-gray-400 whitespace-nowrap"
                      >
                        <span className="text-[10px] text-gray-200 mr-1">{getColumnLetter(idx)}</span>
                        {col.name}
                        {col.required && <span className="text-red-300 ml-0.5">*</span>}
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
                      {sortedColumns.map((col) => (
                        <td
                          key={col.name}
                          className={`px-2 py-1 text-sm border border-gray-300 min-w-[120px] max-w-[200px] ${
                            col.editable === false ? 'bg-[#f9fafb]' : 'bg-white'
                          }`}
                        >
                          {highlightAllSearchMatches(formatCellValueForDisplay(row[col.name], col.type), debouncedFormatViewSearch)}
                        </td>
                      ))}
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
