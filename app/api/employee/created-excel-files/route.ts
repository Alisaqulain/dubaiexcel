import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import CreatedExcelFile from '@/models/CreatedExcelFile';

/**
 * GET /api/employee/created-excel-files
 * Get all Excel files created by the current employee
 */
async function handleGetMyCreatedFiles(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const userId = req.user?.userId;
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get files created by this employee/user
    // Exclude merged files (employees should only see their own original files)
    const files = await CreatedExcelFile.find({
      createdBy: userId,
      isMerged: { $ne: true }, // Exclude merged files
    })
      .select('-fileData') // Don't include file data in list (too large)
      .sort({ createdAt: -1 }) // Newest first
      .lean();

    return NextResponse.json({
      success: true,
      data: files,
    });
  } catch (error: any) {
    console.error('Get my created files error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get created files' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handleGetMyCreatedFiles);









