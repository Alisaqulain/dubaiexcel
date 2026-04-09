import mongoose from 'mongoose';
import Employee from '@/models/Employee';

export async function enrichPickedByLabels<T extends { pickedBy: string | null }>(
  rows: T[]
): Promise<(T & { pickedByLabel: string | null })[]> {
  const ids = Array.from(new Set(rows.map((r) => r.pickedBy).filter(Boolean))) as string[];
  if (!ids.length) {
    return rows.map((r) => ({ ...r, pickedByLabel: null }));
  }
  const oids = ids
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  const emps = await Employee.find({ _id: { $in: oids } }).select('name empId').lean();
  const map = new Map(
    emps.map((e) => {
      const doc = e as { _id: unknown; name?: string; empId?: string };
      return [String(doc._id), `${doc.name || '—'} (${doc.empId || ''})`.trim()] as const;
    })
  );
  return rows.map((r) => ({
    ...r,
    pickedByLabel: r.pickedBy ? map.get(r.pickedBy) ?? null : null,
  }));
}
