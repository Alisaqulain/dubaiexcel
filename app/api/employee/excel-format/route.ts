import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import ExcelFormat from '@/models/ExcelFormat';
import FormatTemplateData from '@/models/FormatTemplateData';
import mongoose from 'mongoose';

/**
 * GET /api/employee/excel-format
 * Get the first Excel format assigned to the current user/employee
 */
async function handleGetMyFormat(req: AuthenticatedRequest) {
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

    // Get format assigned to this user/employee
    // Formats can be assigned:
    // 1. To 'all' (assignedToType === 'all')
    // 2. To specific users (assignedToType === 'user' and userId in assignedTo)
    // 3. To specific employees (assignedToType === 'employee' and userId in assignedTo)
    const query: any = {
      active: true,
      assignedToType: { $ne: 'none' }, // Exclude 'none' type formats
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

    const format = await ExcelFormat.findOne(query)
      .select('name description columns assignedToType')
      .sort({ name: 1 })
      .lean();

    if (!format) {
      return NextResponse.json(
        { success: false, error: 'No format assigned to you. Please contact administrator to assign a format.' },
        { status: 404 }
      );
    }

    // Get template data if exists (limit rows to avoid lag - max 250 for initial load)
    const templateLimit = 250;
    const templateData = await FormatTemplateData.findOne({ formatId: format._id })
      .select('rows')
      .lean();

    const responseData: any = { ...format };
    if (templateData && templateData.rows) {
      const allRows = templateData.rows as any[];
      responseData.templateRowCount = allRows.length;
      responseData.templateRows = allRows.length > templateLimit
        ? allRows.slice(0, templateLimit)
        : allRows;
    }

    return NextResponse.json({
      success: true,
      data: responseData,
    });
  } catch (error: any) {
    console.error('Get my format error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get format' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handleGetMyFormat);
