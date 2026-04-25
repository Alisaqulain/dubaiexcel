'use client';

import { useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';

type CreatedByPop = { _id?: string; name?: string; email?: string } | string | null;
type FormatPop = { _id?: string; name?: string } | string | null;

interface FileRow {
  _id: string;
  originalFilename: string;
  labourType: string;
  rowCount?: number;
  formatId?: FormatPop;
  dailyWorkDate?: string;
  createdAt?: string;
  updatedAt?: string;
  lastEditedAt?: string;
  createdByName?: string;
  createdByEmail?: string;
  createdBy?: CreatedByPop;
}

const PAGE_SIZE = 50;

function ownerLabel(file: FileRow): string {
  if (file.createdBy && typeof file.createdBy === 'object') {
    const n = String(file.createdBy.name || '').trim();
    const e = String(file.createdBy.email || '').trim();
    if (n && e) return `${n} (${e})`;
    return n || e || '-';
  }
  const n = String(file.createdByName || '').trim();
  const e = String(file.createdByEmail || '').trim();
  if (n && e) return `${n} (${e})`;
  return n || e || '-';
}

function formatLabel(file: FileRow): string {
  const f = file.formatId;
  if (f && typeof f === 'object' && f.name) return String(f.name);
  return '-';
}

export default function UserSavedFilesAdminPage() {
  return (
    <ProtectedRoute requireAdmin>
      <div className="flex min-h-screen flex-col">
        <Navigation />
        <main className="flex min-h-0 flex-1 flex-col bg-slate-50">
          <UserSavedFilesSimple />
        </main>
      </div>
    </ProtectedRoute>
  );
}

function UserSavedFilesSimple() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<{
    id: string;
    filename: string;
    columns: string[];
    rows: Record<string, unknown>[];
  } | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('isMerged', 'false');
        params.set('clean', '1');
        params.set('limit', String(PAGE_SIZE));
        params.set('skip', String(page * PAGE_SIZE));
        if (search.trim()) params.set('q', search.trim());
        const res = await fetch(`/api/admin/created-excel-files?${params.toString()}`, {
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
        setError(e instanceof Error ? e.message : 'Failed to load files');
        setFiles([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [token, page, search]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const openFile = async (id: string, filename: string) => {
    if (!token) return;
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/admin/created-excel-files/${id}/view`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to open file');
      const rows = (json.data?.data || []) as Record<string, unknown>[];
      const colSet = new Set<string>();
      rows.forEach((r) => Object.keys(r || {}).forEach((k) => colSet.add(k)));
      setPreview({
        id,
        filename,
        columns: Array.from(colSet),
        rows,
      });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to open file');
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-4">
      <header className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-bold text-gray-900">User Saved Files</h1>
        <p className="mt-1 text-sm text-gray-600">
          This page shows only final day-save files. Click Open to view saved data.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setPage(0);
              setSearch(e.target.value);
            }}
            placeholder="Search file name..."
            className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <span className="text-xs text-gray-600">
            Total: <strong>{total}</strong>
          </span>
        </div>
      </header>

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <div className="overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-600">
              <th className="px-3 py-2">File name</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Format</th>
              <th className="px-3 py-2">Rows</th>
              <th className="px-3 py-2">Work day</th>
              <th className="px-3 py-2">Updated</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && files.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : files.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-gray-500">
                  No saved files found.
                </td>
              </tr>
            ) : (
              files.map((f) => {
                const updated = f.lastEditedAt || f.updatedAt || f.createdAt;
                return (
                  <tr key={f._id} className="border-b border-gray-100 hover:bg-slate-50">
                    <td className="max-w-[300px] break-words px-3 py-2 font-medium text-gray-900">{f.originalFilename}</td>
                    <td className="max-w-[220px] break-words px-3 py-2 text-gray-700">{ownerLabel(f)}</td>
                    <td className="max-w-[220px] break-words px-3 py-2 text-gray-700">{formatLabel(f)}</td>
                    <td className="px-3 py-2 text-gray-700">{f.rowCount ?? '-'}</td>
                    <td className="px-3 py-2 text-gray-700">{f.dailyWorkDate || '-'}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {updated ? new Date(updated).toLocaleString() : '-'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={previewLoading}
                        onClick={() => void openFile(f._id, f.originalFilename)}
                        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-600">
        <div>
          Page <strong>{page + 1}</strong> / <strong>{totalPages}</strong>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={loading || page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded border border-gray-300 bg-white px-2 py-1 hover:bg-gray-50 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={loading || page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border border-gray-300 bg-white px-2 py-1 hover:bg-gray-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-[90vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Saved file data</h2>
                <p className="text-xs text-gray-600">{preview.filename}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-300"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="min-w-max border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-900 text-white">
                  <tr>
                    {preview.columns.map((c) => (
                      <th key={c} className="border border-slate-800 px-2 py-1.5 text-left font-semibold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      {preview.columns.map((c) => (
                        <td key={c} className="max-w-[240px] break-words border border-gray-200 px-2 py-1 align-top">
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
