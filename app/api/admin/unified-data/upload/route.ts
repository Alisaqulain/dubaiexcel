import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import UnifiedDataRow from '@/models/UnifiedDataRow';
import UnifiedExcelFile from '@/models/UnifiedExcelFile';
import { resolveActor } from '@/lib/unifiedDataActor';
import {
  deriveRowName,
  normalizeRowFields,
  parseSpreadsheetBuffer,
  saveUploadedBuffer,
} from '@/lib/unifiedDataFileUtils';
import { emitRowsImported } from '@/lib/unifiedDataSocket';
import mongoose from 'mongoose';

async function handlePost(req: AuthenticatedRequest) {
  try {
    await connectDB();
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    const userId = req.user?.userId;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { fileName, filePath } = await saveUploadedBuffer(file.name, buffer);

    const fileDoc = await UnifiedExcelFile.create({
      fileName,
      originalName: file.name,
      filePath,
      uploadedBy: new mongoose.Types.ObjectId(userId),
      uploadedAt: new Date(),
    });

    const rawRows = parseSpreadsheetBuffer(buffer, file.name);
    if (rawRows.length === 0) {
      return NextResponse.json({ error: 'No data rows in file' }, { status: 400 });
    }

    const actor = await resolveActor(req);
    const now = new Date();
    const fileOid = fileDoc._id as mongoose.Types.ObjectId;
    const docs = rawRows.map((r) => {
      const fields = normalizeRowFields(r as Record<string, unknown>);
      const name = deriveRowName(fields);
      return {
        name,
        fields,
        pickedBy: null,
        status: 'active' as const,
        fileId: fileOid,
        changeHistory: [],
        lastModifiedBy: actor.id,
        lastModifiedByLabel: actor.label,
        lastModifiedAt: now,
      };
    });

    const created = await UnifiedDataRow.insertMany(docs);
    emitRowsImported(created.length);

    return NextResponse.json({
      success: true,
      data: {
        fileId: String(fileDoc._id),
        rowCount: created.length,
        storedPath: filePath,
      },
    });
  } catch (e: any) {
    console.error('admin unified-data upload', e);
    return NextResponse.json({ error: e.message || 'Upload failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return withAdmin((r) => handlePost(r))(req);
}
