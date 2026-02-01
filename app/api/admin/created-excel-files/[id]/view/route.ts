import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import CreatedExcelFile from '@/models/CreatedExcelFile';
import * as XLSX from 'xlsx';

/**
 * GET /api/admin/created-excel-files/[id]/view
 * View a created Excel file data (Admin only) - returns JSON data without downloading
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

    // Read Excel file and convert to JSON
    const fileBuffer = Buffer.isBuffer(file.fileData) 
      ? file.fileData 
      : Buffer.from(file.fileData as any);

    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    return NextResponse.json({
      success: true,
      data: {
        id: file._id,
        filename: file.originalFilename,
        labourType: file.labourType,
        rowCount: file.rowCount,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        isMerged: file.isMerged,
        mergedFrom: file.mergedFrom,
        mergeCount: file.mergeCount || 0,
        data: jsonData, // The actual Excel data
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
