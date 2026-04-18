'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import { io, type Socket } from 'socket.io-client';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';
import { FormatStyleDailyMerge } from './components/FormatStyleDailyMerge';

type CreatedByPop = { _id?: string; name?: string; email?: string } | string | null;
type FormatPop = { _id?: string; name?: string } | string | null;

interface FileRow {
  _id: string;
  originalFilename: string;
  labourType: string;
  rowCount?: number;
  formatId?: FormatPop;
  dailyWorkDate?: string;
  pickedTemplateRowIndices?: number[];
  isMerged?: boolean;
  mergeCount?: number;
  createdAt?: string;
  updatedAt?: string;
  lastEditedAt?: string;
  createdByName?: string;
  createdByEmail?: string;
  createdBy?: CreatedByPop;
}

interface FormatOption {
  _id: string;
  name: string;
  active?: boolean;
}

const PAGE_SIZE = 30;
const PREVIEW_ROW_CAP = 800;

function formatOwner(f: FileRow): string {
  if (f.createdBy && typeof f.createdBy === 'object') {
    const n = String(f.createdBy.name || '').trim();
    const e = String(f.createdBy.email || '').trim();
    if (n && e) return `${n} (${e})`;
    return n || e || '—';
  }
  const n = String(f.createdByName || '').trim();
  const e = String(f.createdByEmail || '').trim();
  if (n && e) return `${n} (${e})`;
  return n || e || '—';
}

function formatName(f: FileRow): string {
  const fmt = f.formatId;
  if (fmt && typeof fmt === 'object' && fmt.name) return String(fmt.name);
  return '—';
}

export default function UserSavedFilesAdminPage() {
  return (
    <ProtectedRoute requireAdmin>
      <div className="flex min-h-screen flex-col">
        <Navigation />
        <main className="flex min-h-0 flex-1 flex-col bg-slate-50">
          <UserSavedFilesDashboard />
        </main>
      </div>
    </ProtectedRoute>
  );
}

function UserSavedFilesDashboard() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [labourType, setLabourType] = useState('');
  const [mergedFilter, setMergedFilter] = useState<'false' | 'true' | 'all'>('false');

  const [formats, setFormats] = useState<FormatOption[]>([]);
  const [formatsLoading, setFormatsLoading] = useState(false);
  const [mergeFormatId, setMergeFormatId] = useState<string | null>(null);
  const [mergeDate, setMergeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mergeDates, setMergeDates] = useState<string[]>([]);
  const [mergeDatesLoading, setMergeDatesLoading] = useState(false);
  const [mergeDatesError, setMergeDatesError] = useState<string | null>(null);
  const [mergeRefreshKey, setMergeRefreshKey] = useState(0);

  const mergeFormatIdRef = useRef<string | null>(null);
  mergeFormatIdRef.current = mergeFormatId;

  const loadMergeDatesRef = useRef<() => void>(() => {});
  const loadFilesRef = useRef<() => void>(() => {});

  const [preview, setPreview] = useState<{
    id: string;
    filename: string;
    columns: string[];
    rows: Record<string, unknown>[];
    totalRows: number;
    truncated: boolean;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(q.trim()), 350);
    return () => window.clearTimeout(t);
  }, [q]);

  const loadFormats = useCallback(async () => {
    if (!token) return;
    setFormatsLoading(true);
    try {
      const res = await fetch('/api/admin/excel-formats', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) return;
      const list = (json.data || []) as FormatOption[];
      setFormats(list);
      setMergeFormatId((prev) => {
        if (prev && list.some((f) => f._id === prev)) return prev;
        const first = list.find((f) => f.active !== false);
        return first?._id ?? list[0]?._id ?? null;
      });
    } catch {
      setFormats([]);
    } finally {
      setFormatsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadFormats();
  }, [loadFormats]);

  const loadMergeDates = useCallback(async () => {
    if (!token || !mergeFormatId) {
      setMergeDates([]);
      return;
    }
    setMergeDatesLoading(true);
    setMergeDatesError(null);
    try {
      const res = await fetch(`/api/admin/format-merge-dates?formatId=${encodeURIComponent(mergeFormatId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to load merge dates');
      }
      const dates = (json.data?.dates || []) as string[];
      setMergeDates(dates);
    } catch (e: unknown) {
      setMergeDatesError(e instanceof Error ? e.message : 'Failed to load dates');
      setMergeDates([]);
    } finally {
      setMergeDatesLoading(false);
    }
  }, [token, mergeFormatId]);

  loadMergeDatesRef.current = () => {
    void loadMergeDates();
  };

  useEffect(() => {
    void loadMergeDates();
  }, [loadMergeDates]);

  useEffect(() => {
    if (mergeDates.length === 0) return;
    setMergeDate((prev) => (mergeDates.includes(prev) ? prev : mergeDates[0]));
  }, [mergeDates]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('skip', String(page * PAGE_SIZE));
      if (qDebounced) params.set('q', qDebounced);
      if (labourType) params.set('labourType', labourType);
      if (mergedFilter !== 'all') params.set('isMerged', mergedFilter);

      const res = await fetch(`/api/admin/created-excel-files?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to load files');
      }
      setFiles((json.data || []) as FileRow[]);
      setTotal(Number(json.total) || 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setFiles([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [token, page, qDebounced, labourType, mergedFilter]);

  loadFilesRef.current = () => {
    void load();
  };

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [qDebounced, labourType, mergedFilter]);

  useEffect(() => {
    if (!token) return;
    const url =
      typeof window !== 'undefined'
        ? process.env.NEXT_PUBLIC_APP_ORIGIN || window.location.origin
        : '';
    let socket: Socket | null = null;
    let cancelled = false;
    const scheduleId = window.setTimeout(() => {
      if (cancelled) return;
      socket = io(url, {
        path: '/socket.io',
        auth: { token },
        transports: ['websocket', 'polling'],
      });
      socket.on('format_daily_merge_invalidate', (payload: unknown) => {
        const formatId = (payload as { formatId?: string })?.formatId;
        if (!formatId || typeof formatId !== 'string') return;
        if (formatId !== mergeFormatIdRef.current) return;
        setMergeRefreshKey((k) => k + 1);
        loadMergeDatesRef.current();
        loadFilesRef.current();
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(scheduleId);
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
    };
  }, [token]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openPreview = async (id: string, filename: string) => {
    if (!token) return;
    setPreviewLoading(true);
    setPreview(null);
    try {
      const res = await fetch(`/api/admin/created-excel-files/${id}/view`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to load file');
      }
      const raw = (json.data?.data || []) as Record<string, unknown>[];
      const totalRows = raw.length;
      const truncated = totalRows > PREVIEW_ROW_CAP;
      const slice = truncated ? raw.slice(0, PREVIEW_ROW_CAP) : raw;
      const colSet = new Set<string>();
      slice.forEach((r) => Object.keys(r).forEach((k) => colSet.add(k)));
      const columns = Array.from(colSet);
      setPreview({
        id,
        filename,
        columns,
        rows: slice,
        totalRows,
        truncated,
      });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setPreviewLoading(false);
    }
  };

  const downloadFile = async (id: string, filename: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/created-excel-files/${id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        alert(j.error || 'Download failed');
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition');
      let fname = filename || `file_${id}.xlsx`;
      if (cd) {
        const m = cd.match(/filename="([^"]+)"/) || cd.match(/filename\*?=(?:UTF-8'')?([^"';]+)/i);
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

  const filterSummary = useMemo(() => {
    if (mergedFilter === 'false') return 'Employee / user saves (not merged outputs)';
    if (mergedFilter === 'true') return 'Merged outputs only';
    return 'All saved files';
  }, [mergedFilter]);

  const selectedFormatName = useMemo(() => {
    const f = formats.find((x) => x._id === mergeFormatId);
    return f?.name || '';
  }, [formats, mergeFormatId]);

  const refreshAll = () => {
    void loadFormats();
    void loadMergeDates();
    void load();
    setMergeRefreshKey((k) => k + 1);
  };

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-3 py-4">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 pb-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">User saved files</h1>
          <p className="mt-0.5 max-w-3xl text-xs text-gray-600">
            <strong>Full sheet</strong> matches{' '}
            <Link href="/admin/format-view" className="font-medium text-blue-700 hover:underline">
              Format &amp; picks
            </Link>{' '}
            (all template rows, including rows nobody picked). Change the date to see that day&apos;s merged user
            saves. Also:{' '}
            <Link href="/admin/all-merge-data" className="font-medium text-blue-700 hover:underline">
              All merge data
            </Link>
            . Raw files are listed below.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refreshAll()}
          disabled={loading || mergeDatesLoading || formatsLoading}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-50"
        >
          {loading || mergeDatesLoading ? 'Refreshing…' : 'Refresh all'}
        </button>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div>
          <label className="block text-xs font-medium text-gray-700">Format for merged sheet</label>
          <select
            value={mergeFormatId || ''}
            onChange={(e) => setMergeFormatId(e.target.value || null)}
            disabled={formatsLoading || formats.length === 0}
            className="mt-1 min-w-[260px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            {formats.length === 0 ? (
              <option value="">No formats</option>
            ) : (
              formats.map((f) => (
                <option key={f._id} value={f._id}>
                  {f.name || 'Untitled'}
                  {f.active === false ? ' (inactive)' : ''}
                </option>
              ))
            )}
          </select>
        </div>
        {mergeDatesLoading && <p className="text-xs text-gray-600">Loading days with saves…</p>}
        {mergeDatesError && <p className="text-xs text-red-700">{mergeDatesError}</p>}
        {!mergeDatesLoading && mergeFormatId && mergeDates.length === 0 && (
          <p className="text-xs text-gray-600">No day-stamped saves for this format yet — pick a date anyway to see the master sheet.</p>
        )}
      </div>

      <FormatStyleDailyMerge
        token={token}
        formatId={mergeFormatId}
        formatName={selectedFormatName}
        mergeDate={mergeDate}
        onMergeDateChange={setMergeDate}
        refreshKey={mergeRefreshKey}
        quickDates={mergeDates}
        formatsLoading={formatsLoading}
      />

      <h2 className="text-sm font-semibold text-gray-900">Individual files</h2>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="min-w-[200px] flex-1">
          <label className="block text-xs font-medium text-gray-600">Search filename</label>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. MANPOWER_2026-04-17"
            className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Labour type</label>
          <select
            value={labourType}
            onChange={(e) => setLabourType(e.target.value)}
            className="mt-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">All</option>
            <option value="OUR_LABOUR">OUR_LABOUR</option>
            <option value="SUPPLY_LABOUR">SUPPLY_LABOUR</option>
            <option value="SUBCONTRACTOR">SUBCONTRACTOR</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">File kind</label>
          <select
            value={mergedFilter}
            onChange={(e) => setMergedFilter(e.target.value as 'false' | 'true' | 'all')}
            className="mt-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="false">User saves (exclude merged)</option>
            <option value="true">Merged files only</option>
            <option value="all">Everything</option>
          </select>
        </div>
        <p className="text-xs text-gray-500">
          {filterSummary} · <strong>{total}</strong> matching
          {selectedFormatName ? (
            <>
              {' '}
              · sheet above: <strong>{selectedFormatName}</strong>
            </>
          ) : null}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      <div className="overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
              <th className="px-3 py-2">Filename</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Format</th>
              <th className="px-3 py-2">Rows</th>
              <th className="px-3 py-2">Work day</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Updated</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && files.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : files.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-gray-500">
                  No files match your filters.
                </td>
              </tr>
            ) : (
              files.map((f) => {
                const updated = f.lastEditedAt || f.updatedAt || f.createdAt;
                const pickN = Array.isArray(f.pickedTemplateRowIndices) ? f.pickedTemplateRowIndices.length : 0;
                return (
                  <tr key={f._id} className="border-b border-gray-100 hover:bg-slate-50/80">
                    <td className="max-w-[240px] px-3 py-2 align-top">
                      <div className="break-words font-medium text-gray-900">{f.originalFilename}</div>
                      <div className="text-[11px] text-gray-400">{f.labourType}</div>
                    </td>
                    <td className="max-w-[200px] px-3 py-2 align-top break-words text-gray-800">
                      {formatOwner(f)}
                    </td>
                    <td className="max-w-[180px] px-3 py-2 align-top break-words text-gray-700">
                      {formatName(f)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-top text-gray-700">
                      {f.rowCount ?? '—'}
                      {pickN > 0 ? (
                        <span className="ml-1 text-[11px] text-violet-600" title="Template pick indices stored">
                          ({pickN} picks)
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-top text-gray-700">
                      {f.dailyWorkDate || '—'}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {f.isMerged ? (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                          Merged
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
                          Save
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-top text-xs text-gray-600">
                      {updated ? new Date(updated).toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => void openPreview(f._id, f.originalFilename)}
                          disabled={previewLoading}
                          className="rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
                        >
                          View data
                        </button>
                        <button
                          type="button"
                          onClick={() => void downloadFile(f._id, f.originalFilename)}
                          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50"
                        >
                          Download
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
        <div>
          Page <strong>{page + 1}</strong> / <strong>{totalPages}</strong>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={page <= 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded border border-gray-300 bg-white px-2 py-1 hover:bg-gray-100 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page >= totalPages - 1 || loading}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border border-gray-300 bg-white px-2 py-1 hover:bg-gray-100 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="File preview"
        >
          <div className="flex max-h-[90vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-gray-200 px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-gray-900">Preview</h2>
                <p className="truncate text-xs text-gray-600" title={preview.filename}>
                  {preview.filename}
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  {preview.truncated
                    ? `Showing first ${preview.rows.length} of ${preview.totalRows} rows (cap ${PREVIEW_ROW_CAP}). Download for full file.`
                    : `${preview.totalRows} row(s).`}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => void downloadFile(preview.id, preview.filename)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
                >
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="rounded-md bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-300"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="min-w-max border-collapse text-xs">
                <thead className="sticky top-0 bg-emerald-900 text-white">
                  <tr>
                    {preview.columns.map((c) => (
                      <th key={c} className="border border-emerald-950 px-2 py-1.5 text-left font-semibold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      {preview.columns.map((c) => (
                        <td key={c} className="max-w-[220px] border border-gray-200 px-2 py-1 align-top break-words">
                          {r[c] === null || r[c] === undefined ? '' : String(r[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
