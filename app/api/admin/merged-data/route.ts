import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import ExcelFormat from '@/models/ExcelFormat';
import FormatTemplateData from '@/models/FormatTemplateData';
import CreatedExcelFile from '@/models/CreatedExcelFile';
import {
  parseClientDayRangeIso,
  parseDayRangeUtc,
  mergeAdminTemplateDailyMerge,
  loadCreatedFilesForFormatAndDay,
  buildMergeXlsxBuffer,
  SUBMITTED_BY_COL,
  ROW_SOURCE_FILE_ID,
} from '@/lib/formatDailyMerge';
import mongoose from 'mongoose';

/**
 * GET /api/admin/merged-data?date=YYYY-MM-DD
 * Provide either formatId (Excel format — same as Format Management) or fileId (CreatedExcelFile) to resolve format.
 * Merges template + all saves for that day (same as format-daily-merge).
 * Optional: rangeStart, rangeEnd (ISO) for local day boundaries.
 * &download=1 — returns .xlsx
 */
async function handleGet(req: AuthenticatedRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url || '', 'http://localhost');
    const fileId = searchParams.get('fileId');
    const formatIdParam = searchParams.get('formatId');
    let date = searchParams.get('date') || '';
    const download = searchParams.get('download') === '1' || searchParams.get('download') === 'true';
    const rangeStartQ = searchParams.get('rangeStart');
    const rangeEndQ = searchParams.get('rangeEnd');

    if (!date) {
      date = new Date().toISOString().slice(0, 10);
    }

    const rangeFromClient = parseClientDayRangeIso(rangeStartQ, rangeEndQ);
    const range = rangeFromClient || parseDayRangeUtc(date);
    if (!range) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }

    let formatId = '';
    let anchorFileId: string | null = null;
    let anchorOriginalName = '';

    if (formatIdParam && mongoose.Types.ObjectId.isValid(formatIdParam)) {
      formatId = formatIdParam;
    } else if (fileId && mongoose.Types.ObjectId.isValid(fileId)) {
      const anchor = await CreatedExcelFile.findById(fileId).select('formatId originalFilename').lean();
      if (!anchor) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }
      anchorFileId = fileId;
      anchorOriginalName = String((anchor as any).originalFilename || '');
      const formatIdRaw = (anchor as any).formatId;
      formatId = formatIdRaw != null ? String(formatIdRaw) : '';
      if (!formatId || !mongoose.Types.ObjectId.isValid(formatId)) {
        return NextResponse.json(
          {
            error:
              'This saved file is not linked to an Excel format. Pick another file from the list that was saved from a format.',
          },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Provide formatId or fileId (valid Mongo ObjectId)' },
        { status: 400 }
      );
    }

    const formatIdObj = new mongoose.Types.ObjectId(formatId);
    const fmt = await ExcelFormat.findById(formatId).select('name columns').lean();
    if (!fmt) {
      return NextResponse.json({ error: 'Format not found' }, { status: 404 });
    }

    const [docs, templateData] = await Promise.all([
      loadCreatedFilesForFormatAndDay(formatIdObj, range.start, range.end),
      FormatTemplateData.findOne({ formatId: formatIdObj }).lean(),
    ]);

    const { rows, columnOrder } = mergeAdminTemplateDailyMerge(
      (fmt as { columns?: { name: string; order?: number }[] }).columns,
      templateData?.rows as unknown[] | undefined,
      docs as any[]
    );

    const rowMeta = rows.map((row) => {
      const editedBy = String(row[SUBMITTED_BY_COL] ?? '').trim();
      const isModified = editedBy.length > 0;
      return { isModified, editedBy };
    });

    if (download) {
      const buf = buildMergeXlsxBuffer(rows, columnOrder, 'Merged_data');
      const safeName = String((fmt as any).name || 'format')
        .replace(/[^a-z0-9]+/gi, '_')
        .slice(0, 80);
      const anchorPart = anchorOriginalName
        ? `_${String(anchorOriginalName)
            .replace(/\.[^/.]+$/, '')
            .replace(/[^a-z0-9]+/gi, '_')
            .slice(0, 40)}`
        : '';
      const filename = `${safeName}${anchorPart}_merge_${date}.xlsx`;
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    const rowsOut = rows.map((r) => {
      const { [ROW_SOURCE_FILE_ID]: _sid, ...rest } = r;
      return rest;
    });

    return NextResponse.json({
      success: true,
      data: {
        date,
        anchorFileId,
        formatId,
        formatName: (fmt as any).name || '',
        fileCount: docs.length,
        rowCount: rows.length,
        columns: columnOrder.filter((c) => c !== ROW_SOURCE_FILE_ID),
        rows: rowsOut,
        rowMeta,
      },
    });
  } catch (e: any) {
    console.error('merged-data:', e);
    return NextResponse.json({ error: e.message || 'Failed to load merged data' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return withAdmin((r: AuthenticatedRequest) => handleGet(r))(req);
}
