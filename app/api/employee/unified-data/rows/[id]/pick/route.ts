import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withEmployee, AuthenticatedRequest } from '@/lib/middleware';
import UnifiedDataRow from '@/models/UnifiedDataRow';
import { resolveActor } from '@/lib/unifiedDataActor';
import { serializeUnifiedRow } from '@/lib/unifiedDataRowSerialize';
import { emitRowPicked } from '@/lib/unifiedDataSocket';
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

    const row = await UnifiedDataRow.findOne({
      _id: params.id,
      status: 'active',
      pickedBy: null,
    });
    if (!row) {
      const exists = await UnifiedDataRow.findById(params.id).lean();
      if (!exists) {
        return NextResponse.json({ error: 'Row not found' }, { status: 404 });
      }
      if ((exists as { status?: string }).status === 'removed') {
        return NextResponse.json({ error: 'This row was removed' }, { status: 400 });
      }
      return NextResponse.json({ error: 'Row is already picked' }, { status: 409 });
    }

    const actor = await resolveActor(req);
    row.pickedBy = userOid;
    row.lastModifiedBy = actor.id;
    row.lastModifiedByLabel = actor.label;
    row.lastModifiedAt = new Date();
    row.changeHistory.push({
      changedBy: actor.id,
      changedByLabel: actor.label,
      changedByRole: actor.role,
      field: 'pickedBy',
      oldValue: null,
      newValue: userId,
      timestamp: new Date(),
    } as any);
    await row.save();

    const populated = await UnifiedDataRow.findById(params.id).populate('pickedBy', 'name empId').lean();
    const serialized = serializeUnifiedRow(populated as Record<string, unknown>);
    emitRowPicked(serialized);
    return NextResponse.json({ success: true, data: { row: serialized } });
  } catch (e: any) {
    console.error('employee unified-data pick', e);
    return NextResponse.json({ error: e.message || 'Failed to pick row' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  return withEmployee((r) => handlePost(r, context))(req);
}
