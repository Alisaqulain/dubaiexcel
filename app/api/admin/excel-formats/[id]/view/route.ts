import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import ExcelFormat from '@/models/ExcelFormat';
import FormatTemplateData from '@/models/FormatTemplateData';

/**
 * GET /api/admin/excel-formats/[id]/view
 * View format template data (Admin only) - returns template rows and columns
 */
async function handleViewFormat(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    await connectDB();

    const params = await Promise.resolve(context.params);
    const formatId = params.id;

    if (!formatId) {
      return NextResponse.json(
        { error: 'Format ID is required' },
        { status: 400 }
      );
    }

    // Get format with columns
    const format = await ExcelFormat.findById(formatId).lean();

    if (!format) {
      return NextResponse.json(
        { error: 'Format not found' },
        { status: 404 }
      );
    }

    // Get template data if exists
    const templateData = await FormatTemplateData.findOne({ formatId }).lean();

    return NextResponse.json({
      success: true,
      data: {
        id: format._id,
        name: format.name,
        description: format.description,
        columns: format.columns.sort((a: any, b: any) => a.order - b.order),
        rows: templateData?.rows || [],
        rowCount: templateData?.rows?.length || 0,
        createdAt: format.createdAt,
        updatedAt: format.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('View format error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to view format' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleViewFormat(authReq, context);
  });
  return handler(req);
}
