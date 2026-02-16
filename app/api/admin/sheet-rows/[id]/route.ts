import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import SheetRow from '@/models/SheetRow';
import UploadedSheet from '@/models/UploadedSheet';

/**
 * PATCH /api/admin/sheet-rows/[id]
 * Worker transfer: update row's project. Body: { projectName }.
 * Updates projectName and data[loginColumnName] from the sheet.
 */
async function handlePatch(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();
    const params = await Promise.resolve(context.params);
    const body = await req.json();
    const newProjectName = body.projectName != null ? String(body.projectName).trim() : '';

    const row = await SheetRow.findById(params.id);
    if (!row) {
      return NextResponse.json({ error: 'Row not found' }, { status: 404 });
    }

    const sheet = await UploadedSheet.findById((row as any).sheetId).lean();
    if (!sheet) {
      return NextResponse.json({ error: 'Sheet not found' }, { status: 404 });
    }

    const loginColumnName = (sheet as any).loginColumnName;
    const data = { ...(row.data as Record<string, unknown>) };
    data[loginColumnName] = newProjectName;

    const updated = await SheetRow.findByIdAndUpdate(
      params.id,
      { $set: { projectName: newProjectName || 'UNASSIGNED', data } },
      { new: true }
    ).lean();

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Worker transfer error:', error);
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
  return withAdmin((authReq) => handlePatch(authReq, context))(req);
}
