import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withEmployee, AuthenticatedRequest } from '@/lib/middleware';
import UnifiedDataRow from '@/models/UnifiedDataRow';
import { resolveActor } from '@/lib/unifiedDataActor';
import { buildChangeEntries } from '@/lib/unifiedDataChangeApply';
import { serializeUnifiedRow } from '@/lib/unifiedDataRowSerialize';
import { emitRowUpdated } from '@/lib/unifiedDataSocket';
import mongoose from 'mongoose';

async function handlePatch(
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
      return NextResponse.json({ error: 'Row is not available' }, { status: 400 });
    }
    if (!row.pickedBy || String(row.pickedBy) !== String(userOid)) {
      return NextResponse.json({ error: 'You can only edit rows you picked' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const oldName = row.name;
    const oldFields = { ...(row.fields as Record<string, unknown>) };
    const newName = typeof body.name === 'string' ? body.name.trim() : oldName;
    let newFields = { ...oldFields };
    if (body.fields && typeof body.fields === 'object' && !Array.isArray(body.fields)) {
      newFields = { ...oldFields, ...(body.fields as Record<string, unknown>) };
    }

    const actor = await resolveActor(req);
    const entries = buildChangeEntries(actor, oldName, newName, oldFields, newFields);
    if (entries.length === 0) {
      const populated = await UnifiedDataRow.findById(params.id).populate('pickedBy', 'name empId').lean();
      return NextResponse.json({
        success: true,
        data: { row: serializeUnifiedRow(populated as Record<string, unknown>) },
      });
    }

    row.name = newName;
    row.fields = newFields;
    row.lastModifiedBy = actor.id;
    row.lastModifiedByLabel = actor.label;
    row.lastModifiedAt = new Date();
    for (const e of entries) {
      row.changeHistory.push(e as any);
    }
    await row.save();

    const populated = await UnifiedDataRow.findById(params.id).populate('pickedBy', 'name empId').lean();
    const serialized = serializeUnifiedRow(populated as Record<string, unknown>);
    emitRowUpdated(serialized);
    return NextResponse.json({ success: true, data: { row: serialized } });
  } catch (e: any) {
    console.error('employee unified-data patch', e);
    return NextResponse.json({ error: e.message || 'Failed to update row' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  return withEmployee((r) => handlePatch(r, context))(req);
}
