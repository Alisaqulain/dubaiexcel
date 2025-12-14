import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Employee from '@/models/Employee';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = (page - 1) * limit;

    const employees = await Employee.find()
      .sort({ employee_id: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Employee.countDocuments();

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
    console.error('Fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch employees' },
      { status: 500 }
    );
  }
}

