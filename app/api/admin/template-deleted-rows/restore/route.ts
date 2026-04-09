import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import ExcelFormat from '@/models/ExcelFormat';
import FormatTemplateData from '@/models/FormatTemplateData';
import mongoose from 'mongoose';

/**
 * POST /api/admin/template-deleted-rows/restore
 * Body: { formatId: string, rowIndices: number[] }
 * Clears __deleted on those rows only. Does not restore picks or assignments.
 */
async function handleRestore(req: AuthenticatedRequest) {
  try {
    await connectDB();
    const body = await req.json().catch(() => ({}));
    const formatId = body.formatId as string;
    let rowIndices = body.rowIndices as unknown;
    if (!Array.isArray(rowIndices)) rowIndices = [];
    const indices = (rowIndices as unknown[])
      .map((x) => (typeof x === 'number' ? x : parseInt(String(x), 10)))
      .filter((n) => typeof n === 'number' && !isNaN(n) && n >= 0);

    if (!formatId || !mongoose.Types.ObjectId.isValid(formatId)) {
      return NextResponse.json({ error: 'Valid formatId is required' }, { status: 400 });
    }
    if (indices.length === 0) {
      return NextResponse.json({ error: 'rowIndices must be a non-empty array' }, { status: 400 });
    }

    const format = await ExcelFormat.findById(formatId);
    if (!format) {
      return NextResponse.json({ error: 'Format not found' }, { status: 404 });
    }

    const doc = await FormatTemplateData.findOne({ formatId });
    if (!doc || !Array.isArray(doc.rows)) {
      return NextResponse.json({ error: 'No template data for this format' }, { status: 404 });
    }

    const rows = doc.rows as unknown[];
    const restored: number[] = [];
    const skipped: number[] = [];

    for (const i of indices) {
      if (i >= rows.length) {
        skipped.push(i);
        continue;
      }
      const r = rows[i];
      if (!r || typeof r !== 'object') {
        skipped.push(i);
        continue;
      }
      const rec = r as Record<string, unknown>;
      if (rec.__deleted !== true) {
        skipped.push(i);
        continue;
      }
      delete rec.__deleted;
      restored.push(i);
    }

    await doc.save();

    return NextResponse.json({
      success: true,
      data: {
        restored,
        skipped,
        message:
          restored.length > 0
            ? `Restored ${restored.length} row(s). They are available again as unpicked template rows.`
            : 'No deleted rows were restored (check row indices).',
      },
    });
  } catch (error: any) {
    console.error('template-deleted-rows restore:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to restore rows' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const handler = withAdmin((authReq: AuthenticatedRequest) => handleRestore(authReq));
  return handler(req);
}
