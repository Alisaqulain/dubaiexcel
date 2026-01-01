import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import Employee from '@/models/Employee';

// POST /api/admin/employees/:id/toggle-active - Toggle employee active status
async function handleToggleActive(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();

    const params = await Promise.resolve(context.params);
    const employee = await Employee.findById(params.id);

    if (!employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      );
    }

    employee.active = !employee.active;
    await employee.save();

    return NextResponse.json({
      success: true,
      data: {
        active: employee.active,
      },
      message: `Employee ${employee.active ? 'activated' : 'deactivated'} successfully`,
    });
  } catch (error: any) {
    console.error('Toggle active error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to toggle employee status' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleToggleActive(authReq, context);
  });
  return handler(req);
}



