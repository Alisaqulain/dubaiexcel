import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import CreatedExcelFile from '@/models/CreatedExcelFile';
import ExcelFormat from '@/models/ExcelFormat';
import FormatTemplateData from '@/models/FormatTemplateData';
import PickedTemplateRow from '@/models/PickedTemplateRow';
import mongoose from 'mongoose';
import {
  filterCreatedFilesToCalendarDay,
  mergeAdminTemplateDailyMerge,
  applyPickedByToAdminMerge,
  mergeDailyFileRows,
  buildMergeXlsxBuffer,
  ROW_SOURCE_FILE_ID,
} from '@/lib/formatDailyMerge';

type MergeMode = 'rowsOnly' | 'fullTemplate';

function stripRowIds(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith('_')) continue;
    out[k] = v;
  }
  return out;
}

/**
 * POST /api/admin/merge-selected-saves
 * Body: { formatId, date, fileIds: string[], mode: "rowsOnly" | "fullTemplate", download?: boolean }
 * rowsOnly: concatenate data rows from selected saves (picked rows only in each file).
 * fullTemplate: master template for the format with selected saves overlaid (all template rows).
 */
async function handlePost(req: AuthenticatedRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const formatId = String(body.formatId || '').trim();
    const date = String(body.date || '').trim();
    const mode = String(body.mode || '').trim() as MergeMode;
    const fileIds: string[] = Array.isArray(body.fileIds)
      ? body.fileIds.map((x: unknown) => String(x))
      : [];
    const download = body.download === true || body.download === '1';

    if (!mongoose.Types.ObjectId.isValid(formatId)) {
      return NextResponse.json({ error: 'formatId is required' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }
    if (!fileIds.length || !fileIds.every((id) => mongoose.Types.ObjectId.isValid(id))) {
      return NextResponse.json({ error: 'fileIds must be a non-empty array of ids' }, { status: 400 });
    }
    if (mode !== 'rowsOnly' && mode !== 'fullTemplate') {
      return NextResponse.json({ error: 'mode must be rowsOnly or fullTemplate' }, { status: 400 });
    }

    const formatIdObj = new mongoose.Types.ObjectId(formatId);
    const fmt = await ExcelFormat.findById(formatIdObj).select('name columns').lean();
    if (!fmt) {
      return NextResponse.json({ error: 'Format not found' }, { status: 404 });
    }

    const idObjs = fileIds.map((id: string) => new mongoose.Types.ObjectId(id));
    const docsRaw = await CreatedExcelFile.find({
      _id: { $in: idObjs },
      formatId: formatIdObj,
      isMerged: { $ne: true },
    })
      .select('+fileData')
      .lean();

    if (docsRaw.length !== fileIds.length) {
      return NextResponse.json(
        { error: 'One or more files were not found or do not belong to this format' },
        { status: 400 }
      );
    }

    const allowed = filterCreatedFilesToCalendarDay(docsRaw as Record<string, unknown>[], date);
    const allowedIds = new Set(allowed.map((d) => String((d as { _id: unknown })._id)));
    for (const id of fileIds as string[]) {
      if (!allowedIds.has(id)) {
        return NextResponse.json(
          { error: `File ${id} is not a save for the selected date and format` },
          { status: 400 }
        );
      }
    }

    const order = new Map<string, number>(fileIds.map((id: string, i: number) => [id, i]));
    const sortedDocs = [...docsRaw].sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const ta = new Date(
        (a.lastEditedAt as Date) || (a.updatedAt as Date) || (a.createdAt as Date) || 0
      ).getTime();
      const tb = new Date(
        (b.lastEditedAt as Date) || (b.updatedAt as Date) || (b.createdAt as Date) || 0
      ).getTime();
      const diff = ta - tb;
      if (diff !== 0) return diff;
      const ia = order.get(String(a._id)) ?? 0;
      const ib = order.get(String(b._id)) ?? 0;
      return ia - ib;
    });

    if (mode === 'rowsOnly') {
      const mergeResult = mergeDailyFileRows(sortedDocs as Parameters<typeof mergeDailyFileRows>[0]);
      const columnOrder = mergeResult.columnOrder;
      if (download) {
        const buf = buildMergeXlsxBuffer(mergeResult.rows, columnOrder, 'Merged_rows');
        const safe = String((fmt as { name?: string }).name || 'merge')
          .replace(/[^a-z0-9]+/gi, '_')
          .slice(0, 60);
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${safe}_rows_${date}.xlsx"`,
          },
        });
      }
      const rows = mergeResult.rows.map((r) => stripRowIds(r as Record<string, unknown>));
      return NextResponse.json({
        success: true,
        data: {
          mode,
          columns: columnOrder.filter((c) => !c.startsWith('_')),
          rows,
          rowCount: rows.length,
        },
      });
    }

    const [templateData, pickDocs] = await Promise.all([
      FormatTemplateData.findOne({ formatId: formatIdObj }).lean(),
      PickedTemplateRow.find({ formatId: formatIdObj }).select('rowIndex empName empId').lean(),
    ]);

    const mergeResult = mergeAdminTemplateDailyMerge(
      (fmt as { columns?: { name: string; order?: number }[] }).columns,
      templateData?.rows as unknown[] | undefined,
      sortedDocs as Parameters<typeof mergeAdminTemplateDailyMerge>[2]
    );
    const picksForMerge = (
      pickDocs as { rowIndex?: number; empName?: string; empId?: string }[]
    ).map((p) => ({
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

    if (download) {
      const buf = buildMergeXlsxBuffer(rows, columnOrder, 'Merged_full');
      const safe = String((fmt as { name?: string }).name || 'merge')
        .replace(/[^a-z0-9]+/gi, '_')
        .slice(0, 60);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${safe}_full_sheet_${date}.xlsx"`,
        },
      });
    }

    const rowsOut = rows.map((row) => stripRowIds(row as Record<string, unknown>));
    return NextResponse.json({
      success: true,
      data: {
        mode,
        formatName: (fmt as { name?: string }).name || '',
        columns: columnOrder.filter((c) => c !== ROW_SOURCE_FILE_ID && !c.startsWith('_')),
        rows: rowsOut,
        rowCount: rowsOut.length,
      },
    });
  } catch (e: unknown) {
    console.error('merge-selected-saves:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Merge failed' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return withAdmin((r: AuthenticatedRequest) => handlePost(r))(req);
}
