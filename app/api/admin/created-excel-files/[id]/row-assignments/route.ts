import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import CreatedExcelFile from '@/models/CreatedExcelFile';
import User from '@/models/User';

/**
 * GET /api/admin/created-excel-files/[id]/row-assignments
 * Get current row assignments and row count for the file.
 */
async function handleGetRowAssignments(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();
    const params = await Promise.resolve(context.params);
    const fileId = params.id;
    if (!fileId) {
      return NextResponse.json({ error: 'File ID is required' }, { status: 400 });
    }
    const file = await CreatedExcelFile.findById(fileId).select('rowCount rowAssignments').lean();
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    const rowAssignments = (file as any).rowAssignments || [];
    const userIds = Array.from(new Set(rowAssignments.map((a: any) => a.userId?.toString()).filter(Boolean)));
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } }).select('name email').lean()
      : [];
    const userMap = Object.fromEntries((users as any[]).map((u) => [u._id.toString(), u]));
    const assignmentsWithUser = rowAssignments.map((a: any) => ({
      userId: a.userId?.toString(),
      startRow: a.startRow,
      endRow: a.endRow,
      userName: userMap[a.userId?.toString()]?.name,
      userEmail: userMap[a.userId?.toString()]?.email,
    }));
    return NextResponse.json({
      success: true,
      data: {
        rowCount: (file as any).rowCount ?? 0,
        assignments: assignmentsWithUser,
      },
    });
  } catch (error: any) {
    console.error('Get row assignments error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get row assignments' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/created-excel-files/[id]/row-assignments
 * Set row range assignments for users. Each user will only see their assigned rows when viewing this file.
 * Body: { assignments: [{ userId: string, startRow: number, endRow: number }] }
 * Rows are 1-based (row 1 = first data row).
 */
async function handleSetRowAssignments(
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

    const file = await CreatedExcelFile.findById(fileId).select('rowCount rowAssignments');
    if (!file) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    const body = await req.json();
    const assignments = Array.isArray(body.assignments) ? body.assignments : [];

    const rowCount = file.rowCount ?? 0;
    const normalized = assignments.map((a: { userId: string; startRow: number; endRow: number }) => {
      let start = Math.max(1, Math.min(Number(a.startRow) || 1, rowCount));
      let end = Math.max(1, Math.min(Number(a.endRow) || 1, rowCount));
      if (start > end) [start, end] = [end, start];
      return {
        userId: a.userId,
        startRow: start,
        endRow: end,
      };
    });

    await CreatedExcelFile.updateOne(
      { _id: fileId },
      { $set: { rowAssignments: normalized } }
    );

    return NextResponse.json({
      success: true,
      data: { assignments: normalized },
      message: 'Row assignments updated',
    });
  } catch (error: any) {
    console.error('Set row assignments error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to set row assignments' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleGetRowAssignments(authReq, context);
  });
  return handler(req);
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleSetRowAssignments(authReq, context);
  });
  return handler(req);
}
