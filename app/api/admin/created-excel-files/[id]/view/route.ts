import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import CreatedExcelFile from '@/models/CreatedExcelFile';
import ExcelFormat from '@/models/ExcelFormat';
import FormatTemplateData from '@/models/FormatTemplateData';
import { mergeAdminTemplateDailyMerge, rowsFromExcelBuffer } from '@/lib/formatDailyMerge';
import * as XLSX from 'xlsx';

function stripInternalRowKeys(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = { ...r };
    for (const k of Object.keys(out)) {
      if (k.startsWith('_')) delete out[k];
    }
    return out;
  });
}

/**
 * GET /api/admin/created-excel-files/[id]/view
 * View a created Excel file data (Admin only) - returns JSON data without downloading.
 * For employee day-saves tied to a format, expands to the full template: original rows plus
 * cells overwritten from the saved file (via pickedTemplateRowIndices / id matching).
 */
async function handleViewExcelFile(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();

    const params = await Promise.resolve(context.params);
    const fileId = params.id;

    if (!fileId) {
      return NextResponse.json(
        { error: 'File ID is required' },
        { status: 400 }
      );
    }

    // Get file with fileData
    const file = await CreatedExcelFile.findById(fileId);

    if (!file) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    const fileBuffer = Buffer.isBuffer(file.fileData)
      ? file.fileData
      : Buffer.from(file.fileData as any);

    let jsonData: Record<string, unknown>[] = [];
    let columnOrder: string[] | undefined;
    let viewMode: 'fullTemplate' | 'raw' = 'raw';

    /** Same template overlay as daily merge: full master rows + this file’s edits (pick indices or EMP/SR match). */
    const canExpand = !file.isMerged && !!file.formatId;

    if (canExpand) {
      const [formatDoc, templateDoc] = await Promise.all([
        ExcelFormat.findById(file.formatId).lean(),
        FormatTemplateData.findOne({ formatId: file.formatId }).lean(),
      ]);
      const templateRows = templateDoc && Array.isArray(templateDoc.rows) ? templateDoc.rows : null;
      if (formatDoc && templateRows && templateRows.length > 0) {
        const merged = mergeAdminTemplateDailyMerge(
          (formatDoc as { columns?: Array<{ name: string; order?: number }> }).columns,
          templateRows,
          [
            {
              _id: file._id,
              fileData: fileBuffer,
              createdByName: file.createdByName,
              createdByEmail: file.createdByEmail,
              originalFilename: file.originalFilename,
              lastEditedAt: file.lastEditedAt,
              updatedAt: file.updatedAt,
              createdAt: file.createdAt,
              pickedTemplateRowIndices: file.pickedTemplateRowIndices,
            },
          ]
        );
        jsonData = stripInternalRowKeys(merged.rows);
        columnOrder = merged.columnOrder.filter((c) => !c.startsWith('_'));
        viewMode = 'fullTemplate';
      }
    }

    if (viewMode === 'raw') {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Record<string, unknown>[];
      if (jsonData.length === 0) {
        jsonData = rowsFromExcelBuffer(fileBuffer);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: file._id,
        filename: file.originalFilename,
        labourType: file.labourType,
        rowCount: file.rowCount,
        expandedRowCount: viewMode === 'fullTemplate' ? jsonData.length : undefined,
        viewMode,
        columnOrder,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        isMerged: file.isMerged,
        mergedFrom: file.mergedFrom,
        mergeCount: file.mergeCount || 0,
        data: jsonData,
      },
    });
  } catch (error: any) {
    console.error('View Excel file error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to view Excel file' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleViewExcelFile(authReq, context);
  });
  return handler(req);
}
