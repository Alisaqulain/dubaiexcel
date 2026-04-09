export function formatChangeSummary(entry: {
  field?: string;
  fieldName?: string;
  oldValue: unknown;
  newValue: unknown;
  changedByLabel?: string;
}): string {
  const who = entry.changedByLabel || 'Someone';
  const fname = (entry.field ?? entry.fieldName ?? '').trim();
  const displayField =
    fname.startsWith('fields.') ? fname.replace(/^fields\./, '') : fname;
  const ov =
    entry.oldValue === undefined || entry.oldValue === null
      ? '—'
      : typeof entry.oldValue === 'object'
        ? JSON.stringify(entry.oldValue)
        : String(entry.oldValue);
  const nv =
    entry.newValue === undefined || entry.newValue === null
      ? '—'
      : typeof entry.newValue === 'object'
        ? JSON.stringify(entry.newValue)
        : String(entry.newValue);
  if (fname === 'pickedBy') {
    return `Pick assignment changed (${ov} → ${nv}) by ${who}`;
  }
  if (fname === 'status' || fname === '__status__') {
    return `Status changed (${ov} → ${nv}) by ${who}`;
  }
  if (fname.startsWith('__')) {
    return `Record updated by ${who}`;
  }
  return `${displayField || 'value'} changed from ${ov} → ${nv} by ${who}`;
}
