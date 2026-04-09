import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import FormatTemplateData from '@/models/FormatTemplateData';
import ExcelFormat from '@/models/ExcelFormat';
import CreatedExcelFile from '@/models/CreatedExcelFile';
import PickedTemplateRow from '@/models/PickedTemplateRow';
import { reconcilePickFileWithTemplate } from '@/lib/reconcilePickFileWithTemplate';
import * as XLSX from 'xlsx';
import mongoose from 'mongoose';

/**
 * POST /api/admin/excel-formats/save-template-data
 * Save template row data for an Excel format
 */
async function handleSaveTemplateData(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const body = await req.json();
    const { formatId, rows } = body;

    if (!formatId) {
      return NextResponse.json(
        { error: 'Format ID is required' },
        { status: 400 }
      );
    }

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json(
        { error: 'Rows must be an array' },
        { status: 400 }
      );
    }

    // Verify format exists
    const format = await ExcelFormat.findById(formatId);
    if (!format) {
      return NextResponse.json(
        { error: 'Format not found' },
        { status: 404 }
      );
    }

    // Save or update template data
    const templateData = await FormatTemplateData.findOneAndUpdate(
      { formatId },
      {
        formatId,
        rows,
        uploadedBy: req.user?.userId,
      },
      { upsert: true, new: true }
    );

    // Deleted rows + pick files sync.
    const formatIdObj = new mongoose.Types.ObjectId(formatId);
    const deletedIndices = new Set<number>();
    rows.forEach((r: any, i: number) => {
      if (r && typeof r === 'object' && r.__deleted === true) deletedIndices.add(i);
    });

    // Release deleted rows so they are no longer picked by anyone
    if (deletedIndices.size > 0) {
      await PickedTemplateRow.deleteMany({
        formatId: formatIdObj,
        rowIndex: { $in: Array.from(deletedIndices) },
      });
    }

    // Employee "pick" files mirror template rows by index. When admin saves the template, merge
    // **all** format columns from the master row into each saved pick row so edits like COMPANY
    // propagate even if those columns are marked editable in the format (otherwise employees stay on stale values).
    const pickRowSyncCols = (format.columns || [])
      .map((c: any) => String(c?.name || '').trim())
      .filter(Boolean);

    const shouldTouchPickFiles = deletedIndices.size > 0 || pickRowSyncCols.length > 0;
    if (shouldTouchPickFiles) {
      const pickFiles = await CreatedExcelFile.find({
        formatId: formatIdObj,
        pickedTemplateRowIndices: { $exists: true, $ne: [] },
        isMerged: { $ne: true },
      }).select('+fileData pickedTemplateRowIndices originalFilename').lean();

      const adminIdObj = req.user?.userId ? new mongoose.Types.ObjectId(req.user.userId as string) : undefined;
      const adminName = (req.user as any)?.name || (req.user as any)?.email || 'Admin';

      await Promise.all(
        pickFiles.map(async (f: any) => {
          try {
            let indicesRaw: number[] = Array.isArray(f.pickedTemplateRowIndices) ? [...f.pickedTemplateRowIndices] : [];
            if (indicesRaw.length === 0) return;

            const fileBuffer = Buffer.isBuffer(f.fileData) ? f.fileData : Buffer.from(f.fileData as any);
            const wb = XLSX.read(fileBuffer, { type: 'buffer' });
            const sheetName = wb.SheetNames[0];
            const ws = wb.Sheets[sheetName];
            let currentRows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
            const alignedPick = indicesRaw.length === currentRows.length;
            if (!alignedPick) {
              const rec = reconcilePickFileWithTemplate(
                currentRows,
                rows,
                (format.columns || []) as { name: string; editable?: boolean }[],
                null
              );
              if (rec.indices.length === rec.rows.length && rec.rows.length > 0) {
                currentRows = rec.rows;
                indicesRaw = rec.indices;
              }
            }
            if (indicesRaw.length === 0 || indicesRaw.length !== currentRows.length) return;

            // Remove deleted template rows from this file
            const keepPairs = indicesRaw
              .map((templateIndex, fileRowIndex) => ({ templateIndex, fileRowIndex }))
              .filter((p) => typeof p.templateIndex === 'number' && p.templateIndex >= 0 && p.templateIndex < rows.length)
              .filter((p) => !deletedIndices.has(p.templateIndex));

            const newPickedTemplateRowIndices = keepPairs.map((p) => p.templateIndex);
            const nextRows = keepPairs.map(({ templateIndex, fileRowIndex }) => {
              const row = currentRows[fileRowIndex];
              const templateRow = rows[templateIndex] || {};
              const next = { ...(row || {}) };
              pickRowSyncCols.forEach((colName: string) => {
                if (colName.startsWith('__')) return;
                if (Object.prototype.hasOwnProperty.call(templateRow, colName)) {
                  next[colName] = (templateRow as any)[colName];
                }
              });
              return next;
            });

            const newWb = XLSX.utils.book_new();
            const newWs = XLSX.utils.json_to_sheet(nextRows);
            XLSX.utils.book_append_sheet(newWb, newWs, sheetName || 'Data');
            const newBuf = Buffer.from(XLSX.write(newWb, { type: 'array', bookType: 'xlsx' }));

            await CreatedExcelFile.updateOne(
              { _id: f._id },
              {
                $set: {
                  fileData: newBuf,
                  rowCount: nextRows.length,
                  pickedTemplateRowIndices: newPickedTemplateRowIndices,
                  lastEditedAt: new Date(),
                  ...(adminIdObj ? { lastEditedBy: adminIdObj } : {}),
                  lastEditedByName: adminName,
                },
              }
            );
          } catch (e) {
            console.error('Failed to sync pick file after template save:', f?._id, e);
          }
        })
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        formatId: templateData.formatId,
        rowsCount: templateData.rows.length,
      },
      message: `Successfully saved ${rows.length} rows as template data`,
    });
  } catch (error: any) {
    console.error('Save template data error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save template data' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleSaveTemplateData(authReq);
  });
  return handler(req);
}
