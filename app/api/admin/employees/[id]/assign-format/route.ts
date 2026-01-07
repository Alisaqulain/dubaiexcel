import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import ExcelFormat from '@/models/ExcelFormat';
import mongoose from 'mongoose';

/**
 * POST /api/admin/employees/[id]/assign-format
 * Assign an Excel format to an employee
 */
async function handleAssignFormat(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();

    const params = await Promise.resolve(context.params);
    const employeeId = params.id;
    const body = await req.json();
    const { formatId, assign } = body; // assign: true to assign, false to unassign

    if (!employeeId || !formatId) {
      return NextResponse.json(
        { error: 'Employee ID and Format ID are required' },
        { status: 400 }
      );
    }

    // Get the format
    const format = await ExcelFormat.findById(formatId);
    if (!format) {
      return NextResponse.json(
        { error: 'Format not found' },
        { status: 404 }
      );
    }

    const employeeObjectId = new mongoose.Types.ObjectId(employeeId);

    if (assign) {
      // Assign format to employee
      // Ensure assignedToType is 'employee'
      if (format.assignedToType !== 'employee') {
        format.assignedToType = 'employee';
      }

      // Add employee to assignedTo array if not already there
      const assignedTo = format.assignedTo || [];
      if (!assignedTo.some((id: any) => id.toString() === employeeId)) {
        assignedTo.push(employeeObjectId);
        format.assignedTo = assignedTo;
        await format.save();
      }
    } else {
      // Unassign format from employee
      const assignedTo = format.assignedTo || [];
      format.assignedTo = assignedTo.filter((id: any) => id.toString() !== employeeId);
      await format.save();
    }

    return NextResponse.json({
      success: true,
      message: assign ? 'Format assigned successfully' : 'Format unassigned successfully',
      data: {
        formatId: format._id,
        formatName: format.name,
        assigned: assign,
      },
    });
  } catch (error: any) {
    console.error('Assign format error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to assign format' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleAssignFormat(authReq, context);
  });
  return handler(req);
}

