import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withProjectHead, AuthenticatedRequest } from '@/lib/middleware';
import SheetRow from '@/models/SheetRow';

/**
 * PATCH /api/project-head/rows/[id]
 * Project Head can update: data (editable fields), status, notes. Cannot delete or change projectName.
 */
async function handlePatch(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();

    const projectName = (req.user as any)?.projectName;
    if (!projectName) {
      return NextResponse.json({ error: 'Project not found in token' }, { status: 403 });
    }

    const params = await Promise.resolve(context.params);
    const rowId = params.id;

    const row = await SheetRow.findById(rowId).lean();
    if (!row) {
      return NextResponse.json({ error: 'Row not found' }, { status: 404 });
    }
    if (String((row as any).projectName) !== String(projectName)) {
      return NextResponse.json({ error: 'You can only edit rows in your project' }, { status: 403 });
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};
    if (body.status !== undefined) updates.status = body.status;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.data && typeof body.data === 'object') {
      updates.data = { ...(row as any).data, ...body.data };
    }

    const updated = await SheetRow.findByIdAndUpdate(
      rowId,
      { $set: updates, $setOnInsert: { updatedAt: new Date() } },
      { new: true }
    ).lean();

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Project head update row error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update row' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  return withProjectHead((authReq) => handlePatch(authReq, context))(req);
}
