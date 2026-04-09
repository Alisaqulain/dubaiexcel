'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDebounce, SEARCH_DEBOUNCE_MS } from '@/lib/useDebounce';
import { useUnifiedDataSocket, type UnifiedRowPayload } from '@/lib/useUnifiedDataSocket';

interface EmpRow {
  _id: string;
  name: string;
  fields: Record<string, unknown>;
  pickedBy: string | null;
  pickedByName?: string;
  pickedByEmpId?: string;
  status: string;
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
}

export default function CollaborativeDataEmployeePanel() {
  const { token, user } = useAuth();
  const [subTab, setSubTab] = useState<'available' | 'mine'>('available');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS);
  const [rows, setRows] = useState<EmpRow[]>([]);
  const [dynamicKeys, setDynamicKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<EmpRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editFieldsJson, setEditFieldsJson] = useState('{}');

  const myId = user?.id != null ? String(user.id) : '';

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 6000);
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const base =
        subTab === 'mine'
          ? '/api/employee/unified-data/my-picks'
          : '/api/employee/unified-data/rows?scope=available';
      const params = new URLSearchParams();
      if (subTab === 'available' && debouncedSearch.trim()) {
        params.set('search', debouncedSearch.trim());
      }
      const url = params.toString() ? `${base}${base.includes('?') ? '&' : '?'}${params}` : base;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await res.json();
      if (json.success) {
        setRows(json.data.rows || []);
        setDynamicKeys(json.data.dynamicKeys || []);
      } else {
        showToast(json.error || 'Failed to load');
      }
    } catch {
      showToast('Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, subTab, debouncedSearch, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  useUnifiedDataSocket(token, {
    onRowUpdated: (row: UnifiedRowPayload) => {
      const id = String(row._id);
      const modifier = row.lastModifiedBy != null ? String(row.lastModifiedBy) : '';
      const isMinePick = row.pickedBy != null && String(row.pickedBy) === myId;
      if (isMinePick && modifier && modifier !== myId) {
        showToast('Admin changed this row — please review.');
      }
      load();
    },
    onRowDeleted: ({ rowId }) => {
      setRows((prev) => prev.filter((r) => r._id !== rowId));
      showToast('This row was deleted by admin.');
      load();
    },
    onRowRestored: () => load(),
    onRowPicked: () => load(),
    onRowUnpicked: () => load(),
    onRowsImported: () => load(),
  });

  const columnKeys = useMemo(() => {
    const s = new Set<string>();
    dynamicKeys.forEach((k) => s.add(k));
    rows.forEach((r) => Object.keys(r.fields || {}).forEach((k) => s.add(k)));
    return Array.from(s).slice(0, 18);
  }, [rows, dynamicKeys]);

  const pick = async (id: string) => {
    if (!token) return;
    const res = await fetch(`/api/employee/unified-data/rows/${id}/pick`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (json.success) {
      showToast('Row picked');
      load();
      setSubTab('mine');
    } else showToast(json.error || 'Could not pick');
  };

  const unpick = async (id: string) => {
    if (!token) return;
    const res = await fetch(`/api/employee/unified-data/rows/${id}/unpick`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (json.success) {
      showToast('Released row');
      load();
    } else showToast(json.error || 'Could not release');
  };

  const saveEdit = async () => {
    if (!token || !editRow) return;
    let fields: Record<string, unknown>;
    try {
      fields = JSON.parse(editFieldsJson) as Record<string, unknown>;
      if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('Invalid fields JSON');
    } catch (e: any) {
      showToast(e.message || 'Invalid JSON');
      return;
    }
    const res = await fetch(`/api/employee/unified-data/rows/${editRow._id}`, {
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
      load();
    } else showToast(json.error || 'Save failed');
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm">{toast}</div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3">
        <button
          type="button"
          onClick={() => setSubTab('available')}
          className={`px-4 py-2 text-sm font-medium rounded-lg ${
            subTab === 'available' ? 'bg-blue-100 text-blue-900' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Available rows
        </button>
        <button
          type="button"
          onClick={() => setSubTab('mine')}
          className={`px-4 py-2 text-sm font-medium rounded-lg ${
            subTab === 'mine' ? 'bg-emerald-100 text-emerald-900' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          My picks
        </button>
        {subTab === 'available' && (
          <>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="ml-auto min-w-[200px] px-3 py-1.5 border border-gray-300 rounded-md text-sm"
            />
            <button
              type="button"
              onClick={() => load()}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Refresh
            </button>
          </>
        )}
        {subTab === 'mine' && (
          <button
            type="button"
            onClick={() => load()}
            className="ml-auto px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Refresh
          </button>
        )}
      </div>

      <p className="text-sm text-gray-600">
        Pick a row to work on it. Admins see your edits in real time. If an admin updates or removes a row you picked, you will be notified here.
      </p>

      {loading ? (
        <div className="py-12 text-center text-gray-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-gray-500 border border-dashed border-gray-200 rounded-lg bg-gray-50">
          {subTab === 'mine' ? 'No picked rows yet.' : 'No rows available to pick.'}
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="text-left px-2 py-2 border border-slate-600">Name</th>
                {columnKeys.map((k) => (
                  <th key={k} className="text-left px-2 py-2 border border-slate-600 max-w-[120px] truncate">
                    {k}
                  </th>
                ))}
                <th className="text-left px-2 py-2 border border-slate-600">Last modified</th>
                <th className="text-left px-2 py-2 border border-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="hover:bg-gray-50 border-b border-gray-100">
                  <td className="px-2 py-2 font-medium text-gray-900">{r.name}</td>
                  {columnKeys.map((k) => (
                    <td key={k} className="px-2 py-2 max-w-[120px] truncate text-gray-700" title={String(r.fields?.[k] ?? '')}>
                      {String(r.fields?.[k] ?? '')}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-xs text-gray-600 whitespace-nowrap">
                    <div>{r.lastModifiedByLabel || '—'}</div>
                    <div className="text-gray-400">
                      {r.lastModifiedAt ? new Date(r.lastModifiedAt).toLocaleString() : ''}
                    </div>
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap space-x-2">
                    {subTab === 'available' ? (
                      <button type="button" className="text-blue-600 hover:underline text-sm font-medium" onClick={() => pick(r._id)}>
                        Pick
                      </button>
                    ) : (
                      <>
                        <button type="button" className="text-blue-600 hover:underline text-sm" onClick={() => {
                          setEditRow(r);
                          setEditName(r.name);
                          setEditFieldsJson(JSON.stringify(r.fields || {}, null, 2));
                        }}>
                          Edit
                        </button>
                        <button type="button" className="text-gray-600 hover:underline text-sm" onClick={() => unpick(r._id)}>
                          Release
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editRow && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-3 max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-lg">Edit your row</h3>
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
