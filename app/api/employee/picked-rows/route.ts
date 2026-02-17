import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import PickedTemplateRow from '@/models/PickedTemplateRow';
import mongoose from 'mongoose';

/**
 * GET /api/employee/picked-rows?formatId=xxx
 * Returns which template rows are already picked by other employees (so current user can lock them).
 * Response: { success, data: { pickedRows: Record<string, { empId, empName }> } }
 * Keys of pickedRows are string row indices; values exclude the current user's own picks so they can still see their rows as pickable if needed, or we include all and frontend disables only others' picks.
 * We include all picks; frontend disables Pick for rows where pickedBy !== currentUser.
 */
async function handleGetPickedRows(req: AuthenticatedRequest) {
  try {
    await connectDB();
    const userId = req.user?.userId;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url || '', 'http://localhost');
    const formatId = searchParams.get('formatId');
    if (!formatId) {
      return NextResponse.json({ error: 'formatId is required' }, { status: 400 });
    }

    const formatIdObj = new mongoose.Types.ObjectId(formatId);
    const picks = await PickedTemplateRow.find({ formatId: formatIdObj }).lean();

    const userIdStr = String(userId);
    const pickedRows: Record<string, { empId: string; empName: string }> = {};
    const myPickedRows: number[] = [];
    picks.forEach((p: any) => {
      if (p.pickedBy && p.pickedBy.toString() === userIdStr) {
        myPickedRows.push(p.rowIndex);
      } else {
        pickedRows[String(p.rowIndex)] = {
          empId: p.empId || '',
          empName: p.empName || 'Unknown',
        };
      }
    });
    myPickedRows.sort((a, b) => a - b);

    return NextResponse.json({
      success: true,
      data: { pickedRows, myPickedRows },
    });
  } catch (error: any) {
    console.error('Get picked rows error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get picked rows' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/employee/picked-rows
 * Unpick a row (release it so others can pick). Body: { formatId: string, rowIndex: number }
 * Only allowed for rows the current user has picked.
 */
async function handleDeletePickedRow(req: AuthenticatedRequest) {
  try {
    await connectDB();
    const userId = req.user?.userId;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const formatId = body.formatId;
    const rowIndex = typeof body.rowIndex === 'number' ? body.rowIndex : parseInt(body.rowIndex, 10);
    if (!formatId || (typeof rowIndex !== 'number' || isNaN(rowIndex) || rowIndex < 0)) {
      return NextResponse.json({ error: 'formatId and rowIndex (number) are required' }, { status: 400 });
    }
    const formatIdObj = new mongoose.Types.ObjectId(formatId);
    const userIdObj = new mongoose.Types.ObjectId(userId as string);
    const deleted = await PickedTemplateRow.findOneAndDelete({
      formatId: formatIdObj,
      rowIndex,
      pickedBy: userIdObj,
    });
    if (!deleted) {
      return NextResponse.json({ error: 'Row not found or you did not pick this row' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { rowIndex } });
  } catch (error: any) {
    console.error('Unpick row error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to unpick row' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  _context: unknown
) {
  const handler = withAuth((authReq: AuthenticatedRequest) => handleGetPickedRows(authReq));
  return handler(req);
}

export async function DELETE(req: NextRequest) {
  const handler = withAuth((authReq: AuthenticatedRequest) => handleDeletePickedRow(authReq));
  return handler(req);
}
