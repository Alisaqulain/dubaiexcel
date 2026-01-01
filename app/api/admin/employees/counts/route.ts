import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withViewAccess } from '@/lib/middleware';
import Employee from '@/models/Employee';

async function handleGetEmployeeCounts(req: NextRequest) {
  try {
    await connectDB();

    const [activeCount, inactiveCount, totalCount] = await Promise.all([
      Employee.countDocuments({ active: true }),
      Employee.countDocuments({ active: false }),
      Employee.countDocuments(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        active: activeCount,
        inactive: inactiveCount,
        total: totalCount,
      },
    });
  } catch (error: any) {
    console.error('Get employee counts error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get employee counts' },
      { status: 500 }
    );
  }
}

export const GET = withViewAccess(handleGetEmployeeCounts);



