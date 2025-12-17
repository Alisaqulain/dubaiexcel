import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, withViewAccess, AuthenticatedRequest } from '@/lib/middleware';
import Employee from '@/models/Employee';

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
    const { empId, name, site, siteType, role, department, active } = body;

    if (!empId || !name || !site || !role) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const employee = await Employee.create({
      empId,
      name,
      site,
      siteType: siteType || 'OTHER',
      role,
      department,
      active: active !== undefined ? active : true,
    });

    return NextResponse.json({
      success: true,
      data: employee,
    });
  } catch (error: any) {
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

