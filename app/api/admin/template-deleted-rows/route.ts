import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import ExcelFormat from '@/models/ExcelFormat';
import FormatTemplateData from '@/models/FormatTemplateData';
import mongoose from 'mongoose';

import { buildColumnTypesMap } from '@/lib/formatColumnUtils';

/**
 * GET /api/admin/template-deleted-rows?formatId=optional
 * Lists soft-deleted template rows per format with full row data (all columns).
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
      columns: string[];
      columnTypes: Record<string, string>;
      deletedRows: { rowIndex: number; row: Record<string, unknown> }[];
    }[] = [];

    for (const f of formats) {
      const formatId = (f as { _id: unknown })._id;
      const td = await FormatTemplateData.findOne({ formatId }).lean();
      if (!td || !Array.isArray((td as { rows?: unknown[] }).rows) || (td as { rows: unknown[] }).rows.length === 0)
        continue;

      const formatColumns = ((f as { columns?: { name: string; type?: string; order?: number }[] }).columns || [])
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const columns = formatColumns.map((c) => c.name).filter(Boolean);
      const columnTypes = buildColumnTypesMap(formatColumns);
      const deletedRows: { rowIndex: number; row: Record<string, unknown> }[] = [];

      (td as { rows: Record<string, unknown>[] }).rows.forEach((r, i) => {
        if (r && typeof r === 'object' && r.__deleted === true) {
          const row: Record<string, unknown> = {};
          for (const col of columns) {
            row[col] = r[col] ?? '';
          }
          deletedRows.push({ rowIndex: i, row });
        }
      });

      if (deletedRows.length > 0) {
        out.push({
          formatId: String(formatId),
          formatName: String((f as { name?: string }).name || 'Unnamed format'),
          columns,
          columnTypes,
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
