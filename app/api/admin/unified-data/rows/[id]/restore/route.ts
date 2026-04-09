import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import UnifiedDataRow from '@/models/UnifiedDataRow';
import { resolveActor } from '@/lib/unifiedDataActor';
import { serializeUnifiedRow } from '@/lib/unifiedDataRowSerialize';
import { emitRowRestored } from '@/lib/unifiedDataSocket';
import mongoose from 'mongoose';

async function handlePost(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();
    const params = await Promise.resolve(context.params);
    if (!mongoose.Types.ObjectId.isValid(params.id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    const row = await UnifiedDataRow.findById(params.id);
    if (!row) {
      return NextResponse.json({ error: 'Row not found' }, { status: 404 });
    }
    if (row.status === 'active') {
      const populated = await UnifiedDataRow.findById(params.id).populate('pickedBy', 'name empId').lean();
      return NextResponse.json({
        success: true,
        data: { row: serializeUnifiedRow(populated as Record<string, unknown>) },
      });
    }

    const actor = await resolveActor(req);
    row.status = 'active';
    row.lastModifiedBy = actor.id;
    row.lastModifiedByLabel = actor.label;
    row.lastModifiedAt = new Date();
    row.changeHistory.push({
      changedBy: actor.id,
      changedByLabel: actor.label,
      changedByRole: actor.role,
      field: 'status',
      oldValue: 'removed',
      newValue: 'active',
      timestamp: new Date(),
    } as any);
    await row.save();

    const populated = await UnifiedDataRow.findById(params.id).populate('pickedBy', 'name empId').lean();
    const serialized = serializeUnifiedRow(populated as Record<string, unknown>);
    emitRowRestored(serialized);
    return NextResponse.json({ success: true, data: { row: serialized } });
  } catch (e: any) {
    console.error('admin unified-data restore', e);
    return NextResponse.json({ error: e.message || 'Failed to restore row' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  return withAdmin((r) => handlePost(r, context))(req);
}
