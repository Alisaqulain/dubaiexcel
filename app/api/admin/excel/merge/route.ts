import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import ExcelUpload from '@/models/ExcelUpload';
import { logActivity } from '@/lib/activityLogger';

/**
 * POST /api/admin/excel/merge
 * Merges multiple Excel uploads into consolidated dataset
 */
async function handleMergeExcel(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const body = await req.json();
    const { uploadIds, projectId } = body;

    if (!uploadIds || !Array.isArray(uploadIds) || uploadIds.length === 0) {
      return NextResponse.json(
        { error: 'Upload IDs array is required' },
        { status: 400 }
      );
    }

    // Get upload records
    const uploads = await ExcelUpload.find({
      _id: { $in: uploadIds },
      status: 'PROCESSED',
      merged: false,
    });

    if (uploads.length === 0) {
      return NextResponse.json(
        { error: 'No valid uploads found to merge' },
        { status: 400 }
      );
    }

    // Mark uploads as merged
    const updateResult = await ExcelUpload.updateMany(
      { _id: { $in: uploadIds } },
      { 
        merged: true,
        mergedAt: new Date(),
        status: 'MERGED'
      }
    );

    // Log activity
    await logActivity({
      userId: req.user?.userId || '',
      userEmail: req.user?.email || '',
      action: 'MERGE',
      entityType: 'EXCEL',
      description: `Merged ${uploads.length} Excel uploads`,
      projectId,
      metadata: { uploadIds, count: uploads.length },
    });

    return NextResponse.json({
      success: true,
      message: `Successfully merged ${updateResult.modifiedCount} uploads`,
      data: {
        merged: updateResult.modifiedCount,
      },
    });
  } catch (error: any) {
    console.error('Merge error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to merge Excel files' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/excel/merge
 * Get list of uploads available for merging
 */
async function handleGetMergeableUploads(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const searchParams = req.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');
    const labourType = searchParams.get('labourType');

    const query: any = {
      status: 'PROCESSED',
      merged: false,
    };

    if (projectId) {
      query.projectId = projectId;
    }

    if (labourType) {
      query.labourType = labourType;
    }

    const uploads = await ExcelUpload.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('uploadedBy', 'email name')
      .lean();

    return NextResponse.json({
      success: true,
      data: uploads,
    });
  } catch (error: any) {
    console.error('Get mergeable uploads error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get uploads' },
      { status: 500 }
    );
  }
}

export const POST = withAdmin(handleMergeExcel);
export const GET = withAdmin(handleGetMergeableUploads);





