import type { ActorInfo } from '@/lib/unifiedDataActor';

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === 'object' || typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return String(a) === String(b);
}

export function buildChangeEntries(
  actor: ActorInfo,
  oldName: string,
  newName: string,
  oldFields: Record<string, unknown>,
  newFields: Record<string, unknown>
) {
  const entries: Array<{
    changedBy: typeof actor.id;
    changedByLabel: string;
    changedByRole: string;
    field: string;
    oldValue: unknown;
    newValue: unknown;
    timestamp: Date;
  }> = [];
  const now = new Date();
  if (!valuesEqual(oldName, newName)) {
    entries.push({
      changedBy: actor.id,
      changedByLabel: actor.label,
      changedByRole: actor.role,
      field: 'name',
      oldValue: oldName,
      newValue: newName,
      timestamp: now,
    });
  }
  const keys = Array.from(new Set([...Object.keys(oldFields), ...Object.keys(newFields)]));
  for (const key of keys) {
    const ov = oldFields[key];
    const nv = newFields[key];
    if (valuesEqual(ov, nv)) continue;
    entries.push({
      changedBy: actor.id,
      changedByLabel: actor.label,
      changedByRole: actor.role,
      field: `fields.${key}`,
      oldValue: ov,
      newValue: nv,
      timestamp: now,
    });
  }
  return entries;
}
