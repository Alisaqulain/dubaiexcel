'use client';

interface AdminDatePickerProps {
  value: string;
  onChange: (isoDate: string) => void;
  disabled?: boolean;
  id?: string;
}

/** Calendar day picker; value is YYYY-MM-DD (local). */
export function AdminDatePicker({ value, onChange, disabled, id = 'all-merge-date' }: AdminDatePickerProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        Select date
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="block w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
      />
    </div>
  );
}
