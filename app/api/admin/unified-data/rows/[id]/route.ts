import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import UnifiedDataRow from '@/models/UnifiedDataRow';
import Employee from '@/models/Employee';
import { resolveActor } from '@/lib/unifiedDataActor';
import { buildChangeEntries } from '@/lib/unifiedDataChangeApply';
import { serializeUnifiedRow } from '@/lib/unifiedDataRowSerialize';
import { emitRowDeleted, emitRowUpdated } from '@/lib/unifiedDataSocket';
import mongoose from 'mongoose';

async function handlePatch(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();
    const params = await Promise.resolve(context.params);
    if (!mongoose.Types.ObjectId.isValid(params.id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const row = await UnifiedDataRow.findById(params.id);
    if (!row) {
      return NextResponse.json({ error: 'Row not found' }, { status: 404 });
    }
    if (row.status === 'removed') {
      return NextResponse.json({ error: 'Cannot edit removed row' }, { status: 400 });
    }

    const oldName = row.name;
    const oldFields = { ...(row.fields as Record<string, unknown>) };
    const newName = typeof body.name === 'string' ? body.name.trim() : oldName;
    let newFields = { ...oldFields };
    if (body.fields && typeof body.fields === 'object' && !Array.isArray(body.fields)) {
      newFields = { ...oldFields, ...(body.fields as Record<string, unknown>) };
    }

    const actor = await resolveActor(req);
    const entries = buildChangeEntries(actor, oldName, newName, oldFields, newFields);

    const oldPicked = row.pickedBy ? String(row.pickedBy) : null;
    let nextPickedId: mongoose.Types.ObjectId | null = row.pickedBy;
    if ('pickedBy' in body) {
      if (body.pickedBy === null || body.pickedBy === '') {
        nextPickedId = null;
      } else if (typeof body.pickedBy === 'string' && mongoose.Types.ObjectId.isValid(body.pickedBy)) {
        const emp = await Employee.findById(body.pickedBy).select('_id').lean();
        if (!emp) {
          return NextResponse.json({ error: 'Employee not found' }, { status: 400 });
        }
        nextPickedId = new mongoose.Types.ObjectId(body.pickedBy);
      } else {
        return NextResponse.json({ error: 'pickedBy must be employee id or null' }, { status: 400 });
      }
    }
    const newPickedStr = nextPickedId ? String(nextPickedId) : null;
    if (oldPicked !== newPickedStr) {
      entries.push({
        changedBy: actor.id,
        changedByLabel: actor.label,
        changedByRole: actor.role,
        field: 'pickedBy',
        oldValue: oldPicked,
        newValue: newPickedStr,
        timestamp: new Date(),
      });
    }

    if (entries.length === 0) {
      const populated = await UnifiedDataRow.findById(params.id).populate('pickedBy', 'name empId').lean();
      return NextResponse.json({
        success: true,
        data: { row: serializeUnifiedRow(populated as Record<string, unknown>) },
      });
    }

    row.name = newName;
    row.fields = newFields;
    row.pickedBy = nextPickedId;
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
    console.error('admin unified-data patch', e);
    return NextResponse.json({ error: e.message || 'Failed to update row' }, { status: 500 });
  }
}

async function handleDelete(
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
    if (row.status === 'removed') {
      return NextResponse.json({ success: true, data: { alreadyRemoved: true } });
    }

    const actor = await resolveActor(req);
    row.status = 'removed';
    row.pickedBy = null;
    row.lastModifiedBy = actor.id;
    row.lastModifiedByLabel = actor.label;
    row.lastModifiedAt = new Date();
    row.changeHistory.push({
      changedBy: actor.id,
      changedByLabel: actor.label,
      changedByRole: actor.role,
      field: 'status',
      oldValue: 'active',
      newValue: 'removed',
      timestamp: new Date(),
    } as any);
    await row.save();

    emitRowDeleted(String(row._id));
    return NextResponse.json({ success: true, data: { id: String(row._id) } });
  } catch (e: any) {
    console.error('admin unified-data delete', e);
    return NextResponse.json({ error: e.message || 'Failed to delete row' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  return withAdmin((r) => handlePatch(r, context))(req);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  return withAdmin((r) => handleDelete(r, context))(req);
}
