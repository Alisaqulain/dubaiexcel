
import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import CreatedExcelFile from '@/models/CreatedExcelFile';
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
        data: jsonData, // The actual Excel data
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









