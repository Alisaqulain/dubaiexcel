export interface SerializedUnifiedRow {
  _id: string;
  name: string;
  fields: Record<string, unknown>;
  pickedBy: string | null;
  pickedByName?: string;
  pickedByEmpId?: string;
  pickedByLabel?: string | null;
  status: string;
  fileId: string | null;
  changeHistory: Array<{
    changedBy: string;
    field: string;
    fieldName: string;
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

export function serializeUnifiedRow(doc: Record<string, unknown>): SerializedUnifiedRow {
  const o = doc as Record<string, unknown>;
  const pickedRaw = o.pickedBy;
  let pickedBy: string | null = null;
  let pickedByName = '';
  let pickedByEmpId = '';
  if (pickedRaw && typeof pickedRaw === 'object' && (pickedRaw as { _id?: unknown })._id) {
    const p = pickedRaw as { _id: unknown; name?: string; empId?: string };
    pickedBy = String(p._id);
    pickedByName = p.name || '';
    pickedByEmpId = p.empId || '';
  } else if (pickedRaw != null) {
    pickedBy = String(pickedRaw);
  }

  const ch = Array.isArray(o.changeHistory) ? o.changeHistory : [];
  const changeHistory = ch.map((e: Record<string, unknown>) => {
    const field = String(e.field ?? e.fieldName ?? '');
    return {
      changedBy: e.changedBy != null ? String(e.changedBy) : '',
      field,
      fieldName: field,
      oldValue: e.oldValue,
      newValue: e.newValue,
      timestamp: e.timestamp ? new Date(e.timestamp as Date).toISOString() : null,
      changedByLabel: (e.changedByLabel as string) || '',
      changedByRole: (e.changedByRole as string) || '',
    };
  });

  const pickedByLabel =
    pickedBy && (pickedByName || pickedByEmpId)
      ? `${pickedByName || '—'} (${pickedByEmpId || ''})`.replace(/\s*\(\s*\)\s*$/, '').trim()
      : pickedBy;

  return {
    _id: String(o._id),
    name: String(o.name ?? ''),
    fields: o.fields && typeof o.fields === 'object' && !Array.isArray(o.fields) ? (o.fields as Record<string, unknown>) : {},
    pickedBy,
    pickedByName,
    pickedByEmpId,
    pickedByLabel,
    status: String(o.status ?? 'active'),
    fileId: o.fileId != null ? String(o.fileId) : null,
    changeHistory,
    lastModifiedBy: o.lastModifiedBy != null ? String(o.lastModifiedBy) : null,
    lastModifiedByLabel: (o.lastModifiedByLabel as string) || '',
    lastModifiedAt: o.lastModifiedAt ? new Date(o.lastModifiedAt as Date).toISOString() : null,
    createdAt: o.createdAt ? new Date(o.createdAt as Date).toISOString() : null,
    updatedAt: o.updatedAt ? new Date(o.updatedAt as Date).toISOString() : null,
  };
}

export function collectDynamicKeys(rows: { fields?: Record<string, unknown> }[], max = 24): string[] {
  const keys = new Set<string>();
  for (const r of rows) {
    if (r.fields && typeof r.fields === 'object') {
      for (const k of Object.keys(r.fields)) {
        keys.add(k);
        if (keys.size >= max) return Array.from(keys);
      }
    }
  }
  return Array.from(keys).slice(0, max);
}
