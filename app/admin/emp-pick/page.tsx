'use client';

import { useState, useEffect, useCallback } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';
import { useDebounce, SEARCH_DEBOUNCE_MS } from '@/lib/useDebounce';

interface Column {
  name: string;
  type: string;
  required: boolean;
  editable: boolean;
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

export default function EmpPickPage() {
  return (
    <ProtectedRoute requireAdmin>
      <Navigation />
      <EmpPickContent />
    </ProtectedRoute>
  );
}

function EmpPickContent() {
  const { token } = useAuth();
  const [formats, setFormats] = useState<ExcelFormat[]>([]);
  const [selectedFormatId, setSelectedFormatId] = useState<string>('');
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [picks, setPicks] = useState<Record<string, { empId: string; empName: string; pickedBy: string }>>({});
  const [loading, setLoading] = useState(true);
  const [loadingView, setLoadingView] = useState(false);
  const [employees, setEmployees] = useState<{ _id: string; empId: string; name: string }[]>([]);
  const [releasingRow, setReleasingRow] = useState<number | null>(null);
  const [assigningRow, setAssigningRow] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS);

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
        if (list.length > 0 && !selectedFormatId) {
          setSelectedFormatId(list[0]._id);
        }
      }
    } catch (err) {
      console.error('Fetch formats error:', err);
      setMessage({ type: 'error', text: 'Failed to load formats' });
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
        } else {
          setRows([]);
          setColumns([]);
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
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to release' });
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
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to assign' });
    } finally {
      setAssigningRow(null);
    }
  };

  const sortedColumns = [...columns].sort((a, b) => a.order - b.order);
  const rowSearch = debouncedSearch.trim().toLowerCase();
  const filteredIndices =
    rowSearch
      ? rows
          .map((_, i) => i)
          .filter((i) =>
            sortedColumns.some((col) =>
              String(formatCellValueForDisplay(rows[i][col.name], col.type)).toLowerCase().includes(rowSearch)
            )
          )
      : rows.map((_, i) => i);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-full mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Emp pick</h1>
        <p className="text-sm text-gray-600 mb-4">
          View which employee picked which template row. You can release a row so another employee can pick it.
        </p>

        {message && (
          <div
            className={`mb-4 p-3 rounded-md text-sm ${
              message.type === 'success' ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-red-100 text-red-800 border border-red-300'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-200 bg-[#f8f9fa]">
            <label className="text-sm font-medium text-gray-700">Format:</label>
            <select
              value={selectedFormatId}
              onChange={(e) => setSelectedFormatId(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-800 bg-white min-w-[220px]"
            >
              {loading ? (
                <option value="">Loading formats...</option>
              ) : formats.length === 0 ? (
                <option value="">No formats</option>
              ) : (
                formats.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name}
                  </option>
                ))
              )}
            </select>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search in rows..."
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm w-48 focus:ring-1 focus:ring-blue-500"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="px-2 py-1.5 bg-gray-200 rounded hover:bg-gray-300 text-sm">
                Clear
              </button>
            )}
            <span className="text-xs text-gray-500">
              {filteredIndices.length}{filteredIndices.length !== rows.length ? ` of ${rows.length}` : ''} rows
            </span>
          </div>

          <div className="overflow-auto max-h-[70vh] p-2 bg-[#e2e8f0]">
            {!selectedFormatId ? (
              <div className="flex items-center justify-center h-48 text-gray-500">Select a format.</div>
            ) : loadingView ? (
              <div className="flex items-center justify-center h-48 text-gray-500">Loading...</div>
            ) : rows.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-gray-500">No template data for this format.</div>
            ) : (
              <div className="inline-block min-w-full border border-gray-300 bg-white shadow-sm" style={{ fontFamily: 'Calibri, Arial, sans-serif' }}>
                <table className="border-collapse" style={{ tableLayout: 'fixed', minWidth: 'max-content' }}>
                  <thead>
                    <tr>
                      <th className="sticky left-0 top-0 z-20 w-12 min-w-12 px-2 py-1.5 text-center text-xs font-semibold bg-[#217346] text-white border border-gray-400">
                        #
                      </th>
                      {sortedColumns.map((col, idx) => (
                        <th
                          key={col.name}
                          className="sticky top-0 z-10 min-w-[100px] max-w-[180px] px-2 py-1.5 text-left text-xs font-semibold bg-[#217346] text-white border border-gray-400 whitespace-nowrap"
                        >
                          <span className="text-[10px] text-gray-200 mr-1">{getColumnLetter(idx)}</span>
                          {col.name}
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
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIndices.map((idx) => {
                      const row = rows[idx];
                      const pick = picks[String(idx)];
                      return (
                        <tr key={idx} className={pick ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-[#e8f4ea]'}>
                          <td className="sticky left-0 z-10 w-12 min-w-12 px-2 py-1 text-center text-xs font-medium bg-[#f3f4f6] text-gray-600 border border-gray-300">
                            {idx + 1}
                          </td>
                          {sortedColumns.map((col) => (
                            <td
                              key={col.name}
                              className="px-2 py-1 text-sm border border-gray-300 min-w-[100px] max-w-[180px] bg-white"
                            >
                              {formatCellValueForDisplay(row[col.name], col.type)}
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
    </div>
  );
}
