'use client';

import { useMemo, type ReactNode } from 'react';
import { highlightAllSearchMatches } from '../../../components/HighlightSearch';

const SUBMITTED_BY = 'Submitted by';

export interface RowMeta {
  isModified: boolean;
  editedBy: string;
}

interface MergedDataTableProps {
  columns: string[];
  rows: Record<string, unknown>[];
  rowMeta: RowMeta[];
  search: string;
  onSearchChange: (v: string) => void;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  loading: boolean;
  error: string | null;
  /** Table grows to fill parent height (scroll inside grid). */
  fillScreen?: boolean;
}

function colLetter(i: number): string {
  let s = '';
  let n = i;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

export function MergedDataTable({
  columns,
  rows,
  rowMeta,
  search,
  onSearchChange,
  page,
  pageSize,
  onPageChange,
  loading,
  error,
  fillScreen = false,
}: MergedDataTableProps) {
  const q = search.trim().toLowerCase();

  const filteredIndices = useMemo(() => {
    if (!q) return rows.map((_, i) => i);
    return rows
      .map((row, i) => ({ row, i }))
      .filter(({ row }) => columns.some((c) => String(row[c] ?? '').toLowerCase().includes(q)))
      .map(({ i }) => i);
  }, [rows, columns, q]);

  const totalPages = Math.max(1, Math.ceil(filteredIndices.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * pageSize;
  const pageIndices = filteredIndices.slice(start, start + pageSize);

  const shell = (children: ReactNode) => (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm ${
        fillScreen ? 'h-full min-h-0' : ''
      }`}
    >
      {children}
    </div>
  );

  if (loading) {
    return shell(
      <div
        className={`flex items-center justify-center text-sm text-gray-500 ${
          fillScreen ? 'min-h-0 flex-1' : 'min-h-[400px]'
        }`}
      >
        Loading merged data…
      </div>
    );
  }

  if (error) {
    return shell(
      <div className={`px-4 py-3 text-sm text-red-800 ${fillScreen ? 'min-h-0 flex-1 overflow-auto' : ''}`}>
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">{error}</div>
      </div>
    );
  }

  if (rows.length === 0) {
    return shell(
      <div
        className={`flex flex-col items-center justify-center p-8 text-center text-sm text-gray-500 ${
          fillScreen ? 'min-h-0 flex-1' : 'min-h-[320px]'
        }`}
      >
        <p className="font-medium text-gray-700">No data found</p>
        <p className="mt-1 max-w-md">Select a format from the list to load the merged sheet.</p>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm ${
        fillScreen ? 'h-full min-h-0' : ''
      }`}
    >
      <div className="flex shrink-0 flex-wrap items-end gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3">
        <div className="min-w-[200px] flex-1">
          <label className="block text-xs font-medium text-gray-600">Search rows</label>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter across all columns…"
            className="mt-1 w-full max-w-md rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="text-xs text-gray-500">
          {filteredIndices.length === rows.length ? (
            <span>
              <strong>{rows.length}</strong> rows × <strong>{columns.length}</strong> columns
            </span>
          ) : (
            <span>
              <strong>{filteredIndices.length}</strong> of <strong>{rows.length}</strong> rows (filtered)
            </span>
          )}
        </div>
      </div>

      <div className={`min-h-0 overflow-auto ${fillScreen ? 'flex-1' : ''}`} style={fillScreen ? undefined : { maxHeight: 'min(70vh, 720px)' }}>
        <table className="min-w-max border-collapse text-sm" style={{ fontFamily: 'Calibri, Arial, sans-serif' }}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 w-12 min-w-[3rem] border border-gray-300 bg-[#1f6f4a] px-2 py-2 text-center text-xs font-semibold text-white">
                #
              </th>
              <th className="border border-gray-300 bg-[#1f6f4a] px-2 py-2 text-center text-xs font-semibold text-white w-20 min-w-[5rem]">
                Status
              </th>
              {columns.map((c, idx) => (
                <th
                  key={c}
                  className={`border border-gray-300 px-2 py-2 text-left text-xs font-semibold text-white ${
                    c === SUBMITTED_BY ? 'bg-amber-700 min-w-[140px]' : 'bg-[#1f6f4a] min-w-[100px]'
                  }`}
                >
                  <span className="mr-1 text-[10px] text-white/70">{colLetter(idx)}</span>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageIndices.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2} className="border border-gray-200 px-4 py-8 text-center text-gray-500">
                  No rows match your search.
                </td>
              </tr>
            ) : (
              pageIndices.map((rowIndex, displayIdx) => {
                const row = rows[rowIndex];
                const meta = rowMeta[rowIndex] || { isModified: false, editedBy: '' };
                const modified = meta.isModified;
                return (
                  <tr
                    key={rowIndex}
                    className={modified ? 'bg-amber-50/90 hover:bg-amber-100/90' : 'bg-white hover:bg-green-50/40'}
                  >
                    <td className="sticky left-0 z-10 w-12 min-w-[3rem] border border-gray-300 bg-gray-100 px-2 py-1.5 text-center text-xs text-gray-600">
                      {rowIndex + 1}
                    </td>
                    <td className="border border-gray-300 bg-gray-50 px-2 py-1.5 text-xs">
                      {modified ? (
                        <span className="font-medium text-amber-900" title={meta.editedBy || 'Edited'}>
                          Edited
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    {columns.map((c) => {
                      const raw = row[c];
                      const text = raw === null || raw === undefined ? '' : String(raw);
                      return (
                        <td
                          key={c}
                          className={`max-w-[280px] border border-gray-300 px-2 py-1.5 align-top break-words whitespace-pre-wrap ${
                            c === SUBMITTED_BY && modified ? 'font-medium text-amber-900' : 'text-gray-900'
                          }`}
                          title={text}
                        >
                          {highlightAllSearchMatches(text, search)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-600">
        <div>
          Page <strong>{safePage + 1}</strong> / <strong>{totalPages}</strong>
          {q && (
            <span className="ml-2 text-gray-500">
              ({filteredIndices.length} match{filteredIndices.length !== 1 ? 'es' : ''})
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={safePage <= 0}
            onClick={() => onPageChange(safePage - 1)}
            className="rounded border border-gray-300 bg-white px-2 py-1 hover:bg-gray-100 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={safePage >= totalPages - 1}
            onClick={() => onPageChange(safePage + 1)}
            className="rounded border border-gray-300 bg-white px-2 py-1 hover:bg-gray-100 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
