import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, withViewAccess, AuthenticatedRequest } from '@/lib/middleware';
import Employee from '@/models/Employee';
import bcrypt from 'bcryptjs';

async function handleGetEmployees(req: NextRequest) {
  try {
    await connectDB();

    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;

    const [employees, total] = await Promise.all([
      Employee.find().sort({ empId: 1 }).skip(skip).limit(limit).lean(),
      Employee.countDocuments(),
    ]);

    return NextResponse.json({
      success: true,
      data: employees,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch employees' },
      { status: 500 }
    );
  }
}

async function handleCreateEmployee(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const body = await req.json();
    const { empId, name, site, siteType, role, department, active, password, labourType } = body;

    if (!empId || !name || !site || !role) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Prepare employee data
    const employeeData: any = {
      empId,
      name,
      site,
      siteType: siteType || 'OTHER',
      role,
      department,
      active: active !== undefined ? active : true,
      labourType: labourType || 'OUR_LABOUR',
    };

    // Hash password if provided
    if (password) {
      const salt = await bcrypt.genSalt(10);
      employeeData.password = await bcrypt.hash(password, salt);
    }

    const employee = await Employee.create(employeeData);

    // Remove password from response - convert to plain object
    const employeeResponse: any = JSON.parse(JSON.stringify(employee));
    delete employeeResponse.password;

    return NextResponse.json({
      success: true,
      data: employeeResponse,
    });
  } catch (error: any) {
    console.error('Create employee error:', error);
    // Handle duplicate key error (MongoDB error code 11000)
    if (error.code === 11000) {
      const body = await req.json().catch(() => ({}));
      const empId = body.empId || 'provided';
      return NextResponse.json(
        { error: `Employee ID "${empId}" already exists. Please use a unique Employee ID.` },
        { status: 400 }
      );
    }
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors || {}).map((err: any) => err.message).join(', ');
      return NextResponse.json(
        { error: `Validation error: ${validationErrors}` },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Failed to create employee' },
      { status: 500 }
    );
  }
}

// GET allows view access for all authenticated users (admin, super-admin, e1-user)
export const GET = withViewAccess(handleGetEmployees);
// POST requires admin or super-admin
export const POST = withAdmin(handleCreateEmployee);

