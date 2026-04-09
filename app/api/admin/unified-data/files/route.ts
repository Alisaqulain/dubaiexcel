import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import UnifiedExcelFile from '@/models/UnifiedExcelFile';
import User from '@/models/User';
import mongoose from 'mongoose';

async function handleGet(req: AuthenticatedRequest) {
  try {
    await connectDB();
    const files = await UnifiedExcelFile.find().sort({ uploadedAt: -1 }).limit(200).lean();

    const uploaderIds = Array.from(
      new Set(files.map((f) => String((f as { uploadedBy: unknown }).uploadedBy)))
    );
    const oids = uploaderIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    const users = await User.find({ _id: { $in: oids } }).select('name email').lean();
    const userMap = new Map(
      users.map((u) => {
        const doc = u as { _id: unknown; name?: string; email?: string };
        return [String(doc._id), doc] as const;
      })
    );

    const data = files.map((f) => {
      const doc = f as {
        _id: unknown;
        fileName: string;
        originalName: string;
        filePath: string;
        uploadedBy: unknown;
        uploadedAt?: Date;
      };
      const u = userMap.get(String(doc.uploadedBy));
      return {
        _id: String(doc._id),
        fileName: doc.fileName,
        originalName: doc.originalName,
        filePath: doc.filePath,
        uploadedBy: String(doc.uploadedBy),
        uploadedByLabel:
          (u as { name?: string; email?: string } | undefined)?.name ||
          (u as { name?: string; email?: string } | undefined)?.email ||
          String(doc.uploadedBy),
        uploadedAt: doc.uploadedAt ? new Date(doc.uploadedAt).toISOString() : null,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list files';
    console.error('admin unified-data files GET:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return withAdmin(handleGet)(req);
}
