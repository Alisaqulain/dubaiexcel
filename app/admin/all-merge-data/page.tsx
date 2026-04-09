'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';
import { AdminDatePicker } from './components/AdminDatePicker';
import { FormatListPanel, type FormatListItem } from './components/FormatListPanel';
import { MergedDataTable, type RowMeta } from './components/MergedDataTable';

function localDayRangeParams(ymd: string): { rangeStart: string; rangeEnd: string } {
  const [y, m, d] = ymd.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { rangeStart: start.toISOString(), rangeEnd: end.toISOString() };
}

export default function AllMergeDataAdminPage() {
  return (
    <ProtectedRoute requireAdmin>
      <div className="flex min-h-screen flex-col">
        <Navigation />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50">
          <AllMergeDataDashboard />
        </main>
      </div>
    </ProtectedRoute>
  );
}

function AllMergeDataDashboard() {
  const { token } = useAuth();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const dayRange = useMemo(() => localDayRangeParams(date), [date]);

  const [formatsLoading, setFormatsLoading] = useState(false);
  const [formatsError, setFormatsError] = useState<string | null>(null);
  const [formats, setFormats] = useState<FormatListItem[]>([]);
  const [formatFilter, setFormatFilter] = useState('');

  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);

  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [rowMeta, setRowMeta] = useState<RowMeta[]>([]);
  const [mergeSummary, setMergeSummary] = useState<{
    formatName: string;
    fileCount: number;
    rowCount: number;
  } | null>(null);

  const [tableSearch, setTableSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const loadFormats = useCallback(async () => {
    if (!token) return;
    setFormatsLoading(true);
    setFormatsError(null);
    try {
      const res = await fetch('/api/admin/excel-formats', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to load formats');
      }
      const list = (json.data || []) as Array<{
        _id: string;
        name: string;
        description?: string;
        columns?: unknown[];
        active?: boolean;
      }>;
      setFormats(
        list.map((f) => ({
          id: String(f._id),
          name: f.name || 'Untitled',
          description: f.description,
          columnCount: Array.isArray(f.columns) ? f.columns.length : 0,
          active: f.active !== false,
        }))
      );
    } catch (e: unknown) {
      setFormatsError(e instanceof Error ? e.message : 'Failed to load formats');
      setFormats([]);
    } finally {
      setFormatsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadFormats();
  }, [loadFormats]);

  const loadMerged = useCallback(
    async (formatId: string) => {
      if (!token) return;
      setMergeLoading(true);
      setMergeError(null);
      setTableSearch('');
      setPage(0);
      try {
        const q = new URLSearchParams({
          formatId,
          date,
          rangeStart: dayRange.rangeStart,
          rangeEnd: dayRange.rangeEnd,
        });
        const res = await fetch(`/api/admin/merged-data?${q}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Failed to load merged data');
        }
        const d = json.data;
        setColumns(Array.isArray(d.columns) ? d.columns : []);
        setRows(Array.isArray(d.rows) ? d.rows : []);
        setRowMeta(Array.isArray(d.rowMeta) ? d.rowMeta : []);
        setMergeSummary({
          formatName: String(d.formatName || ''),
          fileCount: Number(d.fileCount) || 0,
          rowCount: Number(d.rowCount) || 0,
        });
      } catch (e: unknown) {
        setMergeError(e instanceof Error ? e.message : 'Failed to load merged data');
        setColumns([]);
        setRows([]);
        setRowMeta([]);
        setMergeSummary(null);
      } finally {
        setMergeLoading(false);
      }
    },
    [token, date, dayRange.rangeStart, dayRange.rangeEnd]
  );

  const onSelectFormat = useCallback((f: FormatListItem) => {
    setSelectedFormatId(f.id);
  }, []);

  useEffect(() => {
    if (!selectedFormatId || !token) return;
    void loadMerged(selectedFormatId);
  }, [date, dayRange.rangeStart, dayRange.rangeEnd, selectedFormatId, token, loadMerged]);

  const downloadExcel = useCallback(async () => {
    if (!token || !selectedFormatId) return;
    const q = new URLSearchParams({
      formatId: selectedFormatId,
      date,
      rangeStart: dayRange.rangeStart,
      rangeEnd: dayRange.rangeEnd,
      download: '1',
    });
    const url = `/api/admin/merged-data?${q}`;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(j.error || 'Download failed');
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition');
      let fname = `merged_${date}.xlsx`;
      if (cd) {
        const m = cd.match(/filename="([^"]+)"/) || cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i);
        if (m) fname = decodeURIComponent(m[1].trim());
      }
      const obj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = obj;
      a.download = fname;
      a.click();
      URL.revokeObjectURL(obj);
    } catch {
      alert('Download failed');
    }
  }, [token, selectedFormatId, date, dayRange.rangeStart, dayRange.rangeEnd]);

  useEffect(() => {
    setPage(0);
  }, [tableSearch]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-2">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-2">
        <div>
          <h1 className="text-lg font-bold text-gray-900">All merge data</h1>
          <p className="hidden text-xs text-gray-600 sm:block">
            Date + format → full sheet. Edits that day in amber.{' '}
            <Link href="/admin/excel-formats" className="font-medium text-blue-700 hover:underline">
              Manage formats
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <AdminDatePicker value={date} onChange={setDate} disabled={formatsLoading} id="merge-date" />
          <button
            type="button"
            onClick={() => void loadFormats()}
            disabled={formatsLoading}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-50"
          >
            {formatsLoading ? 'Refreshing…' : 'Refresh formats'}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:gap-4">
        <aside className="flex w-full shrink-0 flex-col lg:w-80 lg:max-w-sm lg:min-w-[16rem]">
          <FormatListPanel
            formats={formats}
            selectedId={selectedFormatId}
            onSelect={onSelectFormat}
            loading={formatsLoading}
            error={formatsError}
            filter={formatFilter}
            onFilterChange={setFormatFilter}
          />
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-gray-900">Merged sheet</h2>
              {mergeSummary && (
                <p className="truncate text-xs text-gray-500">
                  {mergeSummary.formatName && <span className="font-medium text-gray-700">{mergeSummary.formatName}</span>}
                  {mergeSummary.formatName && ' · '}
                  {mergeSummary.fileCount} save(s) · {mergeSummary.rowCount} rows
                </p>
              )}
              {!mergeSummary && !mergeLoading && (
                <p className="text-xs text-gray-500">Select a format to load the table.</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void downloadExcel()}
              disabled={!selectedFormatId || mergeLoading || rows.length === 0}
              className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Download Excel
            </button>
          </div>

          <div className="min-h-0 flex-1">
            <MergedDataTable
              columns={columns}
              rows={rows}
              rowMeta={rowMeta}
              search={tableSearch}
              onSearchChange={setTableSearch}
              page={page}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              loading={mergeLoading}
              error={mergeError}
              fillScreen
            />
          </div>
        </section>
      </div>
    </div>
  );
}
