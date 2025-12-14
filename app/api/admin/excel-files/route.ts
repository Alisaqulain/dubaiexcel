import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import ExcelFile from '@/models/ExcelFile';
import User from '@/models/User';

async function handleGetExcelFiles(req: AuthenticatedRequest) {
  try {
    await connectDB();

    if (!req.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const fileType = searchParams.get('fileType'); // 'uploaded' | 'created' | null (all)
    const status = searchParams.get('status') || 'active';

    // Build query
    const query: any = { status };
    if (fileType) {
      query.fileType = fileType;
    }

    // Get all Excel files with user information
    const files = await ExcelFile.find(query)
      .populate('createdBy', 'email fullName')
      .sort({ uploadedAt: -1 })
      .lean();

    // Format response
    const formattedFiles = files.map((file: any) => ({
      fileId: file.fileId,
      filename: file.filename,
      fileType: file.fileType,
      fileSize: file.fileSize,
      rowCount: file.rowCount,
      status: file.status,
      uploadedAt: file.uploadedAt,
      createdBy: {
        email: file.createdBy?.email || 'Unknown',
        fullName: file.createdBy?.fullName || 'Unknown',
      },
    }));

    return NextResponse.json({
      success: true,
      files: formattedFiles,
      total: formattedFiles.length,
    });
  } catch (error: any) {
    console.error('Get Excel files error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get Excel files' },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(handleGetExcelFiles);


