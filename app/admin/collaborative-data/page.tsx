'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';
import { useDebounce, SEARCH_DEBOUNCE_MS } from '@/lib/useDebounce';
import { useUnifiedDataSocket, type UnifiedRowPayload } from '@/lib/useUnifiedDataSocket';

type TabKey = 'main' | 'removed';

interface AdminRow {
  _id: string;
  name: string;
  fields: Record<string, unknown>;
  pickedBy: string | null;
  pickedByName?: string;
  pickedByEmpId?: string;
  status: string;
  fileId: string | null;
  changeHistory: Array<{
    changedBy: string;
    field: string;
    oldValue: unknown;
    newValue: unknown;
    timestamp: string | null;
    changedByLabel?: string;
    changedByRole?: string;
  }>;
  lastModifiedBy: string | null;
  lastModifiedByLabel: string;
  lastModifiedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

function formatHistoryLine(e: AdminRow['changeHistory'][0]): string {
  const who = e.changedByLabel || e.changedByRole || 'Someone';
  const ov = e.oldValue === undefined || e.oldValue === null ? '—' : String(e.oldValue);
  const nv = e.newValue === undefined || e.newValue === null ? '—' : String(e.newValue);
  if (e.field === 'name') return `${who} changed Name from ${ov} → ${nv}`;
  if (e.field.startsWith('fields.')) {
    const col = e.field.replace(/^fields\./, '');
    return `${who} updated ${col}: ${ov} → ${nv}`;
  }
  return `${who} changed ${e.field}: ${ov} → ${nv}`;
}

export default function CollaborativeDataAdminPage() {
  return (
    <ProtectedRoute requireAdmin>
      <Navigation />
      <CollaborativeDataAdminBody />
    </ProtectedRoute>
  );
}

function CollaborativeDataAdminBody() {
  const { token, user } = useAuth();
  const [tab, setTab] = useState<TabKey>('main');
  const [pickedFilter, setPickedFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [dynamicKeys, setDynamicKeys] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<AdminRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addFieldsJson, setAddFieldsJson] = useState('{}');
  const [bulkJson, setBulkJson] = useState('[{"name":"Example","fields":{"Phone":"123"}}]');
  const [editName, setEditName] = useState('');
  const [editFieldsJson, setEditFieldsJson] = useState('{}');
  const [uploading, setUploading] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 5000);
  }, []);

  const flashHighlight = useCallback((id: string) => {
    setHighlightId(id);
    setTimeout(() => setHighlightId(null), 4000);
  }, []);

  const fetchRows = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const status = tab === 'main' ? 'active' : 'removed';
      const params = new URLSearchParams({
        status,
        picked: pickedFilter,
        search: debouncedSearch.trim(),
        page: String(page),
        limit: String(limit),
      });
      const res = await fetch(`/api/admin/unified-data/rows?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await res.json();
      if (json.success) {
        setRows(json.data.rows || []);
        setTotal(json.data.total ?? 0);
        setDynamicKeys(json.data.dynamicKeys || []);
      } else {
        showToast(json.error || 'Failed to load');
      }
    } catch {
      showToast('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [token, tab, pickedFilter, debouncedSearch, page, limit, showToast]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useUnifiedDataSocket(token, {
    onRowUpdated: (row: UnifiedRowPayload) => {
      const id = String(row._id);
      flashHighlight(id);
      const label = (row.lastModifiedByLabel as string) || '';
      const mine = user?.id && String(row.lastModifiedBy) === String(user.id);
      if (!mine && label) {
        showToast(`Row updated by ${label}`);
      } else {
        showToast('Row updated (live)');
      }
      fetchRows();
    },
    onRowDeleted: () => {
      showToast('Row removed (live)');
      fetchRows();
    },
    onRowRestored: () => {
      showToast('Row restored (live)');
      fetchRows();
    },
    onRowPicked: () => {
      showToast('Row picked (live)');
      fetchRows();
    },
    onRowUnpicked: () => {
      showToast('Row released (live)');
      fetchRows();
    },
    onRowsImported: (p) => {
      showToast(`Imported ${p.count} rows`);
      fetchRows();
    },
  });

  const columnKeys = useMemo(() => {
    const fromRows = new Set<string>();
    rows.forEach((r) => {
      Object.keys(r.fields || {}).forEach((k) => fromRows.add(k));
    });
    dynamicKeys.forEach((k) => fromRows.add(k));
    return Array.from(fromRows).slice(0, 20);
  }, [rows, dynamicKeys]);

  const handleSoftDelete = async (id: string) => {
    if (!token || !confirm('Soft-delete this row?')) return;
    const res = await fetch(`/api/admin/unified-data/rows/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (json.success) {
      showToast('Row moved to Removed Data');
      fetchRows();
    } else showToast(json.error || 'Delete failed');
  };

  const handleRestore = async (id: string) => {
    if (!token) return;
    const res = await fetch(`/api/admin/unified-data/rows/${id}/restore`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (json.success) {
      showToast('Row restored');
      fetchRows();
    } else showToast(json.error || 'Restore failed');
  };

  const openEdit = (r: AdminRow) => {
    setEditRow(r);
    setEditName(r.name);
    setEditFieldsJson(JSON.stringify(r.fields || {}, null, 2));
  };

  const saveEdit = async () => {
    if (!token || !editRow) return;
    let fields: Record<string, unknown>;
    try {
      fields = JSON.parse(editFieldsJson) as Record<string, unknown>;
      if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('fields must be an object');
    } catch (e: any) {
      showToast(e.message || 'Invalid JSON for fields');
      return;
    }
    const res = await fetch(`/api/admin/unified-data/rows/${editRow._id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: editName.trim(), fields }),
    });
    const json = await res.json();
    if (json.success) {
      showToast('Saved');
      setEditRow(null);
      fetchRows();
    } else showToast(json.error || 'Save failed');
  };

  const submitAdd = async () => {
    if (!token) return;
    let fields: Record<string, unknown>;
    try {
      fields = JSON.parse(addFieldsJson) as Record<string, unknown>;
      if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('fields must be an object');
    } catch (e: any) {
      showToast(e.message || 'Invalid JSON');
      return;
    }
    const res = await fetch('/api/admin/unified-data/rows', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: addName.trim(), fields }),
    });
    const json = await res.json();
    if (json.success) {
      showToast('Row added');
      setAddOpen(false);
      setAddName('');
      setAddFieldsJson('{}');
      fetchRows();
    } else showToast(json.error || 'Add failed');
  };

  const submitBulk = async () => {
    if (!token) return;
    let rowsIn: { name: string; fields?: Record<string, unknown> }[];
    try {
      rowsIn = JSON.parse(bulkJson);
      if (!Array.isArray(rowsIn)) throw new Error('Expected JSON array');
    } catch (e: any) {
      showToast(e.message || 'Invalid JSON');
      return;
    }
    const res = await fetch('/api/admin/unified-data/rows/bulk', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rows: rowsIn }),
    });
    const json = await res.json();
    if (json.success) {
      showToast(`Added ${json.data.count} rows`);
      setBulkOpen(false);
      fetchRows();
    } else showToast(json.error || 'Bulk add failed');
  };

  const onUploadFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !token) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/unified-data/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Uploaded ${json.data.rowCount} rows from file`);
        fetchRows();
      } else showToast(json.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-[1600px] mx-auto space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Collaborative data</h1>
            <p className="text-sm text-slate-600 mt-1">
              Unified table: manual rows, uploads, and picks — with live updates (run <code className="text-xs bg-slate-200 px-1 rounded">npm run dev</code> for Socket.io).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fetchRows()}
              className="px-3 py-2 text-sm font-medium bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="px-3 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
            >
              + Row
            </button>
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Bulk add
            </button>
            <label className="px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer">
              {uploading ? 'Uploading…' : 'Upload file'}
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={uploading} onChange={onUploadFile} />
            </label>
          </div>
        </div>

        {toast && (
          <div className="fixed top-20 right-4 z-50 max-w-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm shadow-lg">
            {toast}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
            <button
              type="button"
              onClick={() => {
                setTab('main');
                setPage(1);
              }}
              className={`px-4 py-2 text-sm font-medium rounded-lg ${
                tab === 'main' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:bg-white/60'
              }`}
            >
              Main data
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('removed');
                setPage(1);
              }}
              className={`px-4 py-2 text-sm font-medium rounded-lg ${
                tab === 'removed' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:bg-white/60'
              }`}
            >
              Removed data
            </button>
            {tab === 'main' && (
              <select
                value={pickedFilter}
                onChange={(e) => {
                  setPickedFilter(e.target.value as 'all' | 'yes' | 'no');
                  setPage(1);
                }}
                className="ml-2 text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
              >
                <option value="all">Picked: all</option>
                <option value="yes">Picked only</option>
                <option value="no">Unpicked only</option>
              </select>
            )}
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name…"
              className="ml-auto min-w-[200px] flex-1 max-w-xs text-sm border border-slate-300 rounded-lg px-3 py-1.5"
            />
            <span className="text-xs text-slate-500 whitespace-nowrap">
              {total} rows · page {page}/{totalPages}
            </span>
          </div>

          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            {loading ? (
              <div className="p-12 text-center text-slate-500">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="p-12 text-center text-slate-500">No rows.</div>
            ) : (
              <table className="min-w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-800 text-white">
                  <tr>
                    <th className="text-left px-2 py-2 border border-slate-600 whitespace-nowrap">Name</th>
                    {columnKeys.map((k) => (
                      <th key={k} className="text-left px-2 py-2 border border-slate-600 whitespace-nowrap max-w-[140px] truncate" title={k}>
                        {k}
                      </th>
                    ))}
                    <th className="text-left px-2 py-2 border border-slate-600">Picked by</th>
                    <th className="text-left px-2 py-2 border border-slate-600">Status</th>
                    <th className="text-left px-2 py-2 border border-slate-600">Last modified</th>
                    <th className="text-left px-2 py-2 border border-slate-600">History</th>
                    <th className="text-left px-2 py-2 border border-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r._id}
                      className={`${
                        highlightId === r._id ? 'bg-amber-100 ring-2 ring-amber-400 ring-inset' : r.pickedBy ? 'bg-amber-50/50' : 'bg-white'
                      } hover:bg-slate-50`}
                    >
                      <td className="px-2 py-1.5 border border-slate-200 font-medium text-slate-900">{r.name}</td>
                      {columnKeys.map((k) => (
                        <td key={k} className="px-2 py-1.5 border border-slate-200 max-w-[140px] truncate" title={String(r.fields?.[k] ?? '')}>
                          {String(r.fields?.[k] ?? '')}
                        </td>
                      ))}
                      <td className="px-2 py-1.5 border border-slate-200 text-slate-700">
                        {r.pickedBy ? (
                          <span>
                            {r.pickedByName || '—'} <span className="text-slate-500">({r.pickedByEmpId || r.pickedBy})</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 border border-slate-200">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            r.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 border border-slate-200 text-xs text-slate-600 whitespace-nowrap">
                        <div>{r.lastModifiedByLabel || '—'}</div>
                        <div className="text-slate-400">
                          {r.lastModifiedAt ? new Date(r.lastModifiedAt).toLocaleString() : '—'}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 border border-slate-200 align-top">
                        <button
                          type="button"
                          className="text-xs text-blue-600 hover:underline"
                          onClick={() => setExpandedHistory((prev) => ({ ...prev, [r._id]: !prev[r._id] }))}
                        >
                          {expandedHistory[r._id] ? 'Hide' : 'Show'} ({r.changeHistory?.length || 0})
                        </button>
                        {expandedHistory[r._id] && (
                          <ul className="mt-1 text-[11px] text-slate-600 max-w-xs space-y-1 list-disc pl-4">
                            {[...(r.changeHistory || [])]
                              .slice(-8)
                              .reverse()
                              .map((h, i) => (
                                <li key={i}>{formatHistoryLine(h)}</li>
                              ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-2 py-1.5 border border-slate-200 whitespace-nowrap space-x-1">
                        {tab === 'main' ? (
                          <>
                            <button type="button" className="text-blue-600 hover:underline text-xs" onClick={() => openEdit(r)}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="text-red-600 hover:underline text-xs"
                              onClick={() => handleSoftDelete(r._id)}
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <button type="button" className="text-emerald-600 hover:underline text-xs" onClick={() => handleRestore(r._id)}>
                            Restore
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-slate-200 bg-slate-50">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 text-sm border rounded disabled:opacity-40"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 text-sm border rounded disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {addOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-3">
            <h3 className="font-semibold text-lg">Add row</h3>
            <label className="block text-sm">
              Name
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Fields (JSON object)
              <textarea
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono h-40"
                value={addFieldsJson}
                onChange={(e) => setAddFieldsJson(e.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="px-3 py-2 text-sm border rounded-lg" onClick={() => setAddOpen(false)}>
                Cancel
              </button>
              <button type="button" className="px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg" onClick={submitAdd}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-5 space-y-3">
            <h3 className="font-semibold text-lg">Bulk add</h3>
            <p className="text-xs text-slate-600">JSON array: <code>[{`{"name":"A","fields":{"Col":"x"}}`}]</code></p>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono h-64"
              value={bulkJson}
              onChange={(e) => setBulkJson(e.target.value)}
            />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="px-3 py-2 text-sm border rounded-lg" onClick={() => setBulkOpen(false)}>
                Cancel
              </button>
              <button type="button" className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg" onClick={submitBulk}>
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {editRow && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-3 max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-lg">Edit row</h3>
            <label className="block text-sm">
              Name
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Fields (JSON)
              <textarea
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono h-48"
                value={editFieldsJson}
                onChange={(e) => setEditFieldsJson(e.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="px-3 py-2 text-sm border rounded-lg" onClick={() => setEditRow(null)}>
                Cancel
              </button>
              <button type="button" className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg" onClick={saveEdit}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
