import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import PickedTemplateRow from '@/models/PickedTemplateRow';
import { removeRowFromPreviousPickerFiles } from '@/lib/removeRowFromPickerFiles';
import mongoose from 'mongoose';

/**
 * DELETE /api/admin/emp-pick/release
 * Admin releases a row (removes the pick so any employee can pick it again).
 * Body: { formatId: string, rowIndex: number }
 */
async function handleRelease(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const body = await req.json().catch(() => ({}));
    const formatId = body.formatId;
    const rowIndex =
      typeof body.rowIndex === 'number' ? body.rowIndex : parseInt(body.rowIndex, 10);

    if (!formatId || (typeof rowIndex !== 'number' || isNaN(rowIndex) || rowIndex < 0)) {
      return NextResponse.json(
        { error: 'formatId and rowIndex (number >= 0) are required' },
        { status: 400 }
      );
    }

    const formatIdObj = new mongoose.Types.ObjectId(formatId);
    const deleted = await PickedTemplateRow.findOneAndDelete({
      formatId: formatIdObj,
      rowIndex,
    });

    if (!deleted) {
      return NextResponse.json(
        { success: true, message: 'No pick found for this row (already released)' }
      );
    }

    const previousPickerId = deleted.pickedBy
      ? new mongoose.Types.ObjectId(String(deleted.pickedBy))
      : null;
    if (previousPickerId) {
      await removeRowFromPreviousPickerFiles(formatIdObj, rowIndex, previousPickerId);
    }

    return NextResponse.json({
      success: true,
      message: `Released row ${rowIndex}. Employee "${deleted.empName}" (${deleted.empId}) can no longer hold it; others can pick it. That row was also removed from any files they had saved with it.`,
    });
  } catch (error: any) {
    console.error('Admin release pick error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to release pick' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  return withAdmin(handleRelease)(req);
}
