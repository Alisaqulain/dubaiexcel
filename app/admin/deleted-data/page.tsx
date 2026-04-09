'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';

type DeletedBlock = {
  formatId: string;
  formatName: string;
  deletedRows: { rowIndex: number; preview: string }[];
};

export default function DeletedDataPage() {
  return (
    <ProtectedRoute requireAdmin>
      <Navigation />
      <DeletedDataContent />
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

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setMessage(null);
    try {
      const q = formatIdFromUrl ? `?formatId=${encodeURIComponent(formatIdFromUrl)}` : '';
      const res = await fetch(`/api/admin/template-deleted-rows${q}`, {
        headers: { Authorization: `Bearer ${token}` },
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
    fetchData();
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
    () =>
      Object.values(selected).reduce((acc, s) => acc + s.size, 0),
    [selected]
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Link
          href={formatIdFromUrl ? `/admin/format-view?formatId=${encodeURIComponent(formatIdFromUrl)}` : '/admin/format-view'}
          className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
        >
          ← Back to format view
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">Deleted template rows</h1>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Rows removed in format view appear here. Restoring makes them visible to employees again as <strong>fresh</strong>{' '}
        template rows (no pick or assignment is restored).
      </p>

      {message && (
        <div
          className={`mb-4 p-3 rounded ${
            message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : blocks.length === 0 ? (
        <p className="text-gray-600">No deleted rows for {formatIdFromUrl ? 'this format' : 'any format'}.</p>
      ) : (
        <div className="space-y-8">
          {blocks.map((block) => {
            const fmtSel = selected[block.formatId] || new Set<number>();
            const idxs = block.deletedRows.map((r) => r.rowIndex);
            return (
              <section key={block.formatId} className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-semibold text-gray-900">{block.formatName}</h2>
                    <p className="text-xs text-gray-500">Format ID: {block.formatId}</p>
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
                      className="text-sm px-3 py-1.5 rounded-md bg-green-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-700"
                      onClick={() => restore(block.formatId, Array.from(fmtSel))}
                    >
                      Restore selected ({fmtSel.size})
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100 text-left">
                        <th className="px-3 py-2 w-12"> </th>
                        <th className="px-3 py-2">Template row #</th>
                        <th className="px-3 py-2">Preview</th>
                      </tr>
                    </thead>
                    <tbody>
                      {block.deletedRows.map((dr) => (
                        <tr key={dr.rowIndex} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={fmtSel.has(dr.rowIndex)}
                              onChange={() => toggle(block.formatId, dr.rowIndex)}
                              className="h-4 w-4"
                              aria-label={`Select row ${dr.rowIndex + 1}`}
                            />
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{dr.rowIndex + 1}</td>
                          <td className="px-3 py-2 text-gray-800 max-w-xl truncate" title={dr.preview}>
                            {dr.preview}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
          {totalSelected > 0 && (
            <p className="text-sm text-gray-500">
              {totalSelected} row(s) selected across formats — use &quot;Restore selected&quot; on each format block.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
