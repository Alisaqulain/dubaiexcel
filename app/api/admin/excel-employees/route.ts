import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import ExcelEmployee from '@/models/ExcelEmployee';

/**
 * GET /api/admin/excel-employees
 * Get all Excel employees (dummy data)
 */
async function handleGetExcelEmployees(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const employees = await ExcelEmployee.find()
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: employees,
      count: employees.length,
    });
  } catch (error: any) {
    console.error('Get Excel employees error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get Excel employees' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/excel-employees
 * Delete all Excel employees
 */
async function handleDeleteAllExcelEmployees(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const result = await ExcelEmployee.deleteMany({});

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} Excel employees`,
      deletedCount: result.deletedCount,
    });
  } catch (error: any) {
    console.error('Delete all Excel employees error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete Excel employees' },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(handleGetExcelEmployees);
export const DELETE = withAdmin(handleDeleteAllExcelEmployees);








