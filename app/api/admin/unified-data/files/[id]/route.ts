import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import UnifiedExcelFile from '@/models/UnifiedExcelFile';
import UnifiedDataRow from '@/models/UnifiedDataRow';
import path from 'path';
import fs from 'fs/promises';
import mongoose from 'mongoose';

async function handleDelete(req: AuthenticatedRequest, id: string) {
  try {
    await connectDB();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const oid = new mongoose.Types.ObjectId(id);
    const refCount = await UnifiedDataRow.countDocuments({ fileId: oid });
    if (refCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete file record: ${refCount} row(s) still reference this upload.`,
        },
        { status: 409 }
      );
    }

    const fileDoc = await UnifiedExcelFile.findByIdAndDelete(oid).lean();
    if (!fileDoc) {
      return NextResponse.json({ error: 'File record not found' }, { status: 404 });
    }

    const fp = (fileDoc as { filePath: string }).filePath;
    const abs = path.join(process.cwd(), fp.split('/').join(path.sep));
    try {
      await fs.unlink(abs);
    } catch {
      // missing file
    }

    return NextResponse.json({ success: true, data: { id } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete file record';
    console.error('admin unified-data file DELETE:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const params = await Promise.resolve(context.params);
  return withAdmin((r) => handleDelete(r, params.id))(req);
}
