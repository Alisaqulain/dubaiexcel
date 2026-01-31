import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import ExcelFormat from '@/models/ExcelFormat';
import FormatTemplateData from '@/models/FormatTemplateData';
import mongoose from 'mongoose';

/**
 * GET /api/employee/excel-formats/:id
 * Get a specific Excel format assigned to the current user/employee
 */
async function handleGetFormat(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();

    if (!req.user?.userId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const params = await Promise.resolve(context.params);
    const formatId = params.id;
    const userId = new mongoose.Types.ObjectId(req.user.userId as string);
    const userRole = req.user?.role;

    // Validate ObjectId format
    if (!formatId || formatId.length !== 24) {
      return NextResponse.json(
        { error: 'Invalid format ID' },
        { status: 400 }
      );
    }

    // Get the format
    const format = await ExcelFormat.findById(formatId)
      .select('name description columns assignedToType assignedTo active')
      .lean();

    if (!format) {
      return NextResponse.json(
        { error: 'Format not found' },
        { status: 404 }
      );
    }

    // Check if format is assigned to this user/employee
    const isAssigned = 
      format.active &&
      (format.assignedToType === 'all' ||
       (format.assignedToType === 'user' && userRole !== 'employee' &&
        format.assignedTo?.some((id: any) => id.toString() === userId.toString())) ||
       (format.assignedToType === 'employee' && userRole === 'employee' &&
        format.assignedTo?.some((id: any) => id.toString() === userId.toString())));

    if (!isAssigned) {
      return NextResponse.json(
        { error: 'You do not have access to this format' },
        { status: 403 }
      );
    }

    // Get template data if exists
    const templateData = await FormatTemplateData.findOne({ formatId: format._id })
      .select('rows')
      .lean();

    // Include template rows in response
    const responseData: any = { ...format };
    if (templateData && templateData.rows) {
      responseData.templateRows = templateData.rows;
    }

    return NextResponse.json({
      success: true,
      data: responseData,
    });
  } catch (error: any) {
    console.error('Get format error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get format' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAuth(async (authReq: AuthenticatedRequest) => {
    return handleGetFormat(authReq, context);
  });
  return handler(req);
}


















