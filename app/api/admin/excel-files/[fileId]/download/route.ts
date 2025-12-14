import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin } from '@/lib/middleware';
import ExcelFile from '@/models/ExcelFile';

async function handleDownloadFile(
  req: NextRequest,
  context: { params: Promise<{ fileId: string }> }
) {
  try {
    await connectDB();

    const params = await context.params;
    const { fileId } = params;

    const file = await ExcelFile.findOne({ fileId }).lean();

    if (!file) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    if (!file.fileData) {
      return NextResponse.json(
        { error: 'File data not available' },
        { status: 404 }
      );
    }

    // Convert Buffer to Uint8Array for NextResponse
    const buffer = Buffer.from(file.fileData as Buffer);
    
    // Return file as download
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        'Content-Length': file.fileSize.toString(),
      },
    });
  } catch (error: any) {
    console.error('Download file error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to download file' },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(handleDownloadFile);

