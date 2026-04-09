import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import ExcelFormat from '@/models/ExcelFormat';
import FormatTemplateData from '@/models/FormatTemplateData';
import mongoose from 'mongoose';

/**
 * GET /api/admin/template-deleted-rows?formatId=optional
 * Lists soft-deleted template rows per format (for admin "Deleted data" page).
 */
async function handleGet(req: AuthenticatedRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url || '', 'http://localhost');
    const formatIdFilter = searchParams.get('formatId');

    let formatQuery: Record<string, unknown> = {};
    if (formatIdFilter && mongoose.Types.ObjectId.isValid(formatIdFilter)) {
      formatQuery = { _id: new mongoose.Types.ObjectId(formatIdFilter) };
    }

    const formats = await ExcelFormat.find(formatQuery).sort({ name: 1 }).lean();
    const out: {
      formatId: string;
      formatName: string;
      deletedRows: { rowIndex: number; preview: string }[];
    }[] = [];

    for (const f of formats) {
      const formatId = (f as any)._id;
      const td = await FormatTemplateData.findOne({ formatId }).lean();
      if (!td || !Array.isArray((td as any).rows) || (td as any).rows.length === 0) continue;

      const cols = ((f as any).columns || [])
        .slice()
        .sort((a: { order: number }, b: { order: number }) => a.order - b.order);
      const deletedRows: { rowIndex: number; preview: string }[] = [];

      (td as any).rows.forEach((r: Record<string, unknown>, i: number) => {
        if (r && typeof r === 'object' && r.__deleted === true) {
          const preview = cols
            .slice(0, 5)
            .map((c: { name: string }) => String(r[c.name] ?? '').trim())
            .filter(Boolean)
            .join(' · ');
          deletedRows.push({
            rowIndex: i,
            preview: preview || `(row ${i + 1}, empty preview)`,
          });
        }
      });

      if (deletedRows.length > 0) {
        out.push({
          formatId: String(formatId),
          formatName: String((f as any).name || 'Unnamed format'),
          deletedRows,
        });
      }
    }

    return NextResponse.json({ success: true, data: out });
  } catch (error: any) {
    console.error('template-deleted-rows GET:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to load deleted rows' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const handler = withAdmin((authReq: AuthenticatedRequest) => handleGet(authReq));
  return handler(req);
}
