import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin } from '@/lib/middleware';
import UploadLog from '@/models/UploadLog';

// GET /api/admin/uploads - Get all upload logs
async function handleGetUploads(req: NextRequest) {
  try {
    await connectDB();

    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;
    const userId = searchParams.get('userId');

    const query: any = {};
    if (userId) {
      query.userId = userId;
    }

    const [uploads, total] = await Promise.all([
      UploadLog.find(query)
        .populate('userId', 'fullName email role')
        .sort({ uploadTime: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UploadLog.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: uploads,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Get uploads error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch upload logs' },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(handleGetUploads);


















