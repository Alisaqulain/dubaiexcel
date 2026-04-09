'use client';

export interface FileListItem {
  id: string;
  fileName: string;
  uploadTime: string | null;
  formatId: string | null;
  formatName: string | null;
  rowCount: number;
  createdByLabel: string;
}

interface FileListPanelProps {
  files: FileListItem[];
  selectedId: string | null;
  onSelect: (file: FileListItem) => void;
  loading: boolean;
  error: string | null;
  filter: string;
  onFilterChange: (v: string) => void;
}

function formatUploadTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function FileListPanel({
  files,
  selectedId,
  onSelect,
  loading,
  error,
  filter,
  onFilterChange,
}: FileListPanelProps) {
  const q = filter.trim().toLowerCase();
  const filtered = q
    ? files.filter(
        (f) =>
          f.fileName.toLowerCase().includes(q) ||
          (f.formatName || '').toLowerCase().includes(q) ||
          f.createdByLabel.toLowerCase().includes(q)
      )
    : files;

  return (
    <div className="flex h-full min-h-[320px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">Excel files for this date</h2>
        <p className="mt-0.5 text-xs text-gray-500">Click a file to load merged data (template + all saves that day).</p>
        <input
          type="search"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="Filter by name, format, user…"
          className="mt-2 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="m-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
        )}
        {loading && (
          <div className="flex items-center justify-center py-16 text-sm text-gray-500">Loading files…</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center text-sm text-gray-500">
            <p className="font-medium text-gray-700">No data found</p>
            <p className="mt-1 max-w-xs">No saved Excel files for this date. Try another day or confirm employees saved their picks.</p>
          </div>
        )}
        {!loading &&
          filtered.map((f) => {
            const active = selectedId === f.id;
            const noFormat = !f.formatId;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onSelect(f)}
                disabled={noFormat}
                className={`w-full border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-blue-50/80 ${
                  active ? 'bg-blue-50 ring-inset ring-1 ring-blue-200' : 'bg-white'
                } ${noFormat ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <div className="font-medium text-gray-900 break-words">{f.fileName}</div>
                <div className="mt-1 text-xs text-gray-600">
                  <span className="font-medium text-gray-700">Upload time:</span> {formatUploadTime(f.uploadTime)}
                </div>
                {f.formatName && (
                  <div className="mt-0.5 text-xs text-gray-500">
                    Format: <span className="text-gray-700">{f.formatName}</span>
                  </div>
                )}
                {f.createdByLabel && (
                  <div className="mt-0.5 text-xs text-gray-500">By {f.createdByLabel}</div>
                )}
                {noFormat && (
                  <div className="mt-1 text-xs font-medium text-amber-700">Cannot merge — not linked to a format</div>
                )}
              </button>
            );
          })}
      </div>
      {!loading && filtered.length > 0 && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-500">
          Showing {filtered.length} of {files.length} file(s)
        </div>
      )}
    </div>
  );
}
