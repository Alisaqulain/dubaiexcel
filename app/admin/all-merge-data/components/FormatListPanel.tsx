'use client';

export interface FormatListItem {
  id: string;
  name: string;
  description?: string;
  columnCount: number;
  active: boolean;
}

interface FormatListPanelProps {
  formats: FormatListItem[];
  selectedId: string | null;
  onSelect: (f: FormatListItem) => void;
  loading: boolean;
  error: string | null;
  filter: string;
  onFilterChange: (v: string) => void;
}

export function FormatListPanel({
  formats,
  selectedId,
  onSelect,
  loading,
  error,
  filter,
  onFilterChange,
}: FormatListPanelProps) {
  const q = filter.trim().toLowerCase();
  const filtered = q
    ? formats.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          (f.description || '').toLowerCase().includes(q)
      )
    : formats;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:max-h-full">
      <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">Excel formats</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Same list as <strong>Excel Format Management</strong>. Click a format to see the full sheet for the selected date
          (template + user edits that day).
        </p>
        <input
          type="search"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="Search by name or description…"
          className="mt-2 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="m-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
        )}
        {loading && (
          <div className="flex items-center justify-center py-16 text-sm text-gray-500">Loading formats…</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center text-sm text-gray-500">
            <p className="font-medium text-gray-700">No formats found</p>
            <p className="mt-1 max-w-xs">
              Create a format under <strong>Excel formats</strong> in the nav, then return here.
            </p>
          </div>
        )}
        {!loading &&
          filtered.map((f) => {
            const active = selectedId === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onSelect(f)}
                className={`w-full border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-blue-50/80 ${
                  active ? 'bg-blue-50 ring-inset ring-1 ring-blue-200' : 'bg-white'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 font-medium text-gray-900 break-words">{f.name}</div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      f.active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {f.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {f.description ? (
                  <p className="mt-1 line-clamp-2 text-xs text-gray-600">{f.description}</p>
                ) : null}
                <p className="mt-1 text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{f.columnCount}</span> columns
                </p>
              </button>
            );
          })}
      </div>
      {!loading && filtered.length > 0 && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-500">
          Showing {filtered.length} of {formats.length} format(s)
        </div>
      )}
    </div>
  );
}
