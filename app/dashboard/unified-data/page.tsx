'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';
import { useUnifiedDataSocket } from '@/app/hooks/useUnifiedDataSocket';
import type { UnifiedSocketPayload } from '@/lib/unifiedDataPayloadTypes';
import { useDebounce, SEARCH_DEBOUNCE_MS } from '@/lib/useDebounce';

type UnifiedRow = {
  _id: string;
  name: string;
  fields: Record<string, unknown>;
  pickedBy: string | null;
  pickedByLabel?: string | null;
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

function lastChangeFromNonEmployee(row: UnifiedRow) {
  const h = row.changeHistory || [];
  const last = h[h.length - 1];
  if (!last) return false;
  return last.changedByRole !== 'employee';
}

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

export default function EmployeeUnifiedDataPage() {
  return (
    <ProtectedRoute>
      <Navigation />
      <EmployeeUnifiedBody />
    </ProtectedRoute>
  );
}

function EmployeeUnifiedBody() {
  const { token, user } = useAuth();
  const myId = user?.id ? String(user.id) : '';
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [dynamicKeys, setDynamicKeys] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS);
  const [pickedFilter, setPickedFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<{ id: number; type: 'ok' | 'err' | 'info'; text: string }[]>([]);
  const toastId = useRef(0);
  const pushToast = (type: 'ok' | 'err' | 'info', text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, type, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 7000);
  };

  const [editRow, setEditRow] = useState<UnifiedRow | null>(null);
  const [editFieldsJson, setEditFieldsJson] = useState('{}');

  const fetchRows = useCallback(async () => {
    if (!token || user?.role !== 'employee') return;
    setLoading(true);
    try {
      const base =
        tab === 'mine'
          ? `/api/employee/unified-data/my-picks?page=${page}&limit=50`
          : `/api/employee/unified-data/rows?page=${page}&limit=50&picked=${pickedFilter}&search=${encodeURIComponent(debouncedSearch.trim())}`;
      const res = await fetch(base, {
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
  }, [token, user?.role, tab, page, pickedFilter, debouncedSearch]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchRows(), 350);
  }, [fetchRows]);

  useUnifiedDataSocket(token ?? null, (payload: UnifiedSocketPayload) => {
    if (payload.type === 'row-removed') {
      pushToast('info', 'A row was removed by admin. It may disappear from your lists.');
      scheduleRefetch();
      return;
    }
    if (payload.type === 'row-updated' && payload.row) {
      const row = payload.row as unknown as UnifiedRow;
      if (row.pickedBy === myId && lastChangeFromNonEmployee(row)) {
        pushToast('info', 'Admin updated a row you picked — please review.');
      }
      scheduleRefetch();
      return;
    }
    if (payload.type === 'rows-imported') {
      pushToast('ok', `New data: ${payload.count} row(s) imported`);
      scheduleRefetch();
      return;
    }
    scheduleRefetch();
  });

  const pick = async (id: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/employee/unified-data/rows/${id}/pick`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        pushToast('ok', 'Row picked');
        fetchRows();
      } else pushToast('err', json.error || 'Failed');
    } catch (e) {
      pushToast('err', e instanceof Error ? e.message : 'Failed');
    }
  };

  const unpick = async (id: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/employee/unified-data/rows/${id}/unpick`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        pushToast('ok', 'Released row');
        fetchRows();
      } else pushToast('err', json.error || 'Failed');
    } catch (e) {
      pushToast('err', e instanceof Error ? e.message : 'Failed');
    }
  };

  const saveEdit = async () => {
    if (!token || !editRow) return;
    let fields: Record<string, unknown>;
    try {
      fields = JSON.parse(editFieldsJson);
      if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) throw new Error();
    } catch {
      pushToast('err', 'Invalid JSON for fields');
      return;
    }
    try {
      const res = await fetch(`/api/employee/unified-data/rows/${editRow._id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: editRow.name, fields }),
      });
      const json = await res.json();
      if (json.success) {
        pushToast('ok', 'Saved');
        setEditRow(null);
        fetchRows();
      } else pushToast('err', json.error || 'Failed');
    } catch (e) {
      pushToast('err', e instanceof Error ? e.message : 'Failed');
    }
  };

  const visibleCols = useMemo(() => dynamicKeys.slice(0, 8), [dynamicKeys]);

  const openEdit = (r: UnifiedRow) => {
    setEditRow(r);
    setEditFieldsJson(JSON.stringify(r.fields || {}, null, 2));
  };

  if (user && user.role !== 'employee') {
    return (
      <div className="p-8 text-center text-gray-600">
        This workspace is for employees. Admins can open <strong>Unified data</strong> from the admin menu.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <Toast items={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
      <div className="max-w-[1400px] mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Shared data</h1>
        <p className="text-sm text-gray-600 mb-4">
          Pick rows to work on them. Changes from admins sync live; removed rows leave your picks list.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={() => {
              setTab('all');
              setPage(1);
            }}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              tab === 'all' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300'
            }`}
          >
            All rows
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('mine');
              setPage(1);
            }}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              tab === 'mine' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300'
            }`}
          >
            My picks
          </button>
          <button
            type="button"
            onClick={() => fetchRows()}
            className="ml-auto px-4 py-2 rounded-md text-sm bg-gray-800 text-white"
          >
            Refresh
          </button>
        </div>

        {tab === 'all' && (
          <div className="flex flex-wrap gap-2 mb-4">
            <input
              type="search"
              placeholder="Search name…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border rounded-md text-sm w-52"
            />
            <select
              value={pickedFilter}
              onChange={(e) => {
                setPickedFilter(e.target.value as 'all' | 'yes' | 'no');
                setPage(1);
              }}
              className="px-3 py-2 border rounded-md text-sm"
            >
              <option value="all">All</option>
              <option value="yes">Picked</option>
              <option value="no">Unpicked</option>
            </select>
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading…</div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow border border-gray-200 overflow-auto max-h-[70vh]">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-800 text-white sticky top-0">
                  <tr>
                    <th className="text-left p-2">Name</th>
                    {visibleCols.map((k) => (
                      <th key={k} className="text-left p-2">
                        {k}
                      </th>
                    ))}
                    <th className="text-left p-2">Picked by</th>
                    <th className="text-left p-2">Updated</th>
                    <th className="text-left p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <Fragment key={r._id}>
                      <tr className="border-t border-gray-200 align-top hover:bg-gray-50">
                        <td className="p-2 font-medium">
                          {r.name}
                          {r.pickedBy === myId && lastChangeFromNonEmployee(r) && (
                            <div className="text-amber-700 text-xs font-normal mt-1">
                              Admin updated this row — please review.
                            </div>
                          )}
                        </td>
                        {visibleCols.map((k) => (
                          <td key={k} className="p-2 max-w-[180px] truncate" title={String(r.fields?.[k] ?? '')}>
                            {String(r.fields?.[k] ?? '')}
                          </td>
                        ))}
                        <td className="p-2">{r.pickedByLabel || '—'}</td>
                        <td className="p-2 text-xs text-gray-600">
                          <div>{r.lastModifiedByLabel}</div>
                          <div>{r.lastModifiedAt}</div>
                        </td>
                        <td className="p-2 whitespace-nowrap space-x-2">
                          {!r.pickedBy && tab === 'all' && (
                            <button type="button" className="text-green-600 hover:underline" onClick={() => pick(r._id)}>
                              Pick
                            </button>
                          )}
                          {r.pickedBy === myId && (
                            <>
                              <button type="button" className="text-blue-600 hover:underline" onClick={() => openEdit(r)}>
                                Edit
                              </button>
                              <button type="button" className="text-gray-600 hover:underline" onClick={() => unpick(r._id)}>
                                Release
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <div className="p-8 text-center text-gray-500">No rows.</div>}
            </div>
            <div className="flex justify-between mt-4 text-sm">
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

      {editRow && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h3 className="text-lg font-semibold mb-3">Edit your pick</h3>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              className="w-full border rounded px-3 py-2 mb-3"
              value={editRow.name}
              onChange={(e) => setEditRow({ ...editRow, name: e.target.value })}
            />
            <label className="block text-sm font-medium mb-1">Fields (JSON)</label>
            <textarea
              className="w-full border rounded px-3 py-2 font-mono text-xs h-40"
              value={editFieldsJson}
              onChange={(e) => setEditFieldsJson(e.target.value)}
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
