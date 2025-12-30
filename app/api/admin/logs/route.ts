import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import ActivityLog from '@/models/ActivityLog';

/**
 * GET /api/admin/logs
 * Get activity logs with filtering
 */
async function handleGetLogs(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;
    const userId = searchParams.get('userId');
    const projectId = searchParams.get('projectId');
    const action = searchParams.get('action');
    const entityType = searchParams.get('entityType');

    const query: any = {};

    if (userId) {
      query.userId = userId;
    }

    if (projectId) {
      query.projectId = projectId;
    }

    if (action) {
      query.action = action;
    }

    if (entityType) {
      query.entityType = entityType;
    }

    const [logs, total] = await Promise.all([
      ActivityLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'email name')
        .lean(),
      ActivityLog.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Get logs error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get logs' },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(handleGetLogs);

