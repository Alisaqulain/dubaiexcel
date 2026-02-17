import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import PickedTemplateRow from '@/models/PickedTemplateRow';
import Employee from '@/models/Employee';
import { removeRowFromPreviousPickerFiles } from '@/lib/removeRowFromPickerFiles';
import mongoose from 'mongoose';

/**
 * POST /api/admin/emp-pick/assign
 * Admin assigns a template row to an employee (creates or overwrites the pick).
 * Body: { formatId: string, rowIndex: number, employeeId: string }
 */
async function handleAssign(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const body = await req.json().catch(() => ({}));
    const formatId = body.formatId;
    const rowIndex =
      typeof body.rowIndex === 'number' ? body.rowIndex : parseInt(body.rowIndex, 10);
    const employeeId = body.employeeId;

    if (!formatId || (typeof rowIndex !== 'number' || isNaN(rowIndex) || rowIndex < 0)) {
      return NextResponse.json(
        { error: 'formatId and rowIndex (number >= 0) are required' },
        { status: 400 }
      );
    }
    if (!employeeId) {
      return NextResponse.json(
        { error: 'employeeId is required' },
        { status: 400 }
      );
    }

    const employee = await Employee.findById(employeeId).select('empId name').lean();
    if (!employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      );
    }

    const formatIdObj = new mongoose.Types.ObjectId(formatId);
    const pickedByObj = new mongoose.Types.ObjectId(employeeId);

    const existing = await PickedTemplateRow.findOne({
      formatId: formatIdObj,
      rowIndex,
    }).lean();
    const previousPickerId =
      existing?.pickedBy
        ? new mongoose.Types.ObjectId(String((existing as any).pickedBy))
        : null;

    await PickedTemplateRow.findOneAndUpdate(
      { formatId: formatIdObj, rowIndex },
      {
        formatId: formatIdObj,
        rowIndex,
        pickedBy: pickedByObj,
        empId: (employee as any).empId || '',
        empName: (employee as any).name || 'Unknown',
      },
      { upsert: true, new: true }
    );

    if (
      previousPickerId &&
      previousPickerId.toString() !== employeeId
    ) {
      await removeRowFromPreviousPickerFiles(formatIdObj, rowIndex, previousPickerId);
    }

    return NextResponse.json({
      success: true,
      message: `Row ${rowIndex + 1} assigned to ${(employee as any).name} (${(employee as any).empId}).`,
    });
  } catch (error: any) {
    console.error('Admin assign pick error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to assign' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return withAdmin(handleAssign)(req);
}
