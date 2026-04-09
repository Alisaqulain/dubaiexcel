import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withEmployee, AuthenticatedRequest } from '@/lib/middleware';
import UnifiedDataRow from '@/models/UnifiedDataRow';
import { resolveActor } from '@/lib/unifiedDataActor';
import { serializeUnifiedRow } from '@/lib/unifiedDataRowSerialize';
import { emitRowUnpicked } from '@/lib/unifiedDataSocket';
import mongoose from 'mongoose';

async function handlePost(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();
    const userId = req.user?.userId;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const params = await Promise.resolve(context.params);
    if (!mongoose.Types.ObjectId.isValid(params.id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    const userOid = new mongoose.Types.ObjectId(userId);

    const row = await UnifiedDataRow.findById(params.id);
    if (!row) {
      return NextResponse.json({ error: 'Row not found' }, { status: 404 });
    }
    if (row.status !== 'active') {
      return NextResponse.json({ error: 'Row is not active' }, { status: 400 });
    }
    if (!row.pickedBy || String(row.pickedBy) !== String(userOid)) {
      return NextResponse.json({ error: 'You did not pick this row' }, { status: 403 });
    }

    const prevPicker = String(row.pickedBy);
    row.pickedBy = null;
    const actor = await resolveActor(req);
    row.lastModifiedBy = actor.id;
    row.lastModifiedByLabel = actor.label;
    row.lastModifiedAt = new Date();
    row.changeHistory.push({
      changedBy: actor.id,
      changedByLabel: actor.label,
      changedByRole: actor.role,
      field: 'pickedBy',
      oldValue: prevPicker,
      newValue: null,
      timestamp: new Date(),
    } as any);
    await row.save();

    const populated = await UnifiedDataRow.findById(params.id).populate('pickedBy', 'name empId').lean();
    const serialized = serializeUnifiedRow(populated as Record<string, unknown>);
    emitRowUnpicked(serialized);
    return NextResponse.json({ success: true, data: { row: serialized } });
  } catch (e: any) {
    console.error('employee unified-data unpick', e);
    return NextResponse.json({ error: e.message || 'Failed to release row' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  return withEmployee((r) => handlePost(r, context))(req);
}
