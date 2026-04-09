import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import ExcelFormat from '@/models/ExcelFormat';
import FormatTemplateData from '@/models/FormatTemplateData';
import {
  parseDayRangeUtc,
  parseClientDayRangeIso,
  mergeAdminTemplateDailyMerge,
  loadCreatedFilesForFormatAndDay,
  buildMergeXlsxBuffer,
} from '@/lib/formatDailyMerge';
import mongoose from 'mongoose';

/**
 * GET /api/admin/format-daily-merge?formatId=&date=YYYY-MM-DD
 * JSON by default.
 * GET ...&download=1 — Excel file download with Submitted by / Saved at columns.
 */
async function handleGet(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url || '', 'http://localhost');
    const formatId = searchParams.get('formatId');
    let date = searchParams.get('date') || '';
    const download = searchParams.get('download') === '1' || searchParams.get('download') === 'true';
    const rangeStartQ = searchParams.get('rangeStart');
    const rangeEndQ = searchParams.get('rangeEnd');

    if (!date) {
      date = new Date().toISOString().slice(0, 10);
    }

    if (!formatId || !mongoose.Types.ObjectId.isValid(formatId)) {
      return NextResponse.json({ error: 'formatId is required' }, { status: 400 });
    }

    const rangeFromClient = parseClientDayRangeIso(rangeStartQ, rangeEndQ);
    const range = rangeFromClient || parseDayRangeUtc(date);
    if (!range) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }

    const fmt = await ExcelFormat.findById(formatId).select('name columns').lean();
    if (!fmt) {
      return NextResponse.json({ error: 'Format not found' }, { status: 404 });
    }

    const formatIdObj = new mongoose.Types.ObjectId(formatId);
    const [docs, templateData] = await Promise.all([
      loadCreatedFilesForFormatAndDay(formatIdObj, range.start, range.end),
      FormatTemplateData.findOne({ formatId: formatIdObj }).lean(),
    ]);
    const { rows, columnOrder } = mergeAdminTemplateDailyMerge(
      (fmt as { columns?: { name: string; order?: number }[] }).columns,
      templateData?.rows as unknown[] | undefined,
      docs as any[]
    );

    if (download) {
      const buf = buildMergeXlsxBuffer(rows, columnOrder, 'All_merge_data');
      const safeName = String((fmt as any).name || 'format')
        .replace(/[^a-z0-9]+/gi, '_')
        .slice(0, 80);
      const filename = `${safeName}_all_merge_${date}.xlsx`;
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        date,
        formatId,
        formatName: (fmt as any).name || '',
        fileCount: docs.length,
        rowCount: rows.length,
        columns: columnOrder,
        rows,
      },
    });
  } catch (e: any) {
    console.error('format-daily-merge admin:', e);
    return NextResponse.json({ error: e.message || 'Failed to load merge data' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return withAdmin((r: AuthenticatedRequest) => handleGet(r))(req);
}
