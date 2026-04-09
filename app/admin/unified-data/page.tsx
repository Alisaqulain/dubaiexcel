'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';
import { useUnifiedDataSocket } from '@/app/hooks/useUnifiedDataSocket';
import { formatChangeSummary } from '@/lib/formatUnifiedChange';
import type { UnifiedSocketPayload } from '@/lib/unifiedDataPayloadTypes';
import { useDebounce, SEARCH_DEBOUNCE_MS } from '@/lib/useDebounce';

type UnifiedRow = {
  _id: string;
  name: string;
  fields: Record<string, unknown>;
  pickedBy: string | null;
  pickedByLabel?: string | null;
  status: string;
  fileId: string | null;
  changeHistory: Array<{
    fieldName: string;
    oldValue: unknown;
    newValue: unknown;
    changedByLabel?: string;
    changedByRole?: string;
    timestamp?: string;
  }>;
  lastModifiedByLabel?: string;
  lastModifiedAt?: string | null;
};

type FileRow = {
  _id: string;
  fileName: string;
  originalName: string;
  filePath: string;
  uploadedByLabel: string;
  uploadedAt: string | null;
};

function Toast({
  items,
  onDismiss,
}: {
  items: { id: number; type: 'ok' | 'err' | 'info'; text: string }[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {items.map((t) => (
        <div
          key={t.id}
          className={`rounded-lg shadow-lg px-4 py-3 text-sm border ${
            t.type === 'err'
              ? 'bg-red-50 border-red-200 text-red-900'
              : t.type === 'info'
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-green-50 border-green-200 text-green-900'
          }`}
        >
          <div className="flex justify-between gap-2">
            <span>{t.text}</span>
            <button type="button" className="text-gray-500 hover:text-gray-800" onClick={() => onDismiss(t.id)}>
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminUnifiedDataPage() {
  return (
    <ProtectedRoute requireAdmin>
      <Navigation />
      <AdminUnifiedDataBody />
    </ProtectedRoute>
  );
}

function AdminUnifiedDataBody() {
  const { token } = useAuth();
  const [tab, setTab] = useState<'main' | 'removed' | 'files'>('main');
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [dynamicKeys, setDynamicKeys] = useState<string[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS);
  const [pickedFilter, setPickedFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<{ _id: string; name: string; empId: string }[]>([]);
  const [toasts, setToasts] = useState<{ id: number; type: 'ok' | 'err' | 'info'; text: string }[]>([]);
  const toastId = useRef(0);
  const pushToast = (type: 'ok' | 'err' | 'info', text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, type, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  };

  const [editRow, setEditRow] = useState<UnifiedRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFieldsJson, setNewFieldsJson] = useState('{}');
  const [bulkJson, setBulkJson] = useState('[{"name":"Example","fields":{}}]');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchRows = useCallback(async () => {
    if (!token || tab === 'files') return;
    setLoading(true);
    try {
      const status = tab === 'removed' ? 'removed' : 'active';
      const qs = new URLSearchParams({
        page: String(page),
        limit: '50',
        status,
        picked: pickedFilter,
        search: debouncedSearch.trim(),
      });
      const res = await fetch(`/api/admin/unified-data/rows?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await res.json();
      if (json.success) {
        setRows(json.data.rows || []);
        setDynamicKeys(json.data.dynamicKeys || []);
        setTotalPages(json.data.pagination?.totalPages || 1);
      } else {
        pushToast('err', json.error || 'Load failed');
      }
    } catch (e) {
      pushToast('err', e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [token, tab, page, pickedFilter, debouncedSearch]);

  const fetchFiles = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/unified-data/files', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await res.json();
      if (json.success) setFiles(json.data || []);
      else pushToast('err', json.error || 'Failed to load files');
    } catch (e) {
      pushToast('err', e instanceof Error ? e.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetch('/api/admin/employees?limit=5000', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((j) => {
          if (j.success && Array.isArray(j.data)) setEmployees(j.data);
        })
        .catch(() => {});
    }
  }, [token]);

  useEffect(() => {
    if (tab === 'files') fetchFiles();
    else fetchRows();
  }, [tab, fetchRows, fetchFiles]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (tab === 'files') fetchFiles();
      else fetchRows();
    }, 350);
  }, [tab, fetchRows, fetchFiles]);

  useUnifiedDataSocket(token ?? null, (payload: UnifiedSocketPayload) => {
    if (payload.type === 'row-removed') {
      pushToast('info', 'A row was removed');
      scheduleRefetch();
      return;
    }
    if (payload.type === 'row-restored') {
      pushToast('ok', 'A row was restored');
      scheduleRefetch();
      return;
    }
    if (payload.type === 'rows-imported') {
      pushToast('ok', `Imported ${payload.count} row(s)`);
      scheduleRefetch();
      return;
    }
    if (payload.type === 'row-updated' || payload.type === 'row-picked' || payload.type === 'row-unpicked') {
      scheduleRefetch();
    }
  });

  const submitAdd = async () => {
    if (!token) return;
    let fields: Record<string, unknown> = {};
    try {
      fields = JSON.parse(newFieldsJson || '{}');
      if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) throw new Error();
    } catch {
      pushToast('err', 'Fields must be valid JSON object');
      return;
    }
    try {
      const res = await fetch('/api/admin/unified-data/rows', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newName.trim(), fields }),
      });
      const json = await res.json();
      if (json.success) {
        pushToast('ok', 'Row added');
        setAddOpen(false);
        setNewName('');
        setNewFieldsJson('{}');
        fetchRows();
      } else pushToast('err', json.error || 'Failed');
    } catch (e) {
      pushToast('err', e instanceof Error ? e.message : 'Failed');
    }
  };

  const submitBulk = async () => {
    if (!token) return;
    let rowsPayload: { name: string; fields: Record<string, unknown> }[];
    try {
      const parsed = JSON.parse(bulkJson);
      if (!Array.isArray(parsed)) throw new Error();
      rowsPayload = parsed.map((r: { name?: string; fields?: unknown }) => ({
        name: String(r.name ?? 'Unnamed'),
        fields:
          r.fields && typeof r.fields === 'object' && !Array.isArray(r.fields)
            ? (r.fields as Record<string, unknown>)
            : {},
      }));
    } catch {
      pushToast('err', 'Bulk JSON must be an array of { name, fields }');
      return;
    }
    try {
      const res = await fetch('/api/admin/unified-data/rows/bulk', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rows: rowsPayload }),
      });
      const json = await res.json();
      if (json.success) {
        pushToast('ok', `Created ${json.data.count} rows`);
        setBulkOpen(false);
        fetchRows();
      } else pushToast('err', json.error || 'Failed');
    } catch (e) {
      pushToast('err', e instanceof Error ? e.message : 'Failed');
    }
  };

  const uploadFile = async (fileList: FileList | null) => {
    if (!token || !fileList?.[0]) return;
    const fd = new FormData();
    fd.append('file', fileList[0]);
    try {
      const res = await fetch('/api/admin/unified-data/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json();
      if (json.success) {
        pushToast('ok', `Uploaded: ${json.data.rowCount} rows`);
        fetchRows();
      } else pushToast('err', json.error || 'Upload failed');
    } catch (e) {
      pushToast('err', e instanceof Error ? e.message : 'Upload failed');
    }
  };

  const saveEdit = async () => {
    if (!token || !editRow) return;
    let fields: Record<string, unknown> = {};
    try {
      fields = JSON.parse((editRow as unknown as { _editFields?: string })._editFields || '{}');
    } catch {
      pushToast('err', 'Invalid fields JSON');
      return;
    }
    const pickedVal = (editRow as unknown as { _pickedSelect?: string })._pickedSelect;
    const body: Record<string, unknown> = { name: editRow.name, fields };
    if (pickedVal === '') body.pickedBy = null;
    else if (pickedVal) body.pickedBy = pickedVal;

    try {
      const res = await fetch(`/api/admin/unified-data/rows/${editRow._id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        pushToast('ok', 'Row updated');
        setEditRow(null);
        fetchRows();
      } else pushToast('err', json.error || 'Failed');
    } catch (e) {
      pushToast('err', e instanceof Error ? e.message : 'Failed');
    }
  };

  const softDelete = async (id: string) => {
    if (!token || !confirm('Soft-delete this row?')) return;
    try {
      const res = await fetch(`/api/admin/unified-data/rows/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        pushToast('ok', 'Row moved to Removed');
        fetchRows();
      } else pushToast('err', json.error || 'Failed');
    } catch (e) {
      pushToast('err', e instanceof Error ? e.message : 'Failed');
    }
  };

  const restore = async (id: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/unified-data/rows/${id}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        pushToast('ok', 'Row restored');
        fetchRows();
      } else pushToast('err', json.error || 'Failed');
    } catch (e) {
      pushToast('err', e instanceof Error ? e.message : 'Failed');
    }
  };

  const deleteFileMeta = async (id: string) => {
    if (!token || !confirm('Delete file record (and file on disk if present)?')) return;
    try {
      const res = await fetch(`/api/admin/unified-data/files/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        pushToast('ok', 'File record deleted');
        fetchFiles();
      } else pushToast('err', json.error || 'Failed');
    } catch (e) {
      pushToast('err', e instanceof Error ? e.message : 'Failed');
    }
  };

  const visibleCols = useMemo(() => dynamicKeys.slice(0, 8), [dynamicKeys]);

  const openEdit = (r: UnifiedRow) => {
    setEditRow({
      ...r,
      _editFields: JSON.stringify(r.fields || {}, null, 2),
      _pickedSelect: r.pickedBy || '',
    } as UnifiedRow);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <Toast items={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
      <div className="max-w-[1600px] mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Unified data</h1>
        <p className="text-sm text-gray-600 mb-4">
          Merged table for manual rows, Excel/CSV imports, and employee picks. Files live under{' '}
          <code className="bg-gray-200 px-1 rounded">/uploads/excel/</code> — metadata in MongoDB.
        </p>

        <div className="flex flex-wrap gap-2 mb-4 border-b border-gray-200 pb-3">
          {(['main', 'removed', 'files'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                tab === t ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-700'
              }`}
            >
              {t === 'main' ? 'Main data' : t === 'removed' ? 'Removed data' : 'Uploaded files'}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              if (tab === 'files') fetchFiles();
              else fetchRows();
            }}
            className="ml-auto px-4 py-2 rounded-md text-sm font-medium bg-gray-800 text-white hover:bg-gray-900"
          >
            Refresh
          </button>
        </div>

        {tab !== 'files' && (
          <div className="flex flex-wrap gap-2 mb-4 items-center">
            <input
              type="search"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm w-56"
            />
            <select
              value={pickedFilter}
              onChange={(e) => {
                setPickedFilter(e.target.value as 'all' | 'yes' | 'no');
                setPage(1);
              }}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="all">Picked: all</option>
              <option value="yes">Picked only</option>
              <option value="no">Unpicked only</option>
            </select>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="px-3 py-2 bg-green-600 text-white rounded-md text-sm font-medium"
            >
              + Add row
            </button>
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="px-3 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium"
            >
              Bulk add (JSON)
            </button>
            <label className="px-3 py-2 bg-teal-600 text-white rounded-md text-sm font-medium cursor-pointer">
              Upload Excel/CSV
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => uploadFile(e.target.files)}
              />
            </label>
          </div>
        )}

        {tab === 'files' ? (
          <div className="bg-white rounded-lg shadow border border-gray-200 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-2">Original name</th>
                  <th className="text-left p-2">Stored path</th>
                  <th className="text-left p-2">Uploaded by</th>
                  <th className="text-left p-2">At</th>
                  <th className="p-2"> </th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f._id} className="border-t border-gray-200">
                    <td className="p-2">{f.originalName}</td>
                    <td className="p-2 font-mono text-xs">{f.filePath}</td>
                    <td className="p-2">{f.uploadedByLabel}</td>
                    <td className="p-2 text-gray-600">{f.uploadedAt}</td>
                    <td className="p-2">
                      <button
                        type="button"
                        onClick={() => deleteFileMeta(f._id)}
                        className="text-red-600 hover:underline"
                      >
                        Delete record
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && files.length === 0 && (
              <div className="p-8 text-center text-gray-500">No uploads yet.</div>
            )}
          </div>
        ) : loading ? (
          <div className="p-12 text-center text-gray-500">Loading…</div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow border border-gray-200 overflow-auto max-h-[72vh]">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-800 text-white sticky top-0 z-10">
                  <tr>
                    <th className="text-left p-2 min-w-[120px]">Name</th>
                    {visibleCols.map((k) => (
                      <th key={k} className="text-left p-2 min-w-[100px]">
                        {k}
                      </th>
                    ))}
                    <th className="text-left p-2">Picked by</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Last modified</th>
                    <th className="text-left p-2 w-40">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <Fragment key={r._id}>
                      <tr className="border-t border-gray-200 hover:bg-gray-50 align-top">
                        <td className="p-2 font-medium">{r.name}</td>
                        {visibleCols.map((k) => (
                          <td key={k} className="p-2 text-gray-700 max-w-[200px] truncate" title={String(r.fields?.[k] ?? '')}>
                            {String(r.fields?.[k] ?? '')}
                          </td>
                        ))}
                        <td className="p-2">{r.pickedByLabel || (r.pickedBy ? r.pickedBy : '—')}</td>
                        <td className="p-2">{r.status}</td>
                        <td className="p-2 text-xs text-gray-600">
                          <div>{r.lastModifiedByLabel || '—'}</div>
                          <div>{r.lastModifiedAt || '—'}</div>
                        </td>
                        <td className="p-2 space-x-1 whitespace-nowrap">
                          {tab === 'main' ? (
                            <>
                              <button type="button" className="text-blue-600 hover:underline" onClick={() => openEdit(r)}>
                                Edit
                              </button>
                              <button
                                type="button"
                                className="text-red-600 hover:underline"
                                onClick={() => softDelete(r._id)}
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <button type="button" className="text-green-600 hover:underline" onClick={() => restore(r._id)}>
                              Restore
                            </button>
                          )}
                          <button
                            type="button"
                            className="text-gray-600 hover:underline"
                            onClick={() => setExpanded((e) => ({ ...e, [r._id]: !e[r._id] }))}
                          >
                            {expanded[r._id] ? 'Hide' : 'History'}
                          </button>
                        </td>
                      </tr>
                      {expanded[r._id] && (
                        <tr className="bg-amber-50/50">
                          <td colSpan={visibleCols.length + 5} className="p-3 text-xs text-gray-700">
                            <div className="font-semibold mb-1">Recent history (up to 12 events)</div>
                            <ul className="list-disc pl-5 space-y-1">
                              {(r.changeHistory || []).slice(-12).map((c, i) => (
                                <li key={i}>{formatChangeSummary(c)}</li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <div className="p-8 text-center text-gray-500">No rows.</div>}
            </div>
            <div className="flex justify-between items-center mt-4 text-sm">
              <span>
                Page {page} / {totalPages}
              </span>
              <div className="space-x-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 border rounded disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 border rounded disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {addOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h3 className="text-lg font-semibold mb-3">Add row</h3>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              className="w-full border rounded px-3 py-2 mb-3"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <label className="block text-sm font-medium mb-1">Fields (JSON object)</label>
            <textarea
              className="w-full border rounded px-3 py-2 font-mono text-xs h-32"
              value={newFieldsJson}
              onChange={(e) => setNewFieldsJson(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" className="px-3 py-2 border rounded" onClick={() => setAddOpen(false)}>
                Cancel
              </button>
              <button type="button" className="px-3 py-2 bg-blue-600 text-white rounded" onClick={submitAdd}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
            <h3 className="text-lg font-semibold mb-3">Bulk add (JSON array)</h3>
            <textarea
              className="w-full border rounded px-3 py-2 font-mono text-xs h-64"
              value={bulkJson}
              onChange={(e) => setBulkJson(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" className="px-3 py-2 border rounded" onClick={() => setBulkOpen(false)}>
                Cancel
              </button>
              <button type="button" className="px-3 py-2 bg-blue-600 text-white rounded" onClick={submitBulk}>
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {editRow && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-3">Edit row</h3>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              className="w-full border rounded px-3 py-2 mb-3"
              value={editRow.name}
              onChange={(e) => setEditRow({ ...editRow, name: e.target.value })}
            />
            <label className="block text-sm font-medium mb-1">Assign pick (employee)</label>
            <select
              className="w-full border rounded px-3 py-2 mb-3"
              value={(editRow as unknown as { _pickedSelect?: string })._pickedSelect ?? ''}
              onChange={(e) =>
                setEditRow({ ...editRow, _pickedSelect: e.target.value } as UnifiedRow)
              }
            >
              <option value="">— Unpicked —</option>
              {employees.map((emp) => (
                <option key={emp._id} value={emp._id}>
                  {emp.name} ({emp.empId})
                </option>
              ))}
            </select>
            <label className="block text-sm font-medium mb-1">Fields (JSON)</label>
            <textarea
              className="w-full border rounded px-3 py-2 font-mono text-xs h-40"
              value={(editRow as unknown as { _editFields?: string })._editFields || '{}'}
              onChange={(e) =>
                setEditRow({ ...editRow, _editFields: e.target.value } as UnifiedRow)
              }
            />
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" className="px-3 py-2 border rounded" onClick={() => setEditRow(null)}>
                Cancel
              </button>
              <button type="button" className="px-3 py-2 bg-blue-600 text-white rounded" onClick={saveEdit}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
