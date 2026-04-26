import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import ExcelFormat from '@/models/ExcelFormat';
import FormatTemplateData from '@/models/FormatTemplateData';
import CreatedExcelFile from '@/models/CreatedExcelFile';
import PickedTemplateRow from '@/models/PickedTemplateRow';
import {
  parseClientDayRangeIso,
  parseDayRangeUtc,
  mergeAdminTemplateDailyMerge,
  applyPickedByToAdminMerge,
  loadCreatedFilesForFormatAndDay,
  buildMergeXlsxBuffer,
  SUBMITTED_BY_COL,
  ROW_SOURCE_FILE_ID,
} from '@/lib/formatDailyMerge';
import mongoose from 'mongoose';

function looksLikeDailyEmployeeSave(d: Record<string, unknown>): boolean {
  const ymd = d.dailyWorkDate;
  if (typeof ymd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ymd)) return true;
  const name = String(d.originalFilename || '');
  return /_[0-9]{4}-[0-9]{2}-[0-9]{2}\.xlsx$/i.test(name);
}

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
    const labourTypeQ = searchParams.get('labourType')?.trim() || '';
    const download = searchParams.get('download') === '1' || searchParams.get('download') === 'true';
    const debugMerge =
      searchParams.get('debugMerge') === '1' || searchParams.get('debugMerge') === 'true';
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

    const labourFilter =
      labourTypeQ && ['OUR_LABOUR', 'SUPPLY_LABOUR', 'SUBCONTRACTOR'].includes(labourTypeQ)
        ? labourTypeQ
        : null;

    const [docs, templateData, pickDocs] = await Promise.all([
      loadCreatedFilesForFormatAndDay(formatIdObj, range.start, range.end, date, labourFilter),
      FormatTemplateData.findOne({ formatId: formatIdObj }).lean(),
      PickedTemplateRow.find({ formatId: formatIdObj }).select('rowIndex empName empId').lean(),
    ]);

    const mergeResult = mergeAdminTemplateDailyMerge(
      (fmt as { columns?: { name: string; order?: number }[] }).columns,
      templateData?.rows as unknown[] | undefined,
      docs as any[]
    );
    const picksForMerge = (pickDocs as { rowIndex?: number; empName?: string; empId?: string }[]).map((p) => ({
      rowIndex: Number(p.rowIndex),
      empName: p.empName,
      empId: p.empId,
    }));
    const { rows, columnOrder } = applyPickedByToAdminMerge(
      mergeResult.rows,
      mergeResult.columnOrder,
      mergeResult.rowStorageIndices,
      picksForMerge
    );

    const rowMeta = rows.map((row) => {
      const editedBy = String(row[SUBMITTED_BY_COL] ?? '').trim();
      const isModified = editedBy.length > 0;
      return { isModified, editedBy };
    });

    const mergeDebug = debugMerge
      ? {
          date,
          rangeUtc: { start: range.start.toISOString(), end: range.end.toISOString() },
          fileCount: docs.length,
          dailyFilesMissingPickIndices: (docs as Record<string, unknown>[]).filter(
            (d) =>
              looksLikeDailyEmployeeSave(d) &&
              (!Array.isArray(d.pickedTemplateRowIndices) || d.pickedTemplateRowIndices.length === 0)
          ).length,
          files: (docs as Record<string, unknown>[]).map((d) => ({
            id: String(d._id ?? ''),
            originalFilename: d.originalFilename,
            dailyWorkDate: d.dailyWorkDate,
            lastEditedAt: d.lastEditedAt,
            updatedAt: d.updatedAt,
            pickIndicesLen: Array.isArray(d.pickedTemplateRowIndices)
              ? (d.pickedTemplateRowIndices as unknown[]).length
              : 0,
            fileDataBytes:
              d.fileData != null
                ? typeof d.fileData === 'object' && 'length' in (d.fileData as object)
                  ? Number((d.fileData as { length: number }).length)
                  : -1
                : 0,
          })),
          rowCount: rows.length,
          rowsWithSaveOverlay: rows.filter((r) => String(r[SUBMITTED_BY_COL] ?? '').trim().length > 0)
            .length,
        }
      : undefined;

    if (mergeDebug) {
      console.log('[merged-data] debugMerge', mergeDebug);
      if (mergeDebug.dailyFilesMissingPickIndices > 0) {
        console.warn(
          '[merged-data] Some day-stamped saves lack pickedTemplateRowIndices (re-save from employee app to fix; admin showed master HR until then). Count:',
          mergeDebug.dailyFilesMissingPickIndices
        );
      }
    }

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
    const rowTemplateIndices = mergeResult.rowStorageIndices;

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
        /** Parallel to `rows`: template storage index in FormatTemplateData.rows, or null for appended rows. */
        rowTemplateIndices,
        ...(mergeDebug ? { debug: mergeDebug } : {}),
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
