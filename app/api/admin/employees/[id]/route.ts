import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import Employee from '@/models/Employee';

// GET /api/admin/employees/:id - Get employee by ID
async function handleGetEmployee(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();

    const params = await Promise.resolve(context.params);
    const employee = await Employee.findById(params.id).lean();

    if (!employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: employee,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to get employee' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/employees/:id - Update employee
async function handleUpdateEmployee(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();

    const params = await Promise.resolve(context.params);
    const body = await req.json();
    const { empId, name, site, siteType, role, department, active } = body;

    const employee = await Employee.findById(params.id);
    if (!employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      );
    }

    // Update fields
    if (empId !== undefined) employee.empId = empId;
    if (name !== undefined) employee.name = name;
    if (site !== undefined) employee.site = site;
    if (siteType !== undefined) employee.siteType = siteType;
    if (role !== undefined) employee.role = role;
    if (department !== undefined) employee.department = department;
    if (active !== undefined) employee.active = active;

    await employee.save();

    return NextResponse.json({
      success: true,
      data: employee,
      message: 'Employee updated successfully',
    });
  } catch (error: any) {
    console.error('Update employee error:', error);
    if (error.code === 11000) {
      return NextResponse.json(
        { error: 'Employee ID already exists' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Failed to update employee' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/employees/:id - Delete employee
async function handleDeleteEmployee(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();

    const params = await Promise.resolve(context.params);
    const employee = await Employee.findByIdAndDelete(params.id);

    if (!employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Employee deleted successfully',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to delete employee' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleGetEmployee(authReq, context);
  });
  return handler(req);
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleUpdateEmployee(authReq, context);
  });
  return handler(req);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleDeleteEmployee(authReq, context);
  });
  return handler(req);
}



