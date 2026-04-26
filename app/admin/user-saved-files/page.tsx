'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';

type FormatOption = { _id: string; name: string };

type SaveRow = {
  _id: string;
  originalFilename: string;
  labourType: string;
  rowCount?: number;
  dailyWorkDate?: string;
  lastEditedAt?: string;
  updatedAt?: string;
  owner: string;
};

function localDayRangeIso(ymd: string): { rangeStart: string; rangeEnd: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const start = new Date(y, mo - 1, d, 0, 0, 0, 0);
  const end = new Date(y, mo - 1, d, 23, 59, 59, 999);
  return { rangeStart: start.toISOString(), rangeEnd: end.toISOString() };
}

function labourLabel(code: string): string {
  switch (code) {
    case 'OUR_LABOUR':
      return 'Our labour';
    case 'SUPPLY_LABOUR':
      return 'Supply labour';
    case 'SUBCONTRACTOR':
      return 'Subcontractor';
    default:
      return code || '—';
  }
}

function stripInternalColumns(
  rows: Record<string, unknown>[],
  preferredOrder: string[]
): { rows: Record<string, unknown>[]; columns: string[] } {
  const keySet = new Set<string>();
  rows.forEach((r) => {
    Object.keys(r || {}).forEach((k) => {
      if (!k.startsWith('_')) keySet.add(k);
    });
  });
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const c of preferredOrder) {
    if (keySet.has(c)) {
      columns.push(c);
      seen.add(c);
    }
  }
  for (const c of Array.from(keySet).sort()) {
    if (!seen.has(c)) columns.push(c);
  }
  const outRows = rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const c of columns) {
      o[c] = r[c];
    }
    return o;
  });
  return { rows: outRows, columns };
}

export default function UserSavedFilesAdminPage() {
  return (
    <ProtectedRoute requireAdmin>
      <div className="flex min-h-screen flex-col">
        <Navigation />
        <main className="flex min-h-0 flex-1 flex-col bg-slate-50">
          <UserSavedFilesWizard />
        </main>
      </div>
    </ProtectedRoute>
  );
}

function UserSavedFilesWizard() {
  const { token } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formats, setFormats] = useState<FormatOption[]>([]);
  const [formatsLoading, setFormatsLoading] = useState(false);
  const [formatId, setFormatId] = useState<string>('');
  const [saves, setSaves] = useState<SaveRow[]>([]);
  const [savesLoading, setSavesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [previewLoading, setPreviewLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [preview, setPreview] = useState<{
    title: string;
    subtitle?: string;
    columns: string[];
    rows: Record<string, unknown>[];
  } | null>(null);

  useEffect(() => {
    if (step !== 2 || !token) return;
    setFormatsLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch('/api/admin/excel-formats', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load formats');
        const list = (json.data || []) as { _id: string; name: string }[];
        setFormats(list.map((f) => ({ _id: String(f._id), name: String(f.name || 'Untitled') })));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load formats');
        setFormats([]);
      } finally {
        setFormatsLoading(false);
      }
    })();
  }, [step, token]);

  const loadSaves = useCallback(async () => {
    if (!token || !formatId || !date) return;
    const range = localDayRangeIso(date);
    if (!range) {
      setError('Invalid date');
      return;
    }
    setSavesLoading(true);
    setError(null);
    setSelected(new Set());
    try {
      const params = new URLSearchParams({
        formatId,
        date,
        rangeStart: range.rangeStart,
        rangeEnd: range.rangeEnd,
      });
      const res = await fetch(`/api/admin/saves-by-day?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load saves');
      setSaves((json.data || []) as SaveRow[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load saves');
      setSaves([]);
    } finally {
      setSavesLoading(false);
    }
  }, [token, formatId, date]);

  useEffect(() => {
    if (step === 3 && formatId && date) void loadSaves();
  }, [step, formatId, date, loadSaves]);

  const allSelected = saves.length > 0 && saves.every((s) => selected.has(s._id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(saves.map((s) => s._id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const openSingleView = async (id: string, filename: string) => {
    if (!token) return;
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/admin/created-excel-files/${id}/view`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to open');
      const rawRows = (json.data?.data || []) as Record<string, unknown>[];
      const preferredOrder = (json.data?.columnOrder as string[] | undefined) || [];
      const { rows, columns } = stripInternalColumns(rawRows, preferredOrder);
      setPreview({
        title: filename,
        subtitle: 'Single employee save (expanded to full sheet when applicable)',
        columns,
        rows,
      });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to open');
    } finally {
      setPreviewLoading(false);
    }
  };

  const downloadSingle = async (id: string, filename: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/created-excel-files/${id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Download failed');
    }
  };

  const runMerge = async (mode: 'rowsOnly' | 'fullTemplate', asDownload: boolean) => {
    if (!token || selectedIds.length === 0) {
      alert('Select at least one file.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/merge-selected-saves', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          formatId,
          date,
          fileIds: selectedIds,
          mode,
          download: asDownload,
        }),
      });
      if (asDownload) {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || 'Download failed');
        }
        const blob = await res.blob();
        const dispo = res.headers.get('Content-Disposition');
        let fname =
          mode === 'fullTemplate' ? `merged_full_${date}.xlsx` : `merged_rows_${date}.xlsx`;
        const m = dispo?.match(/filename="([^"]+)"/i) || dispo?.match(/filename=([^;]+)/i);
        if (m) fname = m[1].trim().replace(/^["']|["']$/g, '');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      }
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Merge failed');
      const rawRows = (json.data?.rows || []) as Record<string, unknown>[];
      const cols = (json.data?.columns as string[]) || [];
      const { rows, columns } = stripInternalColumns(rawRows, cols);
      const fmtName = formats.find((f) => f._id === formatId)?.name || 'Format';
      setPreview({
        title:
          mode === 'fullTemplate'
            ? `Merged full sheet — ${fmtName}`
            : `Merged rows only — ${fmtName}`,
        subtitle:
          mode === 'fullTemplate'
            ? `All template rows for this format; selected employees’ saves overlaid. ${rows.length} rows.`
            : `Only data rows from selected files (stacked). ${rows.length} rows.`,
        columns,
        rows,
      });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Merge failed');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 p-4">
      <header className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-bold text-gray-900">User saved files</h1>
        <p className="mt-2 text-sm text-gray-600">
          <strong>Step 1:</strong> choose the work date. <strong>Step 2:</strong> choose the format (admin
          sheet). <strong>Step 3:</strong> see every employee save that day, open or download each file, select
          rows, then merge. <em>Merge rows only</em> stacks just the saved rows from the files you ticked.{' '}
          <em>Merge full Excel</em> starts from the complete admin template (every row) and applies those
          saves on top—unchosen template rows stay as HR uploaded.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span
            className={`rounded px-2 py-0.5 ${step === 1 ? 'bg-blue-100 font-semibold text-blue-900' : 'bg-gray-100'}`}
          >
            1 · Date
          </span>
          <span>→</span>
          <span
            className={`rounded px-2 py-0.5 ${step === 2 ? 'bg-blue-100 font-semibold text-blue-900' : 'bg-gray-100'}`}
          >
            2 · Format
          </span>
          <span>→</span>
          <span
            className={`rounded px-2 py-0.5 ${step === 3 ? 'bg-blue-100 font-semibold text-blue-900' : 'bg-gray-100'}`}
          >
            3 · Files &amp; merge
          </span>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}

      {step === 1 && (
        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Select date</h2>
          <p className="mt-1 text-xs text-gray-600">Show saves whose work day is this calendar date.</p>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-3 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Select format</h2>
          <p className="mt-1 text-xs text-gray-600">Date: {date}</p>
          {formatsLoading ? (
            <p className="mt-4 text-sm text-gray-500">Loading formats…</p>
          ) : (
            <select
              value={formatId}
              onChange={(e) => setFormatId(e.target.value)}
              className="mt-3 w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">— Choose format —</option>
              {formats.map((f) => (
                <option key={f._id} value={f._id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!formatId}
              onClick={() => setStep(3)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-700">
              <strong>{formats.find((f) => f._id === formatId)?.name || 'Format'}</strong>
              <span className="text-gray-500"> · </span>
              <span>{date}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-800 hover:bg-gray-50"
              >
                Change format
              </button>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-800 hover:bg-gray-50"
              >
                Change date
              </button>
              <button
                type="button"
                onClick={() => void loadSaves()}
                disabled={savesLoading}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                Refresh list
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950">
            <strong>Merge rows only:</strong> combines only the rows stored in each selected file (e.g. picked
            rows). <strong>Merge full Excel:</strong> full template row count; selected saves update matching
            rows, the rest stay as the original upload.
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={actionLoading || selectedIds.length === 0}
              onClick={() => void runMerge('rowsOnly', false)}
              className="rounded-md bg-slate-700 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Preview merge — rows only
            </button>
            <button
              type="button"
              disabled={actionLoading || selectedIds.length === 0}
              onClick={() => void runMerge('rowsOnly', true)}
              className="rounded-md bg-slate-600 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              Download merge — rows only
            </button>
            <button
              type="button"
              disabled={actionLoading || selectedIds.length === 0}
              onClick={() => void runMerge('fullTemplate', false)}
              className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              Preview merge — full sheet
            </button>
            <button
              type="button"
              disabled={actionLoading || selectedIds.length === 0}
              onClick={() => void runMerge('fullTemplate', true)}
              className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Download merge — full sheet
            </button>
          </div>

          <div className="overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-600">
                  <th className="w-10 px-2 py-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      disabled={saves.length === 0}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-3 py-2">File</th>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Labour</th>
                  <th className="px-3 py-2">Rows</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {savesLoading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-gray-500">
                      Loading…
                    </td>
                  </tr>
                ) : saves.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-gray-500">
                      No saves for this format on this date.
                    </td>
                  </tr>
                ) : (
                  saves.map((s) => (
                    <tr key={s._id} className="border-b border-gray-100 hover:bg-slate-50">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(s._id)}
                          onChange={() => toggleOne(s._id)}
                          aria-label={`Select ${s.originalFilename}`}
                        />
                      </td>
                      <td className="max-w-[240px] break-all px-3 py-2 font-mono text-xs text-gray-900">
                        {s.originalFilename}
                      </td>
                      <td className="max-w-[200px] break-words px-3 py-2 text-gray-700">{s.owner}</td>
                      <td className="px-3 py-2 text-gray-700">{labourLabel(s.labourType)}</td>
                      <td className="px-3 py-2 text-gray-700">{s.rowCount ?? '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          disabled={previewLoading}
                          onClick={() => void openSingleView(s._id, s.originalFilename)}
                          className="mr-1 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => void downloadSingle(s._id, s.originalFilename)}
                          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800 hover:bg-gray-50"
                        >
                          Download
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[90vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">{preview.title}</h2>
                {preview.subtitle && <p className="text-xs text-gray-600">{preview.subtitle}</p>}
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
                        <td
                          key={c}
                          className="max-w-[240px] break-words border border-gray-200 px-2 py-1 align-top"
                        >
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
