import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import CreatedExcelFile from '@/models/CreatedExcelFile';

/**
 * GET /api/admin/created-excel-files/[id]/download
 * Download a created Excel file (Admin only)
 */
async function handleDownloadExcelFile(
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

    // Get file with fileData (don't use lean() to preserve Buffer type)
    const file = await CreatedExcelFile.findById(fileId);

    if (!file) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // Ensure fileData is a Buffer
    const fileBuffer = Buffer.isBuffer(file.fileData) 
      ? file.fileData 
      : Buffer.from(file.fileData as any);

    // Return file as download
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${file.originalFilename}"`,
      },
    });
  } catch (error: any) {
    console.error('Download Excel file error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to download Excel file' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleDownloadExcelFile(authReq, context);
  });
  return handler(req);
}

