import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import ExcelFormat from '@/models/ExcelFormat';
import mongoose from 'mongoose';

/**
 * GET /api/employee/excel-formats
 * Get Excel formats assigned to the current user
 */
async function handleGetMyFormats(req: AuthenticatedRequest) {
  try {
    await connectDB();

    if (!req.user?.userId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId as string);
    const userRole = req.user?.role;

    // Get formats assigned to this user/employee
    // Formats can be assigned:
    // 1. To 'all' (assignedToType === 'all')
    // 2. To specific users (assignedToType === 'user' and userId in assignedTo)
    // 3. To specific employees (assignedToType === 'employee' and userId in assignedTo)
    const query: any = {
      active: true,
      $or: [
        { assignedToType: 'all' },
      ],
    };

    if (userRole === 'employee') {
      query.$or.push({
        assignedToType: 'employee',
        assignedTo: userId,
      });
    } else {
      query.$or.push({
        assignedToType: 'user',
        assignedTo: userId,
      });
    }

    const formats = await ExcelFormat.find(query)
      .select('name description columns assignedToType')
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: formats,
    });
  } catch (error: any) {
    console.error('Get my formats error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get formats' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handleGetMyFormats);




