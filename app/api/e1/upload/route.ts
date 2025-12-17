import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { parseMultipleFiles } from '@/lib/excelParser';
import AttendanceRaw from '@/models/AttendanceRaw';
import Upload from '@/models/Upload';
import { randomUUID } from 'crypto';

// Parse FormData files
async function parseFormData(request: NextRequest): Promise<Array<{ buffer: Buffer; filename: string }>> {
  const formData = await request.formData();
  const files: Array<{ buffer: Buffer; filename: string }> = [];

  // Get all files (can be single or multiple)
  const fileEntries = formData.getAll('files');
  for (const file of fileEntries) {
    if (file instanceof File) {
      const arrayBuffer = await file.arrayBuffer();
      files.push({
        buffer: Buffer.from(arrayBuffer),
        filename: file.name,
      });
    }
  }

  return files;
}

async function handleUpload(req: AuthenticatedRequest) {
  try {
    await connectDB();

    if (!req.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse uploaded files
    const files = await parseFormData(req);

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files uploaded' },
        { status: 400 }
      );
    }

    const uploadResults = [];

    for (const file of files) {
      const fileId = randomUUID();
      
      try {
        // Parse Excel file
        const parsedData = parseMultipleFiles([file]);
        const rows = parsedData[0]?.rows || [];

        // Create upload record
        const upload = await Upload.create({
          fileId,
          filename: file.filename,
          uploaderId: req.user.userId as any,
          parsedRowsCount: rows.length,
          status: 'parsed',
        });

        // Create attendance raw record
        const attendanceRaw = await AttendanceRaw.create({
          fileId,
          uploaderId: req.user.userId as any,
          filename: file.filename,
          rows: rows.map(row => ({
            ...row,
            raw: (row as any).raw || {},
          })),
          parsedRowsCount: rows.length,
          status: 'processed',
        });

        uploadResults.push({
          fileId,
          filename: file.filename,
          rowsCount: rows.length,
          status: 'success',
        });
      } catch (error: any) {
        console.error(`Error processing ${file.filename}:`, error);
        
        // Create error record
        await Upload.create({
          fileId: randomUUID(),
          filename: file.filename,
          uploaderId: req.user.userId as any,
          parsedRowsCount: 0,
          status: 'error',
          errorMessage: error.message,
        });

        uploadResults.push({
          filename: file.filename,
          status: 'error',
          error: error.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${uploadResults.length} file(s)`,
      results: uploadResults,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Upload failed' },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handleUpload);

