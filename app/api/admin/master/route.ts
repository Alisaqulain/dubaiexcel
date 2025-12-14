import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin } from '@/lib/middleware';
import AttendanceMaster from '@/models/AttendanceMaster';
import Employee from '@/models/Employee';

async function handleGetMaster(req: NextRequest) {
  try {
    await connectDB();

    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      AttendanceMaster.find()
        .sort({ date: -1, site: 1, empId: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AttendanceMaster.countDocuments(),
    ]);

    // Get employee details
    const empIds = Array.from(new Set(records.map(r => r.empId)));
    const employees = await Employee.find({ empId: { $in: empIds } }).lean();
    const employeeMap = new Map(employees.map(emp => [emp.empId, emp]));

    const enrichedRecords = records.map(record => ({
      ...record,
      employee: employeeMap.get(record.empId) || null,
    }));

    return NextResponse.json({
      success: true,
      data: enrichedRecords,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Get master error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch master data' },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(handleGetMaster);

