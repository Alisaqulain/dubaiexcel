
import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import CreatedExcelFile from '@/models/CreatedExcelFile';
import ExcelFormat from '@/models/ExcelFormat';
import FormatTemplateData from '@/models/FormatTemplateData';
import {
  reconcilePickFileWithTemplate,
  mergePickFileRowsFromTemplate,
} from '@/lib/reconcilePickFileWithTemplate';
import * as XLSX from 'xlsx';

/**
 * GET /api/employee/created-excel-files/[id]
 * Get a single created Excel file for viewing/editing
 */
async function handleGetMyCreatedFile(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();

    const params = await Promise.resolve(context.params);
    const fileId = params.id;
    const userId = req.user?.userId;

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
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

    // Verify the file belongs to this user
    if (file.createdBy.toString() !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized: You can only access your own files' },
        { status: 403 }
      );
    }

    // Read Excel file and convert to JSON
    const fileBuffer = Buffer.isBuffer(file.fileData) 
      ? file.fileData 
      : Buffer.from(file.fileData as any);

    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    let jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Record<string, unknown>[];
    let pickedOut: number[] | undefined = Array.isArray(file.pickedTemplateRowIndices)
      ? [...file.pickedTemplateRowIndices]
      : undefined;
    let rowCountOut = file.rowCount;

    // Pick files: drop rows whose template line was admin-deleted; fix stale template indices.
    const storedPickIndices = Array.isArray(file.pickedTemplateRowIndices) ? file.pickedTemplateRowIndices : null;
    const isPickFile = !!file.formatId && storedPickIndices !== null && storedPickIndices.length > 0;
    if (isPickFile && jsonData.length > 0) {
      const aligned = storedPickIndices.length === jsonData.length;
      const fmt = await ExcelFormat.findById(file.formatId).lean();
      const td = await FormatTemplateData.findOne({ formatId: file.formatId }).lean();
      const templateRows = td && Array.isArray((td as any).rows) ? (td as any).rows : null;
      if (fmt && templateRows?.length) {
        const rec = reconcilePickFileWithTemplate(
          jsonData,
          templateRows,
          ((fmt as any).columns || []) as { name: string; editable?: boolean }[],
          aligned ? storedPickIndices : null
        );
        if (rec.indices.length === rec.rows.length) {
          jsonData = rec.rows;
          pickedOut = rec.indices;
          rowCountOut = rec.rows.length;

          const colNames = ((fmt as any).columns || [])
            .map((c: any) => String(c?.name || '').trim())
            .filter(Boolean);
          const merged = mergePickFileRowsFromTemplate(jsonData, pickedOut, templateRows, colNames);
          if (merged.changed) {
            jsonData = merged.rows;
            rowCountOut = jsonData.length;
          }

          if (rec.changed || merged.changed) {
            const newWb = XLSX.utils.book_new();
            const newWs = XLSX.utils.json_to_sheet(jsonData);
            XLSX.utils.book_append_sheet(newWb, newWs, firstSheetName || 'Data');
            const buf = Buffer.from(XLSX.write(newWb, { type: 'array', bookType: 'xlsx' }));
            await CreatedExcelFile.updateOne(
              { _id: file._id },
              {
                $set: {
                  fileData: buf,
                  rowCount: jsonData.length,
                  pickedTemplateRowIndices: pickedOut,
                },
              }
            );
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: file._id,
        filename: file.originalFilename,
        labourType: file.labourType,
        rowCount: rowCountOut,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        data: jsonData,
        formatId: file.formatId?.toString?.() ?? undefined,
        pickedTemplateRowIndices: pickedOut,
      },
    });
  } catch (error: any) {
    console.error('Get my created file error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get file' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAuth(async (authReq: AuthenticatedRequest) => {
    return handleGetMyCreatedFile(authReq, context);
  });
  return handler(req);
}









