import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import ExcelUpload from '@/models/ExcelUpload';

/**
 * GET /api/employee/uploads
 * Get all uploads by the current employee
 */
async function handleGetMyUploads(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const userId = req.user?.userId;
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get uploads by the current user/employee ID
    // The uploadedBy field stores the ObjectId of the user/employee who uploaded
    const uploads = await ExcelUpload.find({
      uploadedBy: userId
    })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: uploads,
    });
  } catch (error: any) {
    console.error('Get uploads error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get uploads' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handleGetMyUploads);

