'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { highlightAllSearchMatches } from '../../../components/HighlightSearch';
import { AdminDatePicker } from '../../all-merge-data/components/AdminDatePicker';
import { SUBMITTED_BY_COL, PICKED_BY_COL } from '@/lib/formatDailyMergeConstants';

interface FormatColumn {
  name: string;
  type: 'text' | 'number' | 'date' | 'email' | 'dropdown' | string;
  required: boolean;
  editable: boolean;
  order: number;
  validation?: { options?: string[] };
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

function localDayRangeParams(ymd: string): { rangeStart: string; rangeEnd: string } {
  const [y, m, d] = ymd.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { rangeStart: start.toISOString(), rangeEnd: end.toISOString() };
}

interface RowMeta {
  isModified: boolean;
  editedBy: string;
}

export function FormatStyleDailyMerge({
  token,
  formatId,
  formatName,
  mergeDate,
  onMergeDateChange,
  refreshKey,
  quickDates,
  formatsLoading,
}: {
  token: string | null;
  formatId: string | null;
  formatName: string;
  mergeDate: string;
  onMergeDateChange: (ymd: string) => void;
  refreshKey: number;
  quickDates: string[];
  formatsLoading: boolean;
}) {
  const [rowSearch, setRowSearch] = useState('');
  const [fmtLoading, setFmtLoading] = useState(false);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formatColumns, setFormatColumns] = useState<FormatColumn[]>([]);
  const [mergeColumns, setMergeColumns] = useState<string[]>([]);
  const [mergeRows, setMergeRows] = useState<Record<string, unknown>[]>([]);
  const [rowMeta, setRowMeta] = useState<RowMeta[]>([]);
  const [rowTemplateIndices, setRowTemplateIndices] = useState<(number | null)[]>([]);
  const [fileCount, setFileCount] = useState(0);

  const load = useCallback(async () => {
    if (!token || !formatId) {
      setFormatColumns([]);
      setMergeColumns([]);
      setMergeRows([]);
      setRowMeta([]);
      setRowTemplateIndices([]);
      setError(null);
      return;
    }
    setFmtLoading(true);
    setMergeLoading(true);
    setError(null);
    try {
      const { rangeStart, rangeEnd } = localDayRangeParams(mergeDate);
      const q = new URLSearchParams({
        formatId,
        date: mergeDate,
        rangeStart,
        rangeEnd,
      });
      const [viewRes, mergeRes] = await Promise.all([
        fetch(`/api/admin/excel-formats/${formatId}/view`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }).then((r) => r.json()),
        fetch(`/api/admin/merged-data?${q}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }).then((r) => r.json()),
      ]);

      if (!viewRes.success) {
        throw new Error(viewRes.error || 'Failed to load format');
      }
      if (!mergeRes.success) {
        throw new Error(mergeRes.error || 'Failed to load merge');
      }

      const cols = (viewRes.data?.columns || []) as FormatColumn[];
      setFormatColumns(cols);

      const d = mergeRes.data;
      setMergeColumns(Array.isArray(d.columns) ? d.columns : []);
      setMergeRows(Array.isArray(d.rows) ? d.rows : []);
      setRowMeta(Array.isArray(d.rowMeta) ? d.rowMeta : []);
      setRowTemplateIndices(
        Array.isArray(d.rowTemplateIndices) ? (d.rowTemplateIndices as (number | null)[]) : []
      );
      setFileCount(Number(d.fileCount) || 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setFormatColumns([]);
      setMergeColumns([]);
      setMergeRows([]);
      setRowMeta([]);
      setRowTemplateIndices([]);
    } finally {
      setFmtLoading(false);
      setMergeLoading(false);
    }
  }, [token, formatId, mergeDate, refreshKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedFormatCols = useMemo(() => [...formatColumns].sort((a, b) => a.order - b.order), [formatColumns]);

  const displayColumnNames = useMemo(() => {
    const fmtNames = sortedFormatCols.map((c) => c.name);
    const fmtSet = new Set(fmtNames);
    const tail = mergeColumns.filter((c) => !fmtSet.has(c));
    return [...fmtNames, ...tail];
  }, [sortedFormatCols, mergeColumns]);

  const colTypeByName = useMemo(() => {
    const m = new Map<string, string>();
    sortedFormatCols.forEach((c) => m.set(c.name, c.type));
    return m;
  }, [sortedFormatCols]);

  const editableByName = useMemo(() => {
    const m = new Map<string, boolean>();
    sortedFormatCols.forEach((c) => m.set(c.name, c.editable !== false));
    return m;
  }, [sortedFormatCols]);

  const q = rowSearch.trim().toLowerCase();
  const filteredRowIndices = useMemo(() => {
    if (!q) return mergeRows.map((_, i) => i);
    return mergeRows
      .map((row, i) => ({ row, i }))
      .filter(({ row }) =>
        displayColumnNames.some((col) => {
          const t = colTypeByName.get(col) || 'text';
          const raw = row[col];
          const text =
            colTypeByName.has(col) && t
              ? formatCellValueForDisplay(raw, t).toLowerCase()
              : String(raw ?? '')
                  .trim()
                  .toLowerCase();
          return text.includes(q);
        })
      )
      .map(({ i }) => i);
  }, [mergeRows, displayColumnNames, colTypeByName, q]);

  const loading = fmtLoading || mergeLoading;

  const downloadMerged = async () => {
    if (!token || !formatId) return;
    const { rangeStart, rangeEnd } = localDayRangeParams(mergeDate);
    const qs = new URLSearchParams({
      formatId,
      date: mergeDate,
      rangeStart,
      rangeEnd,
      download: '1',
    });
    try {
      const res = await fetch(`/api/admin/merged-data?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(j.error || 'Download failed');
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition');
      let fname = `merged_${mergeDate}.xlsx`;
      if (cd) {
        const m = cd.match(/filename="([^"]+)"/) || cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i);
        if (m) fname = decodeURIComponent(m[1].trim());
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fname;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Download failed');
    }
  };

  return (
    <div className="flex h-[min(85vh,calc(100vh-5rem))] min-h-[420px] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
      <div className="shrink-0 space-y-3 border-b border-gray-200 bg-[#f8f9fa] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 gap-y-2">
          <h2 className="text-lg font-semibold text-gray-800">Full sheet by date</h2>
          <span className="text-xs text-gray-500">
            Same complete template as Format &amp; picks, with that day&apos;s user saves merged in (free rows stay
            master data).
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <AdminDatePicker
            id="user-saves-merge-date"
            value={mergeDate}
            onChange={onMergeDateChange}
            disabled={formatsLoading || !formatId}
          />
          {quickDates.length > 0 && (
            <div className="min-w-0 flex-1 space-y-1">
              <span className="block text-xs font-medium text-gray-600">Days with saves</span>
              <div className="flex max-w-full flex-wrap gap-1">
                {quickDates.slice(0, 24).map((ymd) => (
                  <button
                    key={ymd}
                    type="button"
                    onClick={() => onMergeDateChange(ymd)}
                    className={`rounded border px-2 py-0.5 text-xs font-medium ${
                      ymd === mergeDate
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {ymd}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void downloadMerged()}
            disabled={!formatId || loading}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-emerald-700 disabled:opacity-50"
          >
            Download merged Excel
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || !formatId}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Reload merge'}
          </button>
          {formatId && (
            <Link
              href={`/admin/format-view?formatId=${encodeURIComponent(formatId)}`}
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800 hover:bg-blue-100"
            >
              Format &amp; picks (edit template)
            </Link>
          )}
          <span className="text-xs text-gray-600">
            {formatName && <span className="font-medium text-gray-800">{formatName}</span>}
            {formatName && ' · '}
            {mergeDate} · {fileCount} save file{fileCount !== 1 ? 's' : ''} · {mergeRows.length} row
            {mergeRows.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-gray-600">Search rows</label>
          <input
            type="search"
            value={rowSearch}
            onChange={(e) => setRowSearch(e.target.value)}
            placeholder="Filter like Format view…"
            className="w-52 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500"
          />
          {rowSearch && (
            <button
              type="button"
              onClick={() => setRowSearch('')}
              className="rounded bg-gray-200 px-2 py-1.5 text-sm hover:bg-gray-300"
            >
              Clear
            </button>
          )}
        </div>
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-[#e2e8f0] p-2">
        {!formatId ? (
          <div className="flex h-full items-center justify-center text-gray-500">Select a format above.</div>
        ) : loading && mergeRows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-500">Loading merged sheet…</div>
        ) : mergeRows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-500">No rows for this merge.</div>
        ) : (
          <div
            className="inline-block min-w-full border border-gray-300 bg-white shadow-sm"
            style={{ fontFamily: 'Calibri, Arial, sans-serif' }}
          >
            <table className="border-collapse" style={{ tableLayout: 'fixed', minWidth: 'max-content' }}>
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-20 w-12 min-w-12 border border-gray-400 bg-[#217346] px-2 py-1.5 text-center text-xs font-semibold text-white shadow-sm">
                    #
                  </th>
                  {displayColumnNames.map((colName, idx) => {
                    const isMeta =
                      colName === PICKED_BY_COL ||
                      colName === SUBMITTED_BY_COL ||
                      colName.startsWith('Saved at') ||
                      colName.startsWith('Last saved');
                    const fmtCol = sortedFormatCols.find((c) => c.name === colName);
                    const required = fmtCol?.required;
                    return (
                      <th
                        key={colName}
                        className={`sticky top-0 z-10 min-w-[100px] max-w-[200px] border border-gray-400 px-2 py-1.5 text-left text-xs font-semibold whitespace-nowrap text-white ${
                          isMeta ? 'bg-amber-700' : 'bg-[#217346]'
                        }`}
                      >
                        <span className="mr-1 text-[10px] text-gray-200">{getColumnLetter(idx)}</span>
                        {colName}
                        {required && <span className="ml-0.5 text-red-300">*</span>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredRowIndices.map((rowIdx) => {
                  const row = mergeRows[rowIdx];
                  const meta = rowMeta[rowIdx];
                  const storageIdx = rowTemplateIndices[rowIdx];
                  const pickedLabel = String(row[PICKED_BY_COL] ?? '').trim();
                  const isAppended = storageIdx == null;
                  const hasSave = meta?.isModified && Boolean(meta?.editedBy?.trim());
                  const rowBg = isAppended
                    ? 'bg-sky-50 hover:bg-sky-100/80'
                    : pickedLabel
                      ? 'bg-amber-50 hover:bg-amber-100/90'
                      : hasSave
                        ? 'bg-lime-50/90 hover:bg-lime-100/80'
                        : 'hover:bg-[#e8f4ea]';
                  return (
                    <tr key={rowIdx} className={rowBg}>
                      <td className="sticky left-0 z-10 w-12 min-w-12 border border-gray-300 bg-[#f3f4f6] px-2 py-1 text-center text-xs font-medium text-gray-600">
                        <span title={isAppended ? 'Row from save file (not in template index)' : `Template #${storageIdx != null ? storageIdx + 1 : ''}`}>
                          {rowIdx + 1}
                        </span>
                      </td>
                      {displayColumnNames.map((colName) => {
                        const t = colTypeByName.get(colName) || 'text';
                        const editable = editableByName.get(colName) !== false;
                        const isFmt = colTypeByName.has(colName);
                        const raw = row[colName];
                        const show =
                          isFmt && t
                            ? formatCellValueForDisplay(raw, t)
                            : raw === null || raw === undefined
                              ? ''
                              : String(raw);
                        const metaCol =
                          colName === PICKED_BY_COL ||
                          colName === SUBMITTED_BY_COL ||
                          colName.startsWith('Saved at') ||
                          colName.startsWith('Last saved');
                        return (
                          <td
                            key={colName}
                            className={`min-w-[100px] max-w-[200px] border border-gray-300 px-2 py-1 text-sm ${
                              metaCol
                                ? 'bg-amber-50/40'
                                : isFmt && !editable
                                  ? 'bg-[#f9fafb]'
                                  : 'bg-white'
                            }`}
                          >
                            {highlightAllSearchMatches(show, rowSearch)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
