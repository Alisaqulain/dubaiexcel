import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { withAdmin, AuthenticatedRequest } from '@/lib/middleware';
import FormatTemplateData from '@/models/FormatTemplateData';
import ExcelFormat from '@/models/ExcelFormat';

/**
 * POST /api/admin/excel-formats/save-template-data
 * Save template row data for an Excel format
 */
async function handleSaveTemplateData(req: AuthenticatedRequest) {
  try {
    await connectDB();

    const body = await req.json();
    const { formatId, rows } = body;

    if (!formatId) {
      return NextResponse.json(
        { error: 'Format ID is required' },
        { status: 400 }
      );
    }

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json(
        { error: 'Rows must be an array' },
        { status: 400 }
      );
    }

    // Verify format exists
    const format = await ExcelFormat.findById(formatId);
    if (!format) {
      return NextResponse.json(
        { error: 'Format not found' },
        { status: 404 }
      );
    }

    // Save or update template data
    const templateData = await FormatTemplateData.findOneAndUpdate(
      { formatId },
      {
        formatId,
        rows,
        uploadedBy: req.user?.userId,
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({
      success: true,
      data: {
        formatId: templateData.formatId,
        rowsCount: templateData.rows.length,
      },
      message: `Successfully saved ${rows.length} rows as template data`,
    });
  } catch (error: any) {
    console.error('Save template data error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save template data' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const handler = withAdmin(async (authReq: AuthenticatedRequest) => {
    return handleSaveTemplateData(authReq);
  });
  return handler(req);
}
