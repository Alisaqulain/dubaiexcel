import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import ExcelFormat from '@/models/ExcelFormat';

/**
 * GET /api/admin/excel-formats
 * Get all Excel formats
 */
async function handleGetFormats(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const formats = await ExcelFormat.find()
      .populate('createdBy', 'email name')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: formats,
    });
  } catch (error: any) {
    console.error('Get formats error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get formats' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/excel-formats
 * Create a new Excel format
 */
async function handleCreateFormat(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const body = await req.json();
    const { name, description, columns, assignedTo, assignedToType } = body;

    if (!name || !columns || !Array.isArray(columns) || columns.length === 0) {
      return NextResponse.json(
        { error: 'Name and columns are required' },
        { status: 400 }
      );
    }

    // Validate columns
    const validatedColumns = columns.map((col: any, index: number) => ({
      name: col.name,
      type: col.type || 'text',
      required: col.required || false,
      validation: col.validation || {},
      order: col.order !== undefined ? col.order : index,
    }));

    const format = await ExcelFormat.create({
      name,
      description,
      columns: validatedColumns,
      assignedTo: assignedTo || [],
      assignedToType: assignedToType || 'all',
      createdBy: req.user?.userId,
      active: true,
    });

    return NextResponse.json({
      success: true,
      data: format,
      message: 'Excel format created successfully',
    });
  } catch (error: any) {
    console.error('Create format error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create format' },
      { status: 500 }
    );
  }
}

export const GET = withAdmin(handleGetFormats);
export const POST = withAdmin(handleCreateFormat);







