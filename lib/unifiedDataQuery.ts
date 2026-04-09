import mongoose from 'mongoose';

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ListUnifiedRowsQuery {
  status: 'active' | 'removed' | 'all';
  picked: 'yes' | 'no' | 'all';
  search: string;
  myPicksOnly?: boolean;
  employeeUserId?: string;
}

export function buildUnifiedRowFilter(q: ListUnifiedRowsQuery, forceActiveOnly?: boolean) {
  const filter: Record<string, unknown> = {};

  if (forceActiveOnly) {
    filter.status = 'active';
  } else if (q.status === 'active' || q.status === 'removed') {
    filter.status = q.status;
  }

  if (q.myPicksOnly && q.employeeUserId) {
    filter.pickedBy = new mongoose.Types.ObjectId(q.employeeUserId);
  } else {
    if (q.picked === 'yes') {
      filter.pickedBy = { $ne: null };
    } else if (q.picked === 'no') {
      filter.pickedBy = null;
    }
  }

  const term = q.search?.trim();
  if (term) {
    filter.name = new RegExp(escapeRegex(term), 'i');
  }

  return filter;
}
