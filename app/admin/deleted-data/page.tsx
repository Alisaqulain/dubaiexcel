'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';
import { formatCellValueForDisplay } from '@/lib/formatColumnUtils';
import { useDebounce, SEARCH_DEBOUNCE_MS } from '@/lib/useDebounce';

type DeletedRow = { rowIndex: number; row: Record<string, unknown> };

type DeletedBlock = {
  formatId: string;
  formatName: string;
  columns: string[];
  columnTypes: Record<string, string>;
  deletedRows: DeletedRow[];
};

export default function DeletedDataPage() {
  return (
    <ProtectedRoute requireAdmin>
      <div className="flex min-h-screen flex-col">
        <Navigation />
        <main className="flex min-h-0 flex-1 flex-col bg-slate-50">
          <DeletedDataContent />
        </main>
      </div>
    </ProtectedRoute>
  );
}

function DeletedDataContent() {
  const { token } = useAuth();
  const searchParams = useSearchParams();
  const formatIdFromUrl = searchParams.get('formatId') || '';

  const [loading, setLoading] = useState(true);
  const [blocks, setBlocks] = useState<DeletedBlock[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [selected, setSelected] = useState<Record<string, Set<number>>>({});
  const [rowSearch, setRowSearch] = useState('');
  const debouncedSearch = useDebounce(rowSearch, SEARCH_DEBOUNCE_MS);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setMessage(null);
    try {
      const q = formatIdFromUrl ? `?formatId=${encodeURIComponent(formatIdFromUrl)}` : '';
      const res = await fetch(`/api/admin/template-deleted-rows${q}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await res.json();
      if (!json.success) {
        setBlocks([]);
        setMessage({ type: 'error', text: json.error || 'Failed to load' });
        return;
      }
      setBlocks(json.data || []);
      setSelected({});
    } catch (e: unknown) {
      setBlocks([]);
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Failed to load' });
    } finally {
      setLoading(false);
    }
  }, [token, formatIdFromUrl]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const toggle = (formatId: string, rowIndex: number) => {
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set(next[formatId] || []);
      if (set.has(rowIndex)) set.delete(rowIndex);
      else set.add(rowIndex);
      next[formatId] = set;
      return next;
    });
  };

  const selectAllInFormat = (formatId: string, rowIndices: number[]) => {
    setSelected((prev) => ({
      ...prev,
      [formatId]: new Set(rowIndices),
    }));
  };

  const clearFormatSelection = (formatId: string) => {
    setSelected((prev) => ({ ...prev, [formatId]: new Set() }));
  };

  const totalSelected = useMemo(
    () => Object.values(selected).reduce((acc, s) => acc + s.size, 0),
    [selected]
  );

  const totalDeletedRows = useMemo(
    () => blocks.reduce((acc, b) => acc + b.deletedRows.length, 0),
    [blocks]
  );

  const restore = async (formatId: string, rowIndices: number[]) => {
    if (!token || rowIndices.length === 0) return;
    setRestoring(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/template-deleted-rows/restore', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ formatId, rowIndices }),
      });
      const json = await res.json();
      if (!json.success) {
        setMessage({ type: 'error', text: json.error || 'Restore failed' });
        return;
      }
      setMessage({ type: 'success', text: json.data?.message || 'Restored.' });
      clearFormatSelection(formatId);
      await fetchData();
    } catch (e: unknown) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Restore failed' });
    } finally {
      setRestoring(false);
    }
  };

  const filterRows = (block: DeletedBlock): DeletedRow[] => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return block.deletedRows;
    return block.deletedRows.filter((dr) => {
      const idxMatch = String(dr.rowIndex + 1).includes(q);
      if (idxMatch) return true;
      return block.columns.some((col) => {
        const colType = block.columnTypes[col] || 'text';
        const display = formatCellValueForDisplay(dr.row[col], colType);
        return display.toLowerCase().includes(q);
      });
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-4 shadow-sm">
        <div className="mx-auto flex max-w-[100%] flex-wrap items-center gap-3">
          <Link
            href={
              formatIdFromUrl
                ? `/admin/format-view?formatId=${encodeURIComponent(formatIdFromUrl)}`
                : '/admin/format-view'
            }
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            ← Back to format view
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-gray-900">Deleted template rows</h1>
            <p className="text-sm text-gray-600">
              Full row data for rows removed in format view. Restoring makes them visible again as fresh template
              rows.
            </p>
          </div>
        </div>

        <div className="mx-auto mt-3 flex max-w-[100%] flex-wrap items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Search</label>
          <input
            type="text"
            value={rowSearch}
            onChange={(e) => setRowSearch(e.target.value)}
            placeholder="Search all columns or row #…"
            className="w-64 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          {rowSearch && (
            <button
              type="button"
              onClick={() => setRowSearch('')}
              className="rounded-md bg-gray-200 px-3 py-2 text-sm hover:bg-gray-300"
            >
              Clear
            </button>
          )}
          {!loading && (
            <span className="text-sm text-gray-500">
              {totalDeletedRows} deleted row{totalDeletedRows !== 1 ? 's' : ''}
              {debouncedSearch.trim() ? ' (filtered per format below)' : ''}
            </span>
          )}
        </div>

        {message && (
          <div
            className={`mx-auto mt-3 max-w-[100%] rounded p-3 text-sm ${
              message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'
            }`}
          >
            {message.text}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {loading ? (
          <p className="text-gray-500">Loading…</p>
        ) : blocks.length === 0 ? (
          <p className="text-gray-600">No deleted rows for {formatIdFromUrl ? 'this format' : 'any format'}.</p>
        ) : (
          <div className="mx-auto space-y-6">
            {blocks.map((block) => {
              const fmtSel = selected[block.formatId] || new Set<number>();
              const visibleRows = filterRows(block);
              const idxs = block.deletedRows.map((r) => r.rowIndex);
              return (
                <section
                  key={block.formatId}
                  className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
                >
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3">
                    <div>
                      <h2 className="font-semibold text-gray-900">{block.formatName}</h2>
                      <p className="text-xs text-gray-500">
                        {visibleRows.length}
                        {debouncedSearch.trim() ? ` of ${block.deletedRows.length}` : ''} deleted rows ·{' '}
                        {block.columns.length} columns
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="text-sm px-2 py-1 text-blue-700 hover:underline"
                        onClick={() => selectAllInFormat(block.formatId, idxs)}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="text-sm px-2 py-1 text-gray-600 hover:underline"
                        onClick={() => clearFormatSelection(block.formatId)}
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        disabled={restoring || fmtSel.size === 0}
                        className="text-sm rounded-md bg-green-600 px-3 py-1.5 text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => void restore(block.formatId, Array.from(fmtSel))}
                      >
                        Restore selected ({fmtSel.size})
                      </button>
                    </div>
                  </div>

                  {visibleRows.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-gray-500">No rows match your search.</p>
                  ) : (
                    <div className="min-h-0 overflow-auto" style={{ fontFamily: 'Calibri, Arial, sans-serif' }}>
                      <table className="min-w-max w-full border-collapse text-xs">
                        <thead className="sticky top-0 z-10 bg-slate-900 text-white">
                          <tr>
                            <th className="w-10 border border-slate-700 px-2 py-1.5 text-center"> </th>
                            <th className="w-14 border border-slate-700 px-2 py-1.5 text-center">Row #</th>
                            {block.columns.map((col) => (
                              <th
                                key={col}
                                className="whitespace-nowrap border border-slate-700 px-2 py-1.5 text-left font-semibold"
                              >
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {visibleRows.map((dr) => (
                            <tr key={dr.rowIndex} className="border-t border-gray-100 hover:bg-slate-50">
                              <td className="border border-gray-200 px-2 py-1 text-center">
                                <input
                                  type="checkbox"
                                  checked={fmtSel.has(dr.rowIndex)}
                                  onChange={() => toggle(block.formatId, dr.rowIndex)}
                                  className="h-4 w-4"
                                  aria-label={`Select row ${dr.rowIndex + 1}`}
                                />
                              </td>
                              <td className="border border-gray-200 px-2 py-1 text-center font-mono text-gray-600">
                                {dr.rowIndex + 1}
                              </td>
                              {block.columns.map((col) => {
                                const colType = block.columnTypes[col] || 'text';
                                const display = formatCellValueForDisplay(dr.row[col], colType);
                                return (
                                  <td
                                    key={col}
                                    className="max-w-[280px] break-words border border-gray-200 px-2 py-1 align-top"
                                  >
                                    {display}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            })}
            {totalSelected > 0 && (
              <p className="text-sm text-gray-500">
                {totalSelected} row(s) selected — use Restore selected on each format block.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
